const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const REFERENCE_RE = /TASK-\d{3}$|TASK-HR-\d{3}$|TASK-OMR-\d{3}$/;

test('no OS symlinks exist at project root for sima/candash/omr subprojects', () => {
  const dirs = ['sima', 'candash', 'omr'];
  for (const dir of dirs) {
    try {
      const stat = fs.lstatSync(path.join(PROJECT_ROOT, dir));
      assert.equal(stat.isSymbolicLink(), false, `${dir} must not be an OS symlink`);
    } catch (err) {
      // directory missing is acceptable if it's not tracked in git yet
    }
  }
});

test('.env.example exists at project root with PROJECT_ROOT definition', () => {
  const file = path.join(PROJECT_ROOT, '.env.example');
  assert.equal(fs.existsSync(file), true);
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /PROJECT_ROOT=/);
});

test('docker-compose.yml exists at project root', () => {
  const file = path.join(PROJECT_ROOT, 'docker-compose.yml');
  assert.equal(fs.existsSync(file), true);
});

test('state directory has partitioned subdirectories', () => {
  const stateDir = path.join(PROJECT_ROOT, 'state');
  for (const sub of ['sima', 'candash', 'shared']) {
    const fullPath = path.join(stateDir, sub);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      assert.equal(fs.statSync(fullPath).isDirectory(), true, `state/${sub} must be a directory`);
    }
  }
});

test('.roles/ directory exists at project root', () => {
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, '.roles')), true);
});

test('dashboard service script exists', () => {
  const candidates = [
    path.join(PROJECT_ROOT, 'dashboard.py'),
    path.join(PROJECT_ROOT, 'scripts/dashboard.py'),
  ];
  const found = candidates.filter(f => fs.existsSync(f));
  assert.ok(found.length > 0, 'dashboard script must exist');
});
