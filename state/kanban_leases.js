'use strict';

/**
 * kanban_leases.js
 * Partitioned lease acquire / renew / release (JS port of acquire_lease_partitioned.sh /
 * release_lease_partitioned.sh). TTL default 120s.
 *
 * Lease records live in state/<partition>/leases.json:
 *   { version: 1, leases: [ { resource, holder, lease_id, acquired_at, expires_at, task_id?, role? } ] }
 *
 * The git commit/push is delegated to an injectable `gitRunner` so unit tests can mock it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STATE_ROOT = path.join(__dirname);
const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_COORDINATION_BRANCH = 'master';

const PARTITIONS = {
  root: { dir: '', leasesFile: 'leases.json', resource: 'tasks.json' },
  sima: { dir: 'sima', leasesFile: 'leases.json', resource: 'sima/tasks.json' },
  candash: { dir: 'candash', leasesFile: 'leases.json', resource: 'candash/tasks.json' },
  shared: { dir: 'shared', leasesFile: 'leases.json', resource: 'shared/tasks.json' },
};

function nowIso() {
  return new Date().toISOString();
}

function expiresIn(ttlSeconds) {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function parseIso(s) {
  return new Date(s).getTime();
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, leases: [] };
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

function uuid() {
  return crypto.randomBytes(16).toString('hex');
}

// Minimal injectable git runner. Default executes real git via child_process.
function defaultGitRunner({ cwd, args }) {
  const { execSync } = require('child_process');
  const cmd = ['git', ...args].join(' ');
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

class KanbanLeases {
  constructor({
    stateRoot = DEFAULT_STATE_ROOT,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    coordinationBranch = DEFAULT_COORDINATION_BRANCH,
    holder = process.env.YOUR_ID || 'agent-unknown',
    gitRunner = defaultGitRunner,
  } = {}) {
    this.stateRoot = stateRoot;
    this.ttlSeconds = ttlSeconds;
    this.coordinationBranch = coordinationBranch;
    this.holder = holder;
    this.gitRunner = gitRunner;
  }

  partitionConfig(partition) {
    const cfg = PARTITIONS[partition];
    if (!cfg) throw new Error(`Unknown partition: ${partition}`);
    return {
      ...cfg,
      leasesPath: path.join(this.stateRoot, cfg.dir, cfg.leasesFile),
    };
  }

  loadLeases(partition) {
    const { leasesPath } = this.partitionConfig(partition);
    return readJsonFile(leasesPath);
  }

  saveLeases(partition, leases) {
    const { leasesPath } = this.partitionConfig(partition);
    writeJsonFile(leasesPath, leases);
  }

  // Find active (non-expired) lease for a resource.
  findActiveLease(leases, resource) {
    const now = Date.now();
    for (const l of leases.leases || []) {
      if (l.resource !== resource) continue;
      const exp = parseIso(l.expires_at);
      if (exp && exp > now) return l;
    }
    return null;
  }

  // Acquire (or renew) a lease. Returns { ok: true, lease } or { ok: false, reason, holder, expiresAt }.
  acquire(partition, resource, opts = {}) {
    const { holder = this.holder, ttlSeconds = this.ttlSeconds } = opts;
    const now = nowIso();
    const expiresAt = expiresIn(ttlSeconds);
    const leaseId = uuid();
    const leases = this.loadLeases(partition);

    const existing = this.findActiveLease(leases, resource);

    if (existing) {
      const expEpoch = parseIso(existing.expires_at);
      const acqEpoch = parseIso(existing.acquired_at);
      const nowEpoch = Date.now();

      // Zombie / future-dated lease: force break
      if (expEpoch < nowEpoch || (acqEpoch && acqEpoch > nowEpoch)) {
        const filtered = leases.leases.filter(l => !(l.resource === resource));
        leases.leases = filtered;
        this.saveLeases(partition, leases);
        this.gitRunner({
          cwd: this.stateRoot,
          args: ['add', leasesPath(partition, this.stateRoot), 'state/team_log.md'],
        });
        this.gitRunner({
          cwd: this.stateRoot,
          args: ['commit', '-m', `chore(lock): force-break zombie lease of ${existing.holder} for ${resource}`],
        });
        this.gitRunner({
          cwd: this.stateRoot,
          args: ['push', 'origin', this.coordinationBranch],
        });
      } else if (existing.holder === holder) {
        // Renew our own lease
        const updated = leases.leases.map(l =>
          l.resource === resource ? { ...l, acquired_at: now, expires_at } : l
        );
        leases.leases = updated;
        this.saveLeases(partition, leases);
        this.gitRunner({
          cwd: this.stateRoot,
          args: ['add', leasesPath(partition, this.stateRoot)],
        });
        this.gitRunner({
          cwd: this.stateRoot,
          args: ['commit', '-m', `chore(lock): renew ${resource} lease by ${holder}`],
        });
        this.gitRunner({
          cwd: this.stateRoot,
          args: ['push', 'origin', this.coordinationBranch],
        });
        return { ok: true, lease: { ...updated.find(l => l.resource === resource) } };
      } else {
        // Active lease held by someone else
        return {
          ok: false,
          reason: `Active lease held by ${existing.holder}, expires at ${existing.expires_at}`,
          holder: existing.holder,
          expiresAt: existing.expires_at,
        };
      }
    }

    // No existing lease: create ours
    const newLease = {
      resource,
      holder,
      lease_id: leaseId,
      acquired_at: now,
      expires_at: expiresAt,
      ...(opts.task_id ? { task_id: opts.task_id } : {}),
      ...(opts.role ? { role: opts.role } : {}),
    };
    leases.leases = [...(leases.leases || []), newLease];
    this.saveLeases(partition, leases);
    this.gitRunner({
      cwd: this.stateRoot,
      args: ['add', leasesPath(partition, this.stateRoot), 'state/team_log.md'],
    });
    this.gitRunner({
      cwd: this.stateRoot,
      args: ['commit', `-m`, `chore(lock): acquire ${resource} lease by ${holder}`],
    });
    this.gitRunner({
      cwd: this.stateRoot,
      args: ['push', 'origin', this.coordinationBranch],
    });

    return { ok: true, lease: newLease };
  }

  // Release our lease for a resource.
  release(partition, resource, opts = {}) {
    const { holder = this.holder } = opts;
    const leases = this.loadLeases(partition);
    const before = (leases.leases || []).length;
    leases.leases = (leases.leases || []).filter(
      l => !(l.resource === resource && l.holder === holder)
    );
    if ((leases.leases || []).length === before) {
      // Nothing to release
      return { ok: true, released: false };
    }
    this.saveLeases(partition, leases);
    this.gitRunner({
      cwd: this.stateRoot,
      args: ['add', leasesPath(partition, this.stateRoot)],
    });
    this.gitRunner({
      cwd: this.stateRoot,
      args: ['commit', '-m', `chore(lock): release ${resource} lease by ${holder}`],
    });
    this.gitRunner({
      cwd: this.stateRoot,
      args: ['push', 'origin', this.coordinationBranch],
    });
    return { ok: true, released: true };
  }

  // Renew an existing lease held by us (extend TTL).
  renew(partition, resource, opts = {}) {
    return this.acquire(partition, resource, { holder: opts.holder || this.holder, ttlSeconds: opts.ttlSeconds || this.ttlSeconds });
  }

  // List active leases (non-expired) for diagnostics.
  listActive(partition) {
    const leases = this.loadLeases(partition);
    const now = Date.now();
    return (leases.leases || []).filter(l => {
      const exp = parseIso(l.expires_at);
      return exp && exp > now;
    });
  }
}

function leasesPath(partition, stateRoot) {
  const cfg = PARTITIONS[partition];
  if (!cfg) throw new Error(`Unknown partition: ${partition}`);
  return path.join(stateRoot, cfg.dir, cfg.leasesFile);
}

module.exports = { KanbanLeases, PARTITIONS, DEFAULT_TTL_SECONDS, nowIso, expiresIn, uuid };
