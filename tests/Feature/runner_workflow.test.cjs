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
    { id: 'TASK-003', status: 'TODO', depends_on: ['TASK-HR-001'] },
    { id: 'TASK-004', status: 'TODO', depends_on: ['TASK-OMR-001'] },
    { id: 'TASK-HR-001', status: 'DONE' },
    { id: 'TASK-OMR-001', status: 'DONE' },
    { id: 'TASK-ZP-001', status: 'TODO' },
  ];
  const { runner, processed } = createRunner(t, tasks);

  await runner.processTaskLifecycle();

  assert.deepEqual(processed, ['TASK-001', 'TASK-002']);
  assert.deepEqual(runner.tasks.tasks.map(task => task.status), [
    'TODO', 'IN_PROGRESS', 'TODO', 'TODO', 'DONE', 'DONE', 'TODO',
  ]);
});

test('runner resolves partitioned state paths for each scope', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-partition-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  for (const scope of ['sima', 'candash', 'omr']) {
    const subdir = path.join(dir, scope);
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(path.join(subdir, 'tasks.json'), JSON.stringify({ version: 1, tasks: [] }));
  }
  fs.writeFileSync(path.join(dir, 'shared', 'leases.json'), JSON.stringify({ version: 1, leases: [] }));
  const simaRunner = new TaskRunner({ scope: 'sima', tasksFile: path.join(dir, 'sima', 'tasks.json'), leasesFile: path.join(dir, 'shared', 'leases.json') });
  assert.match(simaRunner.tasksFile, /sima/);
  assert.match(simaRunner.leasesFile, /shared/);
  const hrRunner = new TaskRunner({ scope: 'hr', tasksFile: path.join(dir, 'candash', 'tasks.json'), leasesFile: path.join(dir, 'shared', 'leases.json') });
  assert.match(hrRunner.tasksFile, /candash/);
  assert.match(hrRunner.leasesFile, /shared/);
  const omrRunner = new TaskRunner({ scope: 'omr', tasksFile: path.join(dir, 'omr', 'tasks.json'), leasesFile: path.join(dir, 'shared', 'leases.json') });
  assert.match(omrRunner.tasksFile, /omr/);
  assert.match(omrRunner.leasesFile, /shared/);
});

