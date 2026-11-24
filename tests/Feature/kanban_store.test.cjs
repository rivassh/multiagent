const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { KanbanStore, partitionForId, taskKey } = require('../../state/kanban_store');

function writeState(stateRoot, partition, tasks) {
  const dir = partition ? path.join(stateRoot, partition) : stateRoot;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({ version: 1, tasks }, null, 2));
}

function makeStore(stateRoot) {
  return new KanbanStore(stateRoot);
}

test('partitionForId maps namespaces correctly', () => {
  assert.equal(partitionForId('TASK-001'), 'sima');
  assert.equal(partitionForId('TASK-HR-001'), 'candash');
  assert.equal(partitionForId('TASK-OMR-001'), 'shared');
  assert.equal(partitionForId('TASK-REFACTOR-001'), 'root');
  assert.equal(partitionForId('TASK-OTHER-001'), 'root');
});

test('taskKey distinguishes ownership/state fields', () => {
  const a = { status: 'TODO', assigned_to: 'x' };
  const b = { status: 'TODO', assigned_to: 'y' };
  assert.notEqual(taskKey(a), taskKey(b));
  const c = { status: 'TODO', assigned_to: 'x' };
  assert.equal(taskKey(a), taskKey(c));
});

test('loadAllTasks dedupes identical duplicates preferring root', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-store-'));
  try {
    const tasks = [
      { id: 'TASK-001', status: 'TODO', assigned_to: 'a' },
      { id: 'TASK-002', status: 'DONE' },
    ];
    writeState(dir, '', tasks); // root
    writeState(dir, 'sima', [...tasks]); // identical duplicate

    const store = makeStore(dir);
    const result = store.loadAllTasks();
    assert.equal(result.tasks.length, 2);
    assert.equal(result.tasks[0]._source, 'root');
    assert.equal(result.conflicts.size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadAllTasks flags conflicts on differing status', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-store-'));
  try {
    writeState(dir, '', [{ id: 'TASK-001', status: 'TODO' }]);
    writeState(dir, 'sima', [{ id: 'TASK-001', status: 'IN_PROGRESS' }]);

    const store = makeStore(dir);
    const result = store.loadAllTasks();
    assert.equal(result.conflicts.size, 1);
    assert.ok(result.conflicts.has('TASK-001'));
    assert.equal(result.tasks[0]._conflict, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveWriteTarget returns conflict for conflicted id', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-store-'));
  try {
    writeState(dir, '', [{ id: 'TASK-001', status: 'TODO' }]);
    writeState(dir, 'sima', [{ id: 'TASK-001', status: 'IN_PROGRESS' }]);

    const store = makeStore(dir);
    const target = store.resolveWriteTarget('TASK-001');
    assert.equal(target.conflict, true);
    assert.equal(target.taskId, 'TASK-001');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveWriteTarget maps namespace to partition', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-store-'));
  try {
    writeState(dir, '', [{ id: 'TASK-001', status: 'TODO' }]);
    const store = makeStore(dir);

    assert.equal(store.resolveWriteTarget('TASK-001').partition.name, 'sima');
    assert.equal(store.resolveWriteTarget('TASK-HR-001').partition.name, 'candash');
    assert.equal(store.resolveWriteTarget('TASK-OMR-001').partition.name, 'shared');
    assert.equal(store.resolveWriteTarget('TASK-REFACTOR-001').partition.name, 'root');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isConflicted and getTask reflect deduped state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-store-'));
  try {
    writeState(dir, '', [{ id: 'TASK-001', status: 'TODO', assigned_to: 'a' }]);
    writeState(dir, 'sima', [{ id: 'TASK-001', status: 'TODO', assigned_to: 'a' }]);

    const store = makeStore(dir);
    assert.equal(store.isConflicted('TASK-001'), false);
    const t = store.getTask('TASK-001');
    assert.equal(t._source, 'root');
    assert.equal(t._conflict, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWriteFile writes and renames', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-store-'));
  try {
    const store = makeStore(dir);
    const fp = path.join(dir, 'nested', 'file.json');
    store.atomicWriteFile(fp, JSON.stringify({ ok: true }));
    assert.equal(fs.readFileSync(fp, 'utf8'), JSON.stringify({ ok: true }));
    assert.ok(!fs.existsSync(fp + '.tmp'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
