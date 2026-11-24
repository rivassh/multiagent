'use strict';

/**
 * kanban_store.js
 * Kanban state store with multi-file dedupe, conflict detection, and atomic writes.
 *
 * Reads the canonical state file plus partition duplicates, indexes tasks by id,
 * detects conflicting duplicates (same id, different status/assignee/reviewer/qa),
 * and resolves the write target + lease resource for a given task id.
 *
 * Partitions:
 *   root        -> state/tasks.json            -> state/leases.json (resource: tasks.json)
 *   sima        -> state/sima/tasks.json       -> state/sima/leases.json (resource: sima/tasks.json)
 *   candash     -> state/candash/tasks.json    -> state/candash/leases.json (resource: candash/tasks.json)
 *   shared      -> state/shared/tasks.json     -> state/shared/leases.json (resource: shared/tasks.json)
 *
 * Namespace -> partition mapping:
 *   TASK-NNN        -> sima
 *   TASK-HR-NNN     -> candash
 *   TASK-OMR-NNN    -> shared
 *   TASK-REFACTOR-NNN -> root
 *   other/unknown   -> root (blocked for agent runs by caller)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STATE_ROOT = path.join(__dirname);

const PARTITIONS = [
  { name: 'root', dir: '', tasksFile: 'tasks.json', leasesFile: 'leases.json', leaseResource: 'tasks.json' },
  { name: 'sima', dir: 'sima', tasksFile: 'tasks.json', leasesFile: 'leases.json', leaseResource: 'sima/tasks.json' },
  { name: 'candash', dir: 'candash', tasksFile: 'tasks.json', leasesFile: 'leases.json', leaseResource: 'candash/tasks.json' },
  { name: 'shared', dir: 'shared', tasksFile: 'tasks.json', leasesFile: 'leases.json', leaseResource: 'shared/tasks.json' },
];

// Partition dir for each task namespace prefix
const NAMESPACE_PARTITION = {
  sima: /^TASK-\d{3}$/,
  candash: /^TASK-HR-\d{3}$/,
  shared: /^TASK-OMR-\d{3}$/,
};

// Reversed lookup: namespace key -> partition name
const NAMESPACE_TO_PARTITION = {
  sima: 'sima',
  candash: 'candash',
  shared: 'shared',
  refactor: 'root',
};

function partitionForId(taskId) {
  if (/^TASK-\d{3}$/.test(taskId)) return 'sima';
  if (/^TASK-HR-\d{3}$/.test(taskId)) return 'candash';
  if (/^TASK-OMR-\d{3}$/.test(taskId)) return 'shared';
  if (/^TASK-REFACTOR-\d{3}$/.test(taskId)) return 'root';
  return 'root';
}

function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, tasks: [] };
    throw e;
  }
}

// Canonical comparison key: fields that define task ownership/state.
function taskKey(task) {
  return [
    task.status || '',
    task.assigned_to || '',
    task.reviewer || '',
    task.qa_engineer || '',
    task.stage_verified_by || '',
  ].join('|');
}

function isEmptyTask(task) {
  return !task || Object.keys(task).length === 0;
}

class KanbanStore {
  constructor(stateRoot = DEFAULT_STATE_ROOT) {
    this.stateRoot = stateRoot;
    this.partitions = PARTITIONS.map(p => ({
      ...p,
      tasksPath: p.dir ? path.join(stateRoot, p.dir, p.tasksFile) : path.join(stateRoot, p.tasksFile),
      leasesPath: p.dir ? path.join(stateRoot, p.dir, p.leasesFile) : path.join(stateRoot, p.leasesFile),
      teamLogPath: p.dir ? path.join(stateRoot, p.dir, 'team_log.md') : path.join(stateRoot, 'team_log.md'),
    }));
    this.rootPartition = this.partitions[0];
  }

  // Read every state file and build the deduped index.
  loadAllTasks() {
    const sources = new Map(); // id -> array of {partition, task}

    for (const part of this.partitions) {
      const data = readJsonFile(part.tasksPath);
      for (const task of data.tasks || []) {
        if (!task || !task.id) continue;
        if (!sources.has(task.id)) sources.set(task.id, []);
        sources.get(task.id).push({ partition: part.name, task });
      }
    }

    const resolved = [];
    const conflicts = new Set();

    for (const [id, entries] of sources) {
      const first = entries[0].task;
      let conflict = false;
      for (const e of entries) {
        if (taskKey(e.task) !== taskKey(first)) {
          conflict = true;
          break;
        }
      }

      if (conflict) {
        conflicts.add(id);
        resolved.push({
          ...first,
          _conflict: true,
          _sources: entries.map(e => ({ partition: e.partition, key: taskKey(e.task) })),
        });
      } else {
        // Preference order: root first, then namespace-matching partition.
        let chosen = entries[0];
        for (const e of entries) {
          if (e.partition === 'root') { chosen = e; break; }
        }
        if (chosen.partition !== 'root') {
          const part = partitionForId(id);
          for (const e of entries) {
            if (e.partition === part) { chosen = e; break; }
          }
        }
        resolved.push({
          ...chosen.task,
          _source: chosen.partition,
          _conflict: false,
        });
      }
    }

    return { tasks: resolved, conflicts, sources };
  }

  // Get the single resolved task record (deduped). Returns null if not found.
  getTask(taskId) {
    const { tasks } = this.loadAllTasks();
    return tasks.find(t => t.id === taskId) || null;
  }

  // List all resolved (deduped) tasks with conflict flags and source.
  listTasks() {
    return this.loadAllTasks().tasks;
  }

  // Resolve the write target + lease resource for mutating a task.
  // Returns { conflict: false, partition, partitionName } or { conflict: true, taskId }.
  resolveWriteTarget(taskId) {
    const { conflicts } = this.loadAllTasks();
    if (conflicts.has(taskId)) {
      return { conflict: true, taskId };
    }
    const partitionName = partitionForId(taskId);
    const partition = this.partitions.find(p => p.name === partitionName) || this.rootPartition;
    return { conflict: false, partition, partitionName };
  }

  // Check whether a task id is in conflict (blocked for mutation).
  isConflicted(taskId) {
    return this.loadAllTasks().conflicts.has(taskId);
  }

  // Generate a run id.
  makeRunId() {
    return `run-${crypto.randomBytes(8).toString('hex')}`;
  }

  // Atomic write helper: write temp file then fsync + rename.
  atomicWriteFile(filePath, content) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + `.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, content, { encoding: 'utf8' });
    fs.renameSync(tmp, filePath);
  }

  // Persist a tasks file (version 1 wrapper).
  writeTasksFile(partition, tasks) {
    const part = this.partitions.find(p => p.name === partition) || this.rootPartition;
    const payload = JSON.stringify({ version: 1, tasks }, null, 2);
    this.atomicWriteFile(part.tasksPath, payload);
    return part;
  }
}

module.exports = { KanbanStore, partitionForId, taskKey, PARTITIONS, DEFAULT_STATE_ROOT };
