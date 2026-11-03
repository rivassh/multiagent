const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const TaskRunner = require('../../state/runner_workflow');

function createRunner(t, tasks, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-runner-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const tasksFile = path.join(directory, 'tasks.json');
  const leasesFile = path.join(directory, 'leases.json');
  fs.writeFileSync(tasksFile, JSON.stringify({ version: 1, tasks }));
  fs.writeFileSync(leasesFile, JSON.stringify({ version: 1, leases: [] }));

  const runner = new TaskRunner({ tasksFile, leasesFile, ...options });
  const processed = [];
  runner.processImplementerPhase = async task => processed.push(task.id);
  return { runner, processed };
}

test('default Sima scope processes only TASK-NNN tasks', async t => {
  const tasks = [
    { id: 'TASK-001', status: 'TODO' },
    { id: 'TASK-002', status: 'IN_PROGRESS' },
    { id: 'TASK-HR-001', status: 'TODO' },
    { id: 'TASK-ZP-001', status: 'TODO' },
  ];
  const { runner, processed } = createRunner(t, tasks);

  await runner.processTaskLifecycle();

  assert.deepEqual(processed, ['TASK-001', 'TASK-002']);
  assert.deepEqual(runner.tasks.tasks.map(task => task.status), [
    'TODO', 'IN_PROGRESS', 'TODO', 'TODO',
  ]);
});

test('HR scope isolates HR tasks and waits for every dependency to be DONE', async t => {
  const tasks = [
    { id: 'TASK-001', status: 'TODO' },
    { id: 'TASK-HR-001', status: 'DONE' },
    { id: 'TASK-HR-002', status: 'TODO', depends_on: ['TASK-HR-001'] },
    { id: 'TASK-HR-003', status: 'TODO', depends_on: ['TASK-HR-002'] },
    { id: 'TASK-HR-004', status: 'TODO', depends_on: ['TASK-MISSING'] },
    { id: 'TASK-HR-005', status: 'TODO', depends_on: 'TASK-HR-001' },
  ];
  const { runner, processed } = createRunner(t, tasks, { scope: 'hr' });

  await runner.processTaskLifecycle();

  assert.deepEqual(processed, ['TASK-HR-002']);
});

test('scope parser defaults to Sima and accepts an explicit HR scope', () => {
  assert.equal(TaskRunner.parseScope([]), 'sima');
  assert.equal(TaskRunner.parseScope(['--scope', 'hr']), 'hr');
  assert.equal(TaskRunner.parseScope(['--scope=hr']), 'hr');
  assert.throws(() => TaskRunner.parseScope(['--scope', 'all']), /Unsupported task scope/);
});