test('HR scope isolates HR tasks and waits for every dependency to be DONE', async t => {
  const tasks = [
    { id: 'TASK-001', status: 'TODO' },
    { id: 'TASK-HR-001', status: 'DONE' },
    { id: 'TASK-HR-006', status: 'TODO', depends_on: ['TASK-002'] },
    { id: 'TASK-002', status: 'DONE' },
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
  assert.equal(TaskRunner.parseScope(['--scope', 'omr']), 'omr');
  assert.equal(TaskRunner.parseScope(['--scope=omr']), 'omr');
  assert.throws(() => TaskRunner.parseScope(['--scope', 'all']), /Unsupported task scope/);
});

test('OMR scope processes only OMR tasks with completed dependencies', async t => {
  const tasks = [
    { id: 'TASK-001', status: 'DONE' },
    { id: 'TASK-004', status: 'DONE' },
    { id: 'TASK-HR-001', status: 'DONE' },
    { id: 'TASK-HR-006', status: 'DONE' },
    { id: 'TASK-OMR-001', status: 'DONE' },
    { id: 'TASK-OMR-002', status: 'TODO', depends_on: ['TASK-OMR-001'] },
    { id: 'TASK-OMR-003', status: 'TODO', depends_on: ['TASK-OMR-MISSING'] },
    { id: 'TASK-OMR-004', status: 'TODO', depends_on: ['TASK-001'] },
    { id: 'TASK-OMR-005', status: 'TODO', depends_on: ['TASK-HR-001'] },
  ];
  const { runner, processed } = createRunner(t, tasks, { scope: 'omr' });

  await runner.processTaskLifecycle();

  assert.deepEqual(processed, ['TASK-OMR-002']);
});

test('OMR stage verification blocks without URLs and performs no network requests', async t => {
  const { runner } = createRunner(t, [], { scope: 'omr', env: {} });
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('OMR stage endpoints must not be inferred');
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
  const task = { id: 'TASK-OMR-001', status: 'STAGE' };

  await runner.processStagePhase(task);

  assert.equal(fetchCalls, 0);
  assert.equal(task.status, 'STAGE');
  assert.match(task.last_error, /OMR_E2E_WEB_URL.*OMR_E2E_API_URL/);
});

test('OMR stage verification uses configured OMR web and API URLs only', async t => {
  const env = {
    OMR_E2E_WEB_URL: 'https://omr-stage.example.test/',
    OMR_E2E_API_URL: 'https://omr-stage.example.test/health',
  };
  const { runner } = createRunner(t, [], { scope: 'omr', env });
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url, options) => {
    requestedUrls.push({ url, options });
    return {
      status: 200,
      headers: {
        get: name => name === 'content-type'
          ? (options.headers.Accept === 'text/html' ? 'text/html' : 'application/json')
          : null,
      },
      text: async () => '<html><body><div id="app">OMR</div></body></html>',
      json: async () => ({ status: 'ok' }),
    };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await runner.performStageE2EVerification({ id: 'TASK-OMR-001' });

  assert.equal(result.success, true);
  assert.deepEqual(requestedUrls.map(request => request.url), [
    env.OMR_E2E_WEB_URL,
    env.OMR_E2E_API_URL,
  ]);
  assert.deepEqual(requestedUrls.map(request => request.options.method), ['GET', 'GET']);
  assert.ok(requestedUrls.every(request => !request.url.includes('sima.adlr.ir')));
});

test('invalid OMR stage URLs block verification without network access', async t => {
  const { runner } = createRunner(t, [], {
    scope: 'omr',
    env: {
      OMR_E2E_WEB_URL: 'https://user:password@omr-stage.example.test/',
      OMR_E2E_API_URL: 'file:///tmp/omr-health.json',
    },
  });
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Invalid stage URLs must not reach fetch');
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
  const task = { id: 'TASK-OMR-001', status: 'STAGE' };

  await runner.processStagePhase(task);

  assert.equal(fetchCalls, 0);
  assert.equal(task.status, 'STAGE');
  assert.match(task.last_error, /Invalid OMR stage URL configuration/);
});

test('OMR DONE gate does not reference SIMA endpoints when OMR URLs are missing', async t => {
  const { runner } = createRunner(t, [], { scope: 'omr', env: {} });
  const originalLog = console.log;
  const loggedMessages = [];
  console.log = message => loggedMessages.push(String(message));
  t.after(() => {
    console.log = originalLog;
  });

  await runner.validateDoneTransition({ id: 'TASK-OMR-001' });

  assert.ok(loggedMessages.some(message => message.includes('OMR_E2E_WEB_URL')));
  assert.ok(loggedMessages.every(message => !message.includes('sima.adlr.ir')));
});

test('a passed review moves a task to STAGE before E2E verification', async t => {
  const { runner } = createRunner(t, []);
  const task = { id: 'TASK-049', status: 'IN_REVIEW' };
  let stageChecks = 0;
  runner.performStageE2EVerification = async () => {
    stageChecks += 1;
    return { success: true, endpoint: 'http://stage.example.test' };
  };

  await runner.processReviewPhase(task);

  assert.equal(task.status, 'STAGE');
  assert.equal(stageChecks, 0);

  await runner.processStagePhase(task);

  assert.equal(stageChecks, 1);
  assert.equal(task.status, 'DONE');
  assert.equal(task.e2e_verified, true);
  assert.equal(runner.hasE2EVerification(task), true);
});

test('a failed stage check moves a reviewed task to REVISE', async t => {
  const { runner } = createRunner(t, []);
  const task = { id: 'TASK-049', status: 'STAGE' };
  runner.performStageE2EVerification = async () => ({
    success: false,
    endpoint: 'http://stage.example.test',
    error: 'chat UI returned HTTP 500',
  });

  await runner.processStagePhase(task);

  assert.equal(task.status, 'REVISE');
  assert.match(task.last_error, /chat UI returned HTTP 500/);
});
