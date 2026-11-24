const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const http = require('node:http');

const { KanbanApi } = require('../../dashboard/server');

function writeState(stateRoot, partition, tasks) {
  const dir = partition ? path.join(stateRoot, partition) : stateRoot;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({ version: 1, tasks }, null, 2));
  // leases file
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, 'leases.json'))) {
    fs.writeFileSync(path.join(dir, 'leases.json'), JSON.stringify({ version: 1, leases: [] }));
  }
}

function makeApi(stateRoot, gitRunner) {
  return new KanbanApi({
    stateRoot,
    port: 0,
    gitRunner,
    yourId: 'agent-tester',
  });
}

async function request(api, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => api.handle(req, res));
    server.listen(0, () => {
      const port = server.address().port;
      const reqOptions = {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {},
      };
      const r = http.request(reqOptions, res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        });
      });
      r.on('error', reject);
      if (body) r.write(JSON.stringify(body));
      r.end();
    });
  });
}

test('GET /api/tasks returns deduped tasks', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-api-'));
  try {
    writeState(dir, '', [
      { id: 'TASK-001', status: 'TODO', assigned_to: null },
      { id: 'TASK-002', status: 'DONE', assigned_to: 'a' },
    ]);
    writeState(dir, 'sima', [
      { id: 'TASK-001', status: 'TODO', assigned_to: null }, // identical dup
    ]);

    const calls = [];
    const gitRunner = { add: async () => { calls.push('add'); }, commit: async () => { calls.push('commit'); }, push: async () => { calls.push('push'); } };
    // KanbanApi expects gitRunner({cwd, args}); adapt
    const runner = async ({ args }) => { calls.push(args.join(' ')); return { code: 0, stdout: '', stderr: '' }; };
    const api = makeApi(dir, runner);

    await api.listen();
    try {
      const res = await request(api, 'GET', '/api/tasks');
      assert.equal(res.status, 200);
      assert.equal(res.body.count, 2);
      assert.equal(res.body.tasks[0].id, 'TASK-001');
      assert.equal(res.body.tasks[0]._source, 'root');
      assert.equal(res.body.tasks[0]._conflict, false);
    } finally {
      await api.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/tasks/:id/transition valid TODO->IN_PROGRESS', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-api-'));
  try {
    writeState(dir, 'sima', [{ id: 'TASK-001', status: 'TODO', assigned_to: null, attempts: 0 }]);

    const calls = [];
    const runner = async ({ args }) => { calls.push(args.join(' ')); return { code: 0, stdout: '', stderr: '' }; };
    const api = makeApi(dir, runner);
    await api.listen();
    try {
      const res = await request(api, 'POST', '/api/tasks/TASK-001/transition', {
        to_status: 'IN_PROGRESS',
        role: 'implementer',
        agent_id: 'agent-tester',
        evidence: { test_command: 'npm test', test_output: 'ok' },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.task.status, 'IN_PROGRESS');
      assert.equal(res.body.task.run_state, 'QUEUED');
      assert.equal(res.body.task.run_role, 'implementer');
    } finally {
      await api.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST transition invalid transition returns 400', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-api-'));
  try {
    writeState(dir, '', [{ id: 'TASK-001', status: 'DONE' }]);
    const runner = async ({ args }) => ({ code: 0, stdout: '', stderr: '' });
    const api = makeApi(dir, runner);
    await api.listen();
    try {
      const res = await request(api, 'POST', '/api/tasks/TASK-001/transition', {
        to_status: 'TODO',
        role: 'implementer',
        agent_id: 'agent-tester',
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.code === 'INVALID_TRANSITION' || res.body.error);
    } finally {
      await api.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST transition on conflicted task returns 409', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-api-'));
  try {
    writeState(dir, '', [{ id: 'TASK-001', status: 'TODO' }]);
    writeState(dir, 'sima', [{ id: 'TASK-001', status: 'IN_PROGRESS' }]);
    const runner = async ({ args }) => ({ code: 0, stdout: '', stderr: '' });
    const api = makeApi(dir, runner);
    await api.listen();
    try {
      const res = await request(api, 'POST', '/api/tasks/TASK-001/transition', {
        to_status: 'IN_PROGRESS',
        role: 'implementer',
        agent_id: 'agent-tester',
      });
      assert.equal(res.status, 409);
      assert.match(res.body.error, /CONFLICT/);
    } finally {
      await api.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /healthz returns git ok', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-api-'));
  try {
    writeState(dir, '', []);
    const runner = async ({ args }) => ({ code: 0, stdout: 'true', stderr: '' });
    const api = makeApi(dir, runner);
    await api.listen();
    try {
      const res = await request(api, 'GET', '/healthz');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.git.ok, true);
    } finally {
      await api.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
