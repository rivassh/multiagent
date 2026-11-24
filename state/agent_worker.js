'use strict';

/**
 * state/agent_worker.js
 * GitOps agent worker: polls for QUEUED tasks, runs agents in isolated worktrees,
 * and drives state transitions with partitioned leases.
 *
 * Flow per task:
 *   1. Poll every POLL_INTERVAL_MS for tasks with run_state == QUEUED
 *   2. Enforce AGENT_MAX_CONCURRENT_RUNS
 *   3. Acquire role lease (TTL 900s, renewed every 30s)
 *   4. Resolve target repo + base branch from task namespace
 *   5. Refuse if target repo is dirty or not a Git repo
 *   6. Create worktree /worktrees/<scope>/<task-id>/<run-id> on branch task/<task-id>/<run-id>
 *   7. Write prompt file; run AGENT_RUNNER_CMD with placeholders
 *   8. Capture stdout/stderr to /var/log/gitops/<run-id>.log
 *   9. On PASS: commit/push task branch; status -> NEEDS_QA / QA_PASSED / IN_REVIEW
 *   10. On FAIL: keep worktree; status -> REVISE / QA_FAILED / REVISE
 *   11. Append team_log, commit/push state, release lease
 *
 * Dependencies are injectable (store, transitions, leases, gitRunner, runAgent, timers)
 * so unit tests can use a fake runner and a temp state root.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const { KanbanStore } = require('./kanban_store');
const { KanbanTransitions } = require('./kanban_transitions');
const { KanbanLeases } = require('./kanban_leases');

const DEFAULT_STATE_ROOT = path.join(__dirname);
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_AGENT_TTL_SECONDS = 900;
const DEFAULT_HEARTBEAT_MS = 30000;
const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_AGENT_TIMEOUT_SECONDS = 1800;
const DEFAULT_TEST_TIMEOUT_SECONDS = 900;
const DEFAULT_WORKTREE_ROOT = '/worktrees';
const DEFAULT_LOG_ROOT = '/var/log/gitops';

const AGENT_RUNNER_CMD = process.env.AGENT_RUNNER_CMD || '/opt/multiagent/scripts/run_agent.sh';

const REPO_MAP = {
  sima: { repo: process.env.SIMA_PROJECT_PATH || 'projects/sima', baseBranch: process.env.SIMA_BASE_BRANCH || 'develop' },
  candash: { repo: process.env.CANDASH_PROJECT_PATH || 'projects/candash', baseBranch: process.env.CANDASH_BASE_BRANCH || 'main' },
  shared: { repo: process.env.OMR_PROJECT_PATH || 'projects/omr', baseBranch: process.env.OMR_BASE_BRANCH || 'main' },
  root: { repo: '.', baseBranch: process.env.REFACTOR_BASE_BRANCH || 'master' },
};

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomBytes(8).toString('hex');
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function writeJsonFile(filePath, obj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + `.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Run a shell command with a timeout; returns { code, stdout, stderr }.
function runCommand(cmd, { cwd, timeoutSeconds = DEFAULT_AGENT_TIMEOUT_SECONDS } = {}) {
  let result;
  try {
    result = execSync(cmd, {
      cwd,
      timeout: timeoutSeconds * 1000,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return { code: 0, stdout: result, stderr: '' };
  } catch (e) {
    return {
      code: e.status != null ? e.status : 1,
      stdout: e.stdout != null ? e.stdout : '',
      stderr: e.stderr != null ? e.stderr : e.message,
    };
  }
}

function gitCmd(cwd, args) {
  return runCommand(`git ${args.join(' ')}`, { cwd });
}

function isGitRepo(cwd) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function isDirty(cwd) {
  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf8' }).trim();
    return status.length > 0;
  } catch (_) {
    return true; // treat errors as dirty/unsafe
  }
}

function currentBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
  } catch (_) {
    return null;
  }
}

function namespaceOf(taskId) {
  if (/^TASK-\d{3}$/.test(taskId)) return 'sima';
  if (/^TASK-HR-\d{3}$/.test(taskId)) return 'candash';
  if (/^TASK-OMR-\d{3}$/.test(taskId)) return 'shared';
  if (/^TASK-REFACTOR-\d{3}$/.test(taskId)) return 'root';
  return null;
}

class AgentWorker {
  constructor({
    stateRoot = DEFAULT_STATE_ROOT,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    agentTtlSeconds = DEFAULT_AGENT_TTL_SECONDS,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    agentTimeoutSeconds = DEFAULT_AGENT_TIMEOUT_SECONDS,
    testTimeoutSeconds = DEFAULT_TEST_TIMEOUT_SECONDS,
    worktreeRoot = DEFAULT_WORKTREE_ROOT,
    logRoot = DEFAULT_LOG_ROOT,
    agentRunnerCmd = AGENT_RUNNER_CMD,
    yourId = process.env.YOUR_ID || 'agent-worker',
    // Injectables (for tests)
    store = new KanbanStore(stateRoot),
    transitions = new KanbanTransitions(),
    leases = new KanbanLeases({ stateRoot, ttlSeconds: agentTtlSeconds, holder: yourId }),
    gitRunner = null, // function({cwd, args}) -> {code,stdout,stderr}
    runAgent = null,  // function({worktree, promptFile, taskId, role, repo}) -> Promise<{status, test_command, exit_code, summary, changed_files}>
    isGitRepoFn = isGitRepo,
    isDirtyFn = isDirty,
    setInterval = global.setInterval,
    clearInterval = global.clearInterval,
    setTimeout = global.setTimeout,
    clearTimeout = global.clearTimeout,
  } = {}) {
    this.stateRoot = stateRoot;
    this.pollIntervalMs = pollIntervalMs;
    this.agentTtlSeconds = agentTtlSeconds;
    this.heartbeatMs = heartbeatMs;
    this.maxConcurrent = maxConcurrent;
    this.agentTimeoutSeconds = agentTimeoutSeconds;
    this.testTimeoutSeconds = testTimeoutSeconds;
    this.worktreeRoot = worktreeRoot;
    this.logRoot = logRoot;
    this.agentRunnerCmd = agentRunnerCmd;
    this.yourId = yourId;

    this.store = store;
    this.transitions = transitions;
    this.leases = leases;
    this.gitRunner = gitRunner || this._defaultGitRunner.bind(this);
    this.runAgent = runAgent || this._defaultRunAgent.bind(this);
    this.isGitRepo = isGitRepoFn;
    this.isDirty = isDirtyFn;

    this._timer = null;
    this._heartbeatTimer = null;
    this._running = false;
    this._activeRuns = new Map(); // runId -> { taskId, partition, leaseResource, role, holder, deadline, abort }
    this._stop = false;
  }

  _defaultGitRunner({ cwd, args }) {
    return gitCmd(cwd, args);
  }

  async _defaultRunAgent({ worktree, promptFile, taskId, role, repo }) {
    const cmd = this.agentRunnerCmd
      .replace(/\{worktree\}/g, worktree)
      .replace(/\{prompt_file\}/g, promptFile)
      .replace(/\{task_id\}/g, taskId)
      .replace(/\{role\}/g, role)
      .replace(/\{repo\}/g, repo);
    return runCommand(cmd, { cwd: repo, timeoutSeconds: this.agentTimeoutSeconds });
  }

  // Start the polling loop. Resolves when stop() is called.
  start() {
    if (this._running) return this;
    this._running = true;
    this._stop = false;
    this._loop();
    this._startHeartbeat();
    return this;
  }

  stop() {
    this._stop = true;
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._timer = null;
    this._heartbeatTimer = null;
  }

  _loop() {
    if (this._stop) return;
    this._tick().catch(err => {
      console.error(`[agent-worker] tick error: ${err.message}`);
    });
    this._timer = setInterval(() => {
      if (this._stop) return;
      this._tick().catch(err => {
        console.error(`[agent-worker] tick error: ${err.message}`);
      });
    }, this.pollIntervalMs);
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      this._renewActiveLeases();
    }, this.heartbeatMs);
  }

  async _renewActiveLeases() {
    const now = Date.now();
    for (const [runId, run] of this._activeRuns) {
      if (now < run.deadline) continue;
      try {
        await this.leases.acquire(run.partition, run.leaseResource, {
          holder: run.holder,
          ttlSeconds: this.agentTtlSeconds,
          task_id: run.taskId,
          role: run.role,
        });
        run.deadline = now + this.agentTtlSeconds * 1000 - 60000; // renew 1min before expiry
      } catch (err) {
        console.error(`[agent-worker] heartbeat renew failed for ${runId}: ${err.message}`);
      }
    }
  }

  async _tick() {
    if (this._activeRuns.size >= this.maxConcurrent) return;

    const allTasks = this.store.listTasks();
    this.transitions.setTasks(allTasks);
    this.transitions.setYourId(this.yourId);

    const queued = allTasks.filter(t => t.run_state === 'QUEUED');
    if (queued.length === 0) return;

    // Process the first queued task (respect maxConcurrent)
    const task = queued[0];
    await this.processQueuedTask(task);
  }

  // Process a single QUEUED task end-to-end.
  async processQueuedTask(task) {
    const taskId = task.id;
    const role = task.run_role || 'implementer';
    const agentId = task.run_agent_id || this.yourId;
    const runId = task.run_id || `run-${uuid()}`;
    const namespace = namespaceOf(taskId);
    const partition = REPO_MAP[namespace] ? (namespace === 'root' ? 'root' : namespace) : 'root';

    const repoCfg = REPO_MAP[namespace] || REPO_MAP.root;
    const leaseResource = {
      sima: 'sima/tasks.json',
      candash: 'candash/tasks.json',
      shared: 'shared/tasks.json',
      root: 'tasks.json',
    }[partition];

    const runDir = path.join(this.worktreeRoot, partition, taskId, runId);
    ensureDir(runDir);
    ensureDir(this.logRoot);
    const logPath = path.join(this.logRoot, `${runId}.log`);

    const log = (...msg) => {
      const line = `[${nowIso()}] [${taskId}] ${msg.join(' ')}\n`;
      fs.appendFileSync(logPath, line);
      process.stdout.write(line);
    };

    log(`Starting agent run role=${role} agentId=${agentId} namespace=${namespace}`);

    // Acquire role lease
    let lease;
    try {
      const res = await this.leases.acquire(partition, leaseResource, {
        holder: agentId,
        ttlSeconds: this.agentTtlSeconds,
        task_id: taskId,
        role,
      });
      if (!res.ok) {
        log(`LEASE_DENIED: ${res.reason}`);
        this._markFailed(task, runId, `Lease denied: ${res.reason}`, logPath);
        return;
      }
      lease = res.lease;
    } catch (err) {
      log(`LEASE_ERROR: ${err.message}`);
      this._markFailed(task, runId, `Lease error: ${err.message}`, logPath);
      return;
    }

    const deadline = Date.now() + this.agentTtlSeconds * 1000 - 60000;
    this._activeRuns.set(runId, {
      taskId,
      partition,
      leaseResource,
      role,
      holder: agentId,
      deadline,
    });

    try {
      // 5. Refuse dirty or non-git target repo
      const repoPath = path.resolve(this.stateRoot, '..', repoCfg.repo);
      if (!this.isGitRepo(repoPath)) {
        throw new Error(`Target repo ${repoPath} is not a Git repository`);
      }
      if (this.isDirty(repoPath)) {
        throw new Error(`Target repo ${repoPath} has uncommitted changes; refusing to run agent`);
      }

      // 6. Create worktree
      const branch = `task/${taskId}/${runId}`;
      const baseBranch = repoCfg.baseBranch;
      log(`Creating worktree ${runDir} branch ${branch} from origin/${baseBranch}`);

      // Fetch base branch
      const fetchRes = await this.gitRunner({ cwd: repoPath, args: ['fetch', 'origin', baseBranch] });
      if (fetchRes.code !== 0) {
        throw new Error(`git fetch origin/${baseBranch} failed: ${fetchRes.stderr}`);
      }

      // Remove existing worktree if any
      try {
        await this.gitRunner({ cwd: repoPath, args: ['worktree', 'remove', runDir, '--force'] });
      } catch (_) { /* ignore */ }

      const addRes = await this.gitRunner({
        cwd: repoPath,
        args: ['worktree', 'add', '-B', branch, runDir, `origin/${baseBranch}`],
      });
      if (addRes.code !== 0) {
        throw new Error(`git worktree add failed: ${addRes.stderr}`);
      }

      // Record base commit
      const baseCommitRes = await this.gitRunner({ cwd: runDir, args: ['rev-parse', 'HEAD'] });
      const baseCommit = baseCommitRes.code === 0 ? baseCommitRes.stdout.trim() : null;

      // 7. Write prompt file
      const promptFile = path.join(runDir, 'agent-prompt.md');
      const prompt = this.buildPrompt({ task, role, runId, worktree: runDir, repo: repoPath, baseBranch, testCommand: task.test_command || 'npm test' });
      fs.writeFileSync(promptFile, prompt, { encoding: 'utf8' });

      // 8. Run agent
      log(`Running agent runner: ${this.agentRunnerCmd}`);
      const startTime = Date.now();
      const agentResult = await this.runAgent({
        worktree: runDir,
        promptFile,
        taskId,
        role,
        repo: repoPath,
      });
      const elapsedMs = Date.now() - startTime;

      // Capture agent stdout to log
      if (agentResult.stdout) fs.appendFileSync(logPath, `\nAGENT_STDOUT:\n${agentResult.stdout}\n`);
      if (agentResult.stderr) fs.appendFileSync(logPath, `\nAGENT_STDERR:\n${agentResult.stderr}\n`);

      log(`Agent finished in ${elapsedMs}ms code=${agentResult.code} status=${agentResult.status || 'unknown'}`);

      // Parse the required final JSON from stdout if present
      let parsed = null;
      if (agentResult.stdout) {
        try {
          const match = agentResult.stdout.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch (_) { /* ignore parse errors */ }
      }

      const agentExitCode = (parsed && parsed.exit_code != null) ? parsed.exit_code : agentResult.exit_code;
      const pass = (parsed && parsed.status === 'PASS') || agentResult.status === 'PASS' || agentResult.code === 0;

      // Capture agent stdout to log
      if (agentResult.stdout) fs.appendFileSync(logPath, `\nAGENT_STDOUT:\n${agentResult.stdout}\n`);
      if (agentResult.stderr) fs.appendFileSync(logPath, `\nAGENT_STDERR:\n${agentResult.stderr}\n`);

      log(`Agent finished in ${elapsedMs}ms code=${agentResult.code} status=${agentResult.status || 'unknown'}`);

      // Only run the test command if the agent did not already report results.
      let testOutput = agentResult.summary || '';
      let failReason = null;
      if (pass && task.test_command && agentExitCode == null) {
        const testRes = runCommand(task.test_command, { cwd: runDir, timeoutSeconds: this.testTimeoutSeconds });
        testOutput = testRes.stdout + '\n' + testRes.stderr;
        if (testRes.code !== 0) {
          pass = false;
          failReason = `Test command failed with exit code ${testRes.code}`;
          log(`TESTS_FAILED: code=${testRes.code}`);
        }
      }

      if (!pass) {
        testOutput = testOutput || agentResult.stdout || agentResult.stderr || agentResult.summary || '';
        failReason = failReason || agentResult.stderr || `Agent run failed (code ${agentResult.code})`;
      }

      // Evidence hash
      const evidenceHash = `sha256:${crypto.createHash('sha256').update(testOutput || agentResult.summary || '').digest('hex')}`;

      // Commit + push task branch in target repo
      let headCommit = null;
      if (pass) {
        const addRes2 = await this.gitRunner({ cwd: runDir, args: ['add', '-A'] });
        if (addRes2.code !== 0) {
          throw new Error(`git add failed: ${addRes2.stderr}`);
        }
        const commitRes = await this.gitRunner({
          cwd: runDir,
          args: ['commit', '-m', `feat(${taskId}): implementer agent run ${runId}`],
        });
        if (commitRes.code === 0) {
          const pushRes = await this.gitRunner({ cwd: runDir, args: ['push', 'origin', branch] });
          if (pushRes.code !== 0) {
            throw new Error(`git push failed: ${pushRes.stderr}`);
          }
        }
        const hcRes = await this.gitRunner({ cwd: runDir, args: ['rev-parse', 'HEAD'] });
        headCommit = hcRes.code === 0 ? hcRes.stdout.trim() : null;
      }

      // 11/12. Update state based on pass/fail
      const updated = this._applyAgentResult({ task, role, agentId, runId, pass, baseCommit, headCommit, testOutput, evidenceHash, lastError: failReason, log });

      // Write updated state to the partition file and commit/push
      await this._commitStateUpdate({ partition, taskId, updated, runId, role, pass, log });

      log(`Run ${runId} ${pass ? 'SUCCEEDED' : 'FAILED'}`);
    } catch (err) {
      log(`ERROR: ${err.message}`);
      const updated = this._applyAgentResult({ task, role, agentId, runId, pass: false, lastError: err.message, log });
      try {
        await this._commitStateUpdate({ partition, taskId, updated, runId, role, pass: false, log });
      } catch (commitErr) {
        log(`STATE_COMMIT_ERROR: ${commitErr.message}`);
      }
    } finally {
      // Release lease
      try {
        await this.leases.release(partition, leaseResource, { holder: agentId });
      } catch (_) { /* best effort */ }
      this._activeRuns.delete(runId);
    }
  }

  buildPrompt({ task, role, runId, worktree, repo, baseBranch, testCommand }) {
    return [
      `# Agent Run Prompt`,
      ``,
      `Task ID: ${task.id}`,
      `Task Title: ${task.title}`,
      `Role: ${role}`,
      `Run ID: ${runId}`,
      `Target Repository: ${repo}`,
      `Base Branch: ${baseBranch}`,
      `Worktree: ${worktree}`,
      `Test Command: ${testCommand}`,
      `Dependencies: ${JSON.stringify(task.depends_on || [])}`,
      ``,
      `## Instructions`,
      `- Follow TDD: write a failing test first (Red), then implement (Green), then refactor.`,
      `- Do not modify unrelated files.`,
      `- Never print secrets, tokens, or credentials to stdout.`,
      `- Run the test command and report results.`,
      `- End your run with a single JSON object on stdout:`,
      `  {"status":"PASS|FAIL","test_command":"...","exit_code":0,"summary":"...","changed_files":["..."]}`,
      ``,
      `## Acceptance Criteria`,
      `- ${task.title}`,
      ``,
    ].join('\n');
  }

  _applyAgentResult({ task, role, agentId, runId, pass, baseCommit, headCommit, testOutput, evidenceHash, lastError, log }) {
    const updated = { ...task };
    updated.run_id = runId;
    updated.run_role = role;
    updated.run_agent_id = agentId;
    updated.run_started_at = updated.run_started_at || nowIso();
    updated.run_finished_at = nowIso();
    updated.base_commit = baseCommit || updated.base_commit;
    updated.head_commit = headCommit;
    updated.test_output = testOutput || updated.test_output;
    updated.evidence_hash = evidenceHash;
    if (lastError) updated.last_error = lastError;

    if (pass) {
      updated.run_state = 'SUCCEEDED';
      if (role === 'implementer') {
        updated.status = 'NEEDS_QA';
        updated.assigned_to = agentId;
      } else if (role === 'qa') {
        updated.qa_recommendation = 'PASS';
        updated.status = 'QA_PASSED';
        updated.qa_engineer = agentId;
      } else if (role === 'reviewer') {
        updated.review_recommendation = 'PASS';
        updated.status = 'IN_REVIEW';
        updated.reviewer = agentId;
      }
      log(`Status -> ${updated.status} (run_state=SUCCEEDED)`);
    } else {
      updated.run_state = 'FAILED';
      if (role === 'implementer') {
        updated.status = 'REVISE';
        updated.assigned_to = agentId;
      } else if (role === 'qa') {
        updated.status = 'QA_FAILED';
        updated.qa_engineer = agentId;
        updated.qa_recommendation = 'FAIL';
      } else if (role === 'reviewer') {
        updated.status = 'REVISE';
        updated.reviewer = agentId;
        updated.review_recommendation = 'FAIL';
      }
      log(`Status -> ${updated.status} (run_state=FAILED)`);
    }
    return updated;
  }

  async _commitStateUpdate({ partition, taskId, updated, runId, role, pass, log }) {
    // Re-load the partition tasks file, replace the task, write back.
    const partPath = path.join(this.stateRoot, partition === 'root' ? '' : partition, 'tasks.json');
    const partData = readJsonFile(partPath) || { version: 1, tasks: [] };
    const idx = partData.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) {
      throw new Error(`Task ${taskId} not found in ${partition} tasks file for state commit`);
    }
    partData.tasks[idx] = updated;
    writeJsonFile(partPath, partData);

    // Append team_log
    const logLine = `[${nowIso()}] agent ${role} run ${runId} for ${taskId}: ${pass ? 'SUCCEEDED' : 'FAILED'} -> status=${updated.status}\n`;
    fs.appendFileSync(path.join(this.stateRoot, 'team_log.md'), logLine);

    // Commit + push state to origin/master
    const leaseFile = path.join(this.stateRoot, partition === 'root' ? '' : partition, 'leases.json');
    const res = await this.gitRunner({
      cwd: this.stateRoot,
      args: ['add', partPath, leaseFile, 'state/team_log.md'],
    });
    if (res.code !== 0) throw new Error(`git add failed: ${res.stderr}`);

    const commitRes = await this.gitRunner({
      cwd: this.stateRoot,
      args: ['commit', '-m', `feat(${taskId}): agent ${role} run ${runId} ${pass ? 'succeeded' : 'failed'}`],
    });
    if (commitRes.code !== 0) throw new Error(`git commit failed: ${commitRes.stderr}`);

    const pushRes = await this.gitRunner({ cwd: this.stateRoot, args: ['push', 'origin', 'master'] });
    if (pushRes.code !== 0) throw new Error(`git push failed: ${pushRes.stderr}`);
  }

  _markFailed(task, runId, reason, logPath) {
    const updated = { ...task };
    updated.run_id = runId;
    updated.run_state = 'FAILED';
    updated.last_error = reason;
    updated.run_finished_at = nowIso();
    try {
      fs.appendFileSync(logPath, `\nFAILED: ${reason}\n`);
    } catch (_) { /* ignore */ }
    return updated;
  }
}

module.exports = {
  AgentWorker,
  REPO_MAP,
  isGitRepo,
  isDirty,
  namespaceOf,
  runCommand,
  nowIso,
  uuid,
};
