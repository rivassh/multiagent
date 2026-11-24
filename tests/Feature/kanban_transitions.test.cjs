const assert = require('node:assert/strict');
const test = require('node:test');

const { KanbanTransitions, TransitionError } = require('../../state/kanban_transitions');

function baseTask(overrides = {}) {
  return {
    id: 'TASK-001',
    title: 'Sample task',
    status: 'TODO',
    assigned_to: null,
    reviewer: null,
    qa_engineer: null,
    attempts: 0,
    depends_on: [],
    ...overrides,
  };
}

test('TODO -> IN_PROGRESS by implementer is valid', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-1' });
  const task = baseTask({ assigned_to: 'agent-1' });
  const res = tr.validateTransition(task, 'IN_PROGRESS', {
    role: 'implementer',
    agentId: 'agent-1',
    evidence: {},
  });
  assert.equal(res.task.status, 'IN_PROGRESS');
  assert.equal(res.task.assigned_to, 'agent-1');
  assert.equal(res.task.attempts, 1);
});

test('TODO -> IN_PROGRESS by wrong role is rejected', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-1' });
  const task = baseTask();
  assert.throws(
    () => tr.validateTransition(task, 'IN_PROGRESS', { role: 'qa', agentId: 'agent-1' }),
    /requires role/
  );
});

test('IN_PROGRESS -> NEEDS_QA requires test_command/test_output evidence', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-1' });
  const task = baseTask({ status: 'IN_PROGRESS', assigned_to: 'agent-1' });
  assert.throws(
    () => tr.validateTransition(task, 'NEEDS_QA', { role: 'implementer', agentId: 'agent-1', evidence: {} }),
    /test_command/
  );

  const res = tr.validateTransition(task, 'NEEDS_QA', {
    role: 'implementer',
    agentId: 'agent-1',
    evidence: { test_command: 'npm test', test_output: 'all pass' },
  });
  assert.equal(res.task.status, 'NEEDS_QA');
});

test('NEEDS_QA -> QA_PASSED by qa sets qa_recommendation', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-qa' });
  const task = baseTask({ status: 'NEEDS_QA' });
  const res = tr.validateTransition(task, 'QA_PASSED', {
    role: 'qa',
    agentId: 'agent-qa',
    evidence: { qa_report: 'tests pass' },
  });
  assert.equal(res.task.status, 'QA_PASSED');
  assert.equal(res.task.qa_recommendation, 'PASS');
  assert.equal(res.task.qa_engineer, 'agent-qa');
});

test('QA_PASSED -> NEEDS_REVIEW by reviewer/claim', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-reviewer' });
  const task = baseTask({ status: 'QA_PASSED' });
  const res = tr.validateTransition(task, 'NEEDS_REVIEW', {
    role: 'reviewer',
    agentId: 'agent-reviewer',
  });
  assert.equal(res.task.status, 'NEEDS_REVIEW');
});

test('NEEDS_REVIEW -> IN_REVIEW by reviewer', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-reviewer' });
  const task = baseTask({ status: 'NEEDS_REVIEW' });
  const res = tr.validateTransition(task, 'IN_REVIEW', {
    role: 'reviewer',
    agentId: 'agent-reviewer',
  });
  assert.equal(res.task.status, 'IN_REVIEW');
  assert.equal(res.task.reviewer, 'agent-reviewer');
});

test('IN_REVIEW -> DONE requires qa_recommendation PASS and evidence_hash', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-reviewer' });
  const task = baseTask({
    status: 'IN_REVIEW',
    qa_recommendation: 'PASS',
    reviewer: 'agent-reviewer',
  });
  // Has review_report but missing evidence_hash -> fails on evidence_hash
  assert.throws(
    () => tr.validateTransition(task, 'DONE', { role: 'reviewer', agentId: 'agent-reviewer', evidence: { review_report: 'approved' } }),
    /evidence_hash/
  );

  const res = tr.validateTransition(task, 'DONE', {
    role: 'reviewer',
    agentId: 'agent-reviewer',
    evidence: { review_report: 'approved', evidence_hash: 'sha256:abc' },
  });
  assert.equal(res.task.status, 'DONE');
  assert.equal(res.task.review_recommendation, 'PASS');
});

test('IN_REVIEW -> DONE rejected when QA not PASS', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-reviewer' });
  const task = baseTask({ status: 'IN_REVIEW', qa_recommendation: null, reviewer: 'agent-reviewer' });
  assert.throws(
    () => tr.validateTransition(task, 'DONE', { role: 'reviewer', agentId: 'agent-reviewer', evidence: { review_report: 'x', evidence_hash: 'h' } }),
    /qa_recommendation == PASS/
  );
});

test('REVISE -> IN_PROGRESS bumps attempts', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-1' });
  const task = baseTask({ status: 'REVISE', assigned_to: 'agent-1', attempts: 2 });
  const res = tr.validateTransition(task, 'IN_PROGRESS', {
    role: 'implementer',
    agentId: 'agent-1',
  });
  assert.equal(res.task.status, 'IN_PROGRESS');
  assert.equal(res.task.attempts, 3);
});

test('role separation: author cannot be QA', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-1' });
  const task = baseTask({ status: 'NEEDS_QA', assigned_to: 'agent-1' });
  assert.throws(
    () => tr.validateTransition(task, 'QA_PASSED', { role: 'qa', agentId: 'agent-1', evidence: { qa_report: 'x' } }),
    /acts as both author and qa/
  );
});

test('role separation: QA cannot review own task', async t => {
  const tr = new KanbanTransitions({ yourId: 'agent-1' });
  const task = baseTask({ status: 'NEEDS_REVIEW', qa_engineer: 'agent-1' });
  assert.throws(
    () => tr.validateTransition(task, 'IN_REVIEW', { role: 'reviewer', agentId: 'agent-1' }),
    /acts as both/
  );
});

test('dependency gating: unmet dependency blocks transition', async t => {
  const tr = new KanbanTransitions({
    allTasks: [
      { id: 'TASK-001', status: 'DONE' },
      { id: 'TASK-002', status: 'TODO', depends_on: ['TASK-001'] },
    ],
    yourId: 'agent-1',
  });
  const task = baseTask({ id: 'TASK-003', status: 'TODO', depends_on: ['TASK-002'] });
  assert.throws(
    () => tr.validateTransition(task, 'IN_PROGRESS', { role: 'implementer', agentId: 'agent-1' }),
    /Unmet dependencies: TASK-002/
  );
});

test('dependency gating: cross-namespace dependency is invalid', async t => {
  const tr = new KanbanTransitions({
    allTasks: [{ id: 'TASK-001', status: 'DONE' }],
    yourId: 'agent-1',
  });
  const task = baseTask({ id: 'TASK-HR-001', status: 'TODO', depends_on: ['TASK-001'] });
  assert.throws(
    () => tr.validateTransition(task, 'IN_PROGRESS', { role: 'implementer', agentId: 'agent-1' }),
    /Unmet dependencies: TASK-001/
  );
});

test('reachableStatuses returns valid next steps', () => {
  const tr = new KanbanTransitions();
  assert.deepEqual(tr.reachableStatuses('TODO'), ['IN_PROGRESS']);
  assert.deepEqual(tr.reachableStatuses('DONE'), ['STAGE_VERIFIED']);
  assert.deepEqual(tr.reachableStatuses('STAGE_VERIFIED'), []);
});
