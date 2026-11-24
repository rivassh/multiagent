'use strict';

/**
 * dashboard/server.js
 * Node.js built-in HTTP API for the GitOps Kanban dashboard.
 *
 * Endpoints:
 *   GET    /api/tasks                      -> deduplicated tasks with run state, source, conflict flags
 *   POST   /api/tasks/:id/transition       -> { to_status, role, agent_id, evidence, confirm }
 *   GET    /api/tasks/:id/runs             -> run summary/history for a task
 *   GET    /api/runs/:id/logs              -> last N log lines from /var/log/gitops/<run-id>.log
 *   GET    /healthz                        -> process, Git, worker heartbeat
 *
 * Mutating endpoints follow the protocol:
 *   1. Re-read state from disk
 *   2. Validate transition, role separation, dependencies, evidence
 *   3. Acquire lease (120s TTL)
 *   4. Apply mutation
 *   5. Append state/team_log.md
 *   6. Commit + push to origin/master
 *   7. Release lease
 *   8. Return updated task
 *
 * The git runner is injectable for tests (default: real git via child_process).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { KanbanStore } = require('../state/kanban_store');
const { KanbanTransitions } = require('../state/kanban_transitions');
const { KanbanLeases, PARTITIONS } = require('../state/kanban_leases');

const DEFAULT_STATE_ROOT = path.join(__dirname, '..', 'state');
const DEFAULT_PORT = 8080;
const DEFAULT_COORDINATION_BRANCH = 'master';
const LOG_ROOT = process.env.GITOPS_LOG_ROOT || path.join(__dirname, '..', '..', 'var', 'log', 'gitops');
const TEAM_LOG = path.join(DEFAULT_STATE_ROOT, 'team_log.md');
const DASHBOARD_DIR = path.join(__dirname);

const AGENT_ROLES = new Set(['implementer', 'qa', 'reviewer', 'stage_verifier']);

function partitionNameForTask(taskId) {
  if (/^TASK-\d{3}$/.test(taskId)) return 'sima';
  if (/^TASK-HR-\d{3}$/.test(taskId)) return 'candash';
  if (/^TASK-OMR-\d{3}$/.test(taskId)) return 'shared';
  return 'root';
}

function serveFile(res, filePath, contentType) {
  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

// Minimal git runner (real git). Inject a mock for tests.
function defaultGitRunner({ cwd, args }) {
  const { execSync } = require('child_process');
  return execSync(['git', ...args].join(' '), {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function appendTeamLog(stateRoot, message) {
  fs.mkdirSync(stateRoot, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(path.join(stateRoot, 'team_log.md'), line);
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

class KanbanApi {
  constructor({
    stateRoot = DEFAULT_STATE_ROOT,
    port = DEFAULT_PORT,
    coordinationBranch = DEFAULT_COORDINATION_BRANCH,
    gitRunner = defaultGitRunner,
    yourId = process.env.YOUR_ID || 'agent-dashboard',
  } = {}) {
    this.stateRoot = stateRoot;
    this.port = port;
    this.coordinationBranch = coordinationBranch;
    this.gitRunner = gitRunner;
    this.yourId = yourId;
    this.store = new KanbanStore(stateRoot);
    this.transitions = new KanbanTransitions({ yourId });
    this.leases = new KanbanLeases({
      stateRoot,
      coordinationBranch,
      holder: yourId,
      gitRunner,
    });
    this.workerHeartbeat = { lastSeen: null, activeRuns: 0 };
  }

  setWorkerHeartbeat(lastSeen, activeRuns) {
    this.workerHeartbeat = { lastSeen, activeRuns };
  }

  // Execute a full protocol mutation: validate, lease, apply, commit, push, release.
  async mutate({ taskId, toStatus, role, agentId, evidence = {}, confirm = true }) {
    // 1. Re-read state from disk
    const allTasks = this.store.listTasks();
    this.transitions.setTasks(allTasks);
    this.transitions.setYourId(agentId || this.yourId);

    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
      return { status: 404, body: { error: `Task ${taskId} not found` } };
    }

    // Conflict check
    if (task._conflict) {
      return {
        status: 409,
        body: { error: `Task ${taskId} is in CONFLICT across state files; cannot mutate` },
      };
    }

    // 2. Validate transition, role separation, dependencies, evidence
    let mutation;
    try {
      mutation = this.transitions.validateTransition(task, toStatus, {
        role,
        agentId: agentId || this.yourId,
        evidence,
      });
    } catch (e) {
      return {
        status: 400,
        body: { error: e.message, code: e.code },
      };
    }

    // 3. Acquire lease
    const writeTarget = this.store.resolveWriteTarget(taskId);
    if (writeTarget.conflict) {
      return {
        status: 409,
        body: { error: `Task ${taskId} is in CONFLICT; cannot mutate` },
      };
    }
    const { partition } = writeTarget;

    const leaseResult = this.leases.acquire(partition.name, writeTarget.partition.leaseResource, {
      holder: agentId || this.yourId,
      task_id: taskId,
      role,
    });
    if (!leaseResult.ok) {
      return {
        status: 409,
        body: { error: leaseResult.reason, holder: leaseResult.holder, expiresAt: leaseResult.expiresAt },
      };
    }

    let committed = false;
    try {
      // 4. Apply mutation (in memory; write tasks file below)
      const updated = { ...mutation.task };

      // When an agent role drives the transition, queue the task for the agent worker.
      if (agentId && AGENT_ROLES.has(role)) {
        updated.run_state = 'QUEUED';
        updated.run_role = role;
        updated.run_agent_id = agentId;
        updated.run_requested_at = nowIso();
        updated.run_role = role;
        const branch = `task/${taskId}/run-${crypto.randomBytes(4).toString('hex')}`;
        const worktree = `/worktrees/${partition}/${taskId}/run-${crypto.randomBytes(4).toString('hex')}`;
        updated.branch = branch;
        updated.worktree = worktree;
      }

      // Resolve the target partition's tasks file and write all tasks for that partition.
      // Re-load the partition's tasks from disk, apply the change to the matching task, write back.
      const partData = readJsonFile(writeTarget.partition.tasksPath);
      const partTasks = (partData && partData.tasks) || [];
      const idx = partTasks.findIndex(t => t.id === taskId);
      if (idx === -1) {
        throw new Error(`Task ${taskId} not found in ${partition.name} tasks file`);
      }
      partTasks[idx] = updated;
      const payload = JSON.stringify({ version: 1, tasks: partTasks }, null, 2);

      const tmp = writeTarget.partition.tasksPath + `.tmp.${process.pid}`;
      fs.writeFileSync(tmp, payload, { encoding: 'utf8' });
      fs.renameSync(tmp, writeTarget.partition.tasksPath);

      // 5. Append team_log
      appendTeamLog(
        this.stateRoot,
        `transition ${taskId}: ${task.status} -> ${toStatus} by ${agentId || this.yourId} (role=${role})`
      );

      // 6. Commit and push to origin/master
      const leaseFile = writeTarget.partition.leasesPath;
      this.gitRunner({ cwd: this.stateRoot, args: ['add', writeTarget.partition.tasksPath, leaseFile, 'state/team_log.md'] });
      this.gitRunner({
        cwd: this.stateRoot,
        args: ['commit', '-m', `feat(${taskId}): ${task.status} -> ${toStatus}`],
      });
      try {
        this.gitRunner({ cwd: this.stateRoot, args: ['push', 'origin', this.coordinationBranch] });
      } catch (pushErr) {
        // Push rejected: roll back state mutation and release lease, return 409
        this._rollbackMutation(writeTarget.partition.tasksPath, partData);
        try {
          this.leases.release(partition, writeTarget.partition.leaseResource, { holder: agentId || this.yourId });
        } catch (_) { /* best effort */ }
        return {
          status: 409,
          body: { error: 'Push rejected by remote', detail: pushErr.message },
        };
      }

      committed = true;

      // 7. Release lease
      try {
        this.leases.release(partition, writeTarget.partition.leaseResource, { holder: agentId || this.yourId });
      } catch (_) { /* best effort */ }

      // 8. Return updated task
      return {
        status: 200,
        body: { task: updated, source: writeTarget.partitionName || partition, conflict: false },
      };
    } catch (e) {
      // On any error after lease acquired, try to release lease
      try {
        this.leases.release(partition, writeTarget.partition.leaseResource, { holder: agentId || this.yourId });
      } catch (_) { /* best effort */ }
      if (!committed) {
        // Attempt to restore the tasks file if we wrote it but failed before commit
        try {
          if (partData) {
            const payload = JSON.stringify({ version: 1, tasks: partData.tasks }, null, 2);
            const tmp = writeTarget.partition.tasksPath + `.tmp.${process.pid}`;
            fs.writeFileSync(tmp, payload, { encoding: 'utf8' });
            fs.renameSync(tmp, writeTarget.partition.tasksPath);
          }
        } catch (_) { /* best effort */ }
      }
      return { status: 500, body: { error: e.message } };
    }
  }

  _rollbackMutation(tasksPath, originalData) {
    try {
      if (originalData) {
        const payload = JSON.stringify({ version: 1, tasks: originalData.tasks }, null, 2);
        fs.writeFileSync(tasksPath, payload, { encoding: 'utf8' });
      }
    } catch (_) { /* best effort */ }
  }

  // HTTP request handler
  handle(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    // Static UI serving
    if (pathname === '/' || pathname === '/index.html') {
      serveFile(res, path.join(DASHBOARD_DIR, 'index.html'), 'text/html');
      return;
    }
    if (pathname === '/app.js') {
      serveFile(res, path.join(DASHBOARD_DIR, 'app.js'), 'application/javascript');
      return;
    }
    if (pathname === '/styles.css') {
      serveFile(res, path.join(DASHBOARD_DIR, 'styles.css'), 'text/css');
      return;
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^\/]+)\/transition$/);
    const runsMatch = pathname.match(/^\/api\/tasks\/([^\/]+)\/runs$/);
    const logsMatch = pathname.match(/^\/api\/runs\/([^\/]+)\/logs$/);

    if (pathname === '/api/tasks' && req.method === 'GET') {
      const allTasks = this.store.listTasks();
      jsonResponse(res, 200, { tasks: allTasks, count: allTasks.length });
      return;
    }

    if (taskMatch && req.method === 'POST') {
      readBody(req)
        .then(text => {
          let body;
          try {
            body = text ? JSON.parse(text) : {};
          } catch (e) {
            jsonResponse(res, 400, { error: 'Invalid JSON body' });
            return;
          }
          const { to_status, role, agent_id, evidence, confirm } = body;
          if (!to_status || !role) {
            jsonResponse(res, 400, { error: 'to_status and role are required' });
            return;
          }
          this.mutate({
            taskId: taskMatch[1],
            toStatus: to_status,
            role,
            agentId: agent_id,
            evidence: evidence || {},
            confirm,
          })
            .then(result => jsonResponse(res, result.status, result.body))
            .catch(err => jsonResponse(res, 500, { error: err.message }));
        })
        .catch(err => jsonResponse(res, 500, { error: err.message }));
      return;
    }

    if (runsMatch && req.method === 'GET') {
      const allTasks = this.store.listTasks();
      const task = allTasks.find(t => t.id === runsMatch[1]);
      if (!task) {
        jsonResponse(res, 404, { error: 'Task not found' });
        return;
      }
      const runFields = [
        'run_state', 'run_id', 'run_role', 'run_agent_id', 'run_requested_at',
        'run_started_at', 'run_finished_at', 'branch', 'worktree', 'base_commit',
        'head_commit', 'test_command', 'test_output', 'evidence_hash',
        'qa_recommendation', 'review_recommendation', 'merged_at', 'merge_commit',
      ];
      const runs = {};
      for (const f of runFields) {
        if (task[f] !== undefined) runs[f] = task[f];
      }
      jsonResponse(res, 200, { taskId: task.id, runs });
      return;
    }

    if (logsMatch && req.method === 'GET') {
      const runId = logsMatch[1];
      const logPath = path.join(LOG_ROOT, `${runId}.log`);
      let lines = [];
      try {
        const content = fs.readFileSync(logPath, 'utf8');
        lines = content.split('\n').filter(Boolean);
      } catch (e) {
        // no logs yet
      }
      const n = parseInt(url.searchParams.get('n') || '50', 10);
      jsonResponse(res, 200, { runId, lines: lines.slice(-n), count: lines.length });
      return;
    }

    if (pathname === '/healthz' && req.method === 'GET') {
      let gitOk = false;
      let gitErr = null;
      try {
        this.gitRunner({ cwd: this.stateRoot, args: ['rev-parse', '--is-inside-work-tree'] });
        gitOk = true;
      } catch (e) {
        gitErr = e.message;
      }
      jsonResponse(res, 200, {
        ok: true,
        service: 'kanban-dashboard',
        port: this.port,
        git: { ok: gitOk, error: gitErr },
        worker: this.workerHeartbeat,
        stateRoot: this.stateRoot,
      });
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.listen(this.port, () => resolve(this.server));
    });
  }

  close() {
    return new Promise(resolve => {
      if (this.server) this.server.close(resolve);
      else resolve();
    });
  }
}

module.exports = { KanbanApi, defaultGitRunner, DEFAULT_PORT, DEFAULT_STATE_ROOT };

if (require.main === module) {
  const api = new KanbanApi();
  api.listen().then(() => {
    console.log(`Kanban API listening on :${api.port} (stateRoot=${api.stateRoot})`);
  });
}
