const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { AgentWorker, isGitRepo, isDirty } = require('../../state/agent_worker');
const { KanbanStore } = require('../../state/kanban_store');
const { KanbanLeases } = require('../../state/kanban_leases');

function writeState(stateRoot, partition, tasks) {
  const dir = partition ? path.join(stateRoot, partition) : stateRoot;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({ version: 1, tasks }, null, 2));
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, 'leases.json'))) {
    fs.writeFileSync(path.join(dir, 'leases.json'), JSON.stringify({ version: 1, leases: [] }));
  }
}

function readState(stateRoot, partition) {
  const dir = partition ? path.join(stateRoot, partition) : stateRoot;
  return JSON.parse(fs.readFileSync(path.join(dir, 'tasks.json'), 'utf8'));
}

function makeWorker(stateRoot, { runAgent, gitRunner, yourId = 'agent-worker-test', isGitRepoFn = () => true, isDirtyFn = () => false } = {}) {
  const store = new KanbanStore(stateRoot);
  const leases = new KanbanLeases({ stateRoot, ttlSeconds: 900, holder: yourId, gitRunner: gitRunner || defaultGitRunner });
  return new AgentWorker({
    stateRoot,
    yourId,
    store,
    leases,
    pollIntervalMs: 50,
    agentTtlSeconds: 900,
    maxConcurrent: 1,
    gitRunner: gitRunner || defaultGitRunner,
    runAgent: runAgent || defaultRunAgent,
    isGitRepoFn,
    isDirtyFn,
    // No-op timers so start() does not loop; tests call processQueuedTask directly.
    setInterval: () => ({ ref: () => {}, unref: () => {} }),
    clearInterval: () => {},
    setTimeout: () => ({ ref: () => {}, unref: () => {} }),
    clearTimeout: () => {},
  });
}

function defaultGitRunner() {
  return { code: 0, stdout: '', stderr: '' };
}

function defaultRunAgent() {
  return { code: 0, stdout: JSON.stringify({ status: 'PASS', test_command: 'npm test', exit_code: 0, summary: 'tests pass', changed_files: [] }), stderr: '' };
}

test('processQueuedTask PASS moves implementer to NEEDS_QA', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-worker-'));
  try {
    writeState(dir, 'sima', [
      { id: 'TASK-001', status: 'TODO', assigned_to: null, attempts: 0, run_state: 'QUEUED', run_role: 'implementer', run_agent_id: 'agent-w', test_command: 'npm test' },
    ]);
    const calls = [];
    const gitRunner = async () => { calls.push('git-op'); return { code: 0, stdout: 'abc123', stderr: '' }; };
    const runAgent = async () => ({ code: 0, stdout: JSON.stringify({ status: 'PASS', test_command: 'npm test', exit_code: 0, summary: 'all green', changed_files: ['a.js'] }), stderr: '' });

    const worker = makeWorker(dir, { runAgent, gitRunner });
    const task = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-001');
    await worker.processQueuedTask(task);

    const after = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-001');
    assert.equal(after.status, 'NEEDS_QA', JSON.stringify(after));
    assert.equal(after.run_state, 'SUCCEEDED');
    assert.equal(after.assigned_to, 'agent-w');
    assert.equal(after.evidence_hash && after.evidence_hash.startsWith('sha256:'), true);
    assert.ok(calls.length > 0, 'expected git operations');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('processQueuedTask FAIL moves implementer to REVISE', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-worker-'));
  try {
    writeState(dir, 'sima', [
      { id: 'TASK-002', status: 'TODO', assigned_to: null, run_state: 'QUEUED', run_role: 'implementer', run_agent_id: 'agent-w', test_command: 'npm test' },
    ]);
    const runAgent = async () => ({ code: 1, stdout: JSON.stringify({ status: 'FAIL', summary: 'tests failed', changed_files: [] }), stderr: 'boom' });

    const worker = makeWorker(dir, { runAgent });
    const task = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-002');
    await worker.processQueuedTask(task);

    const after = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-002');
    assert.equal(after.status, 'REVISE');
    assert.equal(after.run_state, 'FAILED');
    assert.ok(after.last_error || after.test_output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('QA role PASS moves NEEDS_QA to QA_PASSED', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-worker-'));
  try {
    writeState(dir, 'sima', [
      { id: 'TASK-003', status: 'NEEDS_QA', run_state: 'QUEUED', run_role: 'qa', run_agent_id: 'agent-qa', test_command: 'npm test' },
    ]);
    const runAgent = async () => ({ code: 0, stdout: JSON.stringify({ status: 'PASS', test_command: 'npm test', exit_code: 0, summary: 'qa ok', changed_files: [] }), stderr: '' });

    const worker = makeWorker(dir, { runAgent });
    const task = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-003');
    await worker.processQueuedTask(task);

    const after = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-003');
    assert.equal(after.status, 'QA_PASSED');
    assert.equal(after.run_state, 'SUCCEEDED');
    assert.equal(after.qa_recommendation, 'PASS');
    assert.equal(after.qa_engineer, 'agent-qa');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reviewer role PASS moves IN_REVIEW... wait, worker queues run_role reviewer starting from NEEDS_REVIEW->IN_REVIEW', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-worker-'));
  try {
    writeState(dir, 'sima', [
      { id: 'TASK-004', status: 'NEEDS_REVIEW', run_state: 'QUEUED', run_role: 'reviewer', run_agent_id: 'agent-r', test_command: 'npm test' },
    ]);
    const runAgent = async () => ({ code: 0, stdout: JSON.stringify({ status: 'PASS', test_command: 'npm test', exit_code: 0, summary: 'review ok', changed_files: [] }), stderr: '' });

    const worker = makeWorker(dir, { runAgent });
    const task = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-004');
    await worker.processQueuedTask(task);

    const after = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-004');
    assert.equal(after.status, 'IN_REVIEW');
    assert.equal(after.run_state, 'SUCCEEDED');
    assert.equal(after.review_recommendation, 'PASS');
    assert.equal(after.reviewer, 'agent-r');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isGitRepo and isDirty helpers return booleans', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-worker-'));
  try {
    // In this container git may not be installed; assert boolean returns and no throws.
    assert.equal(typeof isGitRepo(dir), 'boolean');
    assert.equal(typeof isDirty(dir), 'boolean');
    assert.equal(isGitRepo(path.join(dir, 'nonexistent')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dirty target repo is refused and task stays FAILED', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-worker-'));
  try {
    writeState(dir, 'sima', [
      { id: 'TASK-005', status: 'TODO', assigned_to: null, run_state: 'QUEUED', run_role: 'implementer', run_agent_id: 'agent-w', test_command: 'npm test' },
    ]);
    let dirtyCalls = 0;
    const worker = makeWorker(dir, {
      runAgent: async () => ({ code: 0, stdout: JSON.stringify({ status: 'PASS', summary: 'x' }), stderr: '' }),
      isDirtyFn: () => { dirtyCalls += 1; return true; }, // pretend dirty
    });
    const task = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-005');
    await worker.processQueuedTask(task);
    assert.equal(dirtyCalls, 1);
    const after = readState(dir, 'sima').tasks.find(t => t.id === 'TASK-005');
    assert.equal(after.status, 'REVISE');
    assert.equal(after.run_state, 'FAILED');
    assert.ok(after.last_error);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
