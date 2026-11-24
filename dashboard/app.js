/* GitOps Kanban Dashboard - application logic, no CDN, self-contained */

const API_BASE = '';
const REFRESH_MS = 10000;

const STATUS_ORDER = [
  'TODO', 'IN_PROGRESS', 'NEEDS_QA', 'QA_PASSED', 'QA_FAILED',
  'NEEDS_REVIEW', 'IN_REVIEW', 'REVISE', 'DONE', 'STAGE_VERIFIED'
];

const ROLE_FOR_TRANSITION = {
  'TODO->IN_PROGRESS': 'implementer',
  'IN_PROGRESS->NEEDS_QA': 'implementer',
  'IN_PROGRESS->REVISE': 'implementer',
  'NEEDS_QA->QA_PASSED': 'qa',
  'NEEDS_QA->QA_FAILED': 'qa',
  'QA_FAILED->REVISE': 'system',
  'QA_PASSED->NEEDS_REVIEW': 'reviewer',
  'NEEDS_REVIEW->IN_REVIEW': 'reviewer',
  'IN_REVIEW->DONE': 'reviewer',
  'IN_REVIEW->REVISE': 'reviewer',
  'REVISE->IN_PROGRESS': 'implementer',
  'DONE->STAGE_VERIFIED': 'stage_verifier',
};

const EVIDENCE_HINT = {
  'TODO->IN_PROGRESS': 'No evidence required. Agent worktree will be created.',
  'IN_PROGRESS->NEEDS_QA': 'Required: test_command and test_output (agent evidence).',
  'IN_PROGRESS->REVISE': 'Required: reason for revision.',
  'NEEDS_QA->QA_PASSED': 'Required: QA agent report / hash.',
  'NEEDS_QA->QA_FAILED': 'Required: QA agent report / hash.',
  'QA_FAILED->REVISE': 'No evidence required.',
  'QA_PASSED->NEEDS_REVIEW': 'No evidence required.',
  'NEEDS_REVIEW->IN_REVIEW': 'No evidence required.',
  'IN_REVIEW->DONE': 'Required: review_report and evidence_hash.',
  'IN_REVIEW->REVISE': 'Required: review report.',
  'REVISE->IN_PROGRESS': 'No evidence required.',
  'DONE->STAGE_VERIFIED': 'Required: E2E evidence.',
};

let tasks = [];
let filters = { scope: 'all', assignee: '', search: '' };
let draggedCard = null;
let busy = false;

const board = document.getElementById('board');
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');
const modalErr = document.getElementById('modal-err');
const modalCancel = document.getElementById('modal-cancel');
const modalClose = document.getElementById('modal-close');
const statusEl = document.getElementById('status');
const healthPill = document.getElementById('health-pill');
const busyOverlay = document.getElementById('busy-overlay');

// Ensure busy overlay exists
if (!busyOverlay) {
  const ov = document.createElement('div');
  ov.id = 'busy-overlay';
  ov.textContent = 'Updating&#x2026;';
  document.body.appendChild(ov);
}

function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (kind || '');
}

function setBusy(b) {
  busy = b;
  const ov = document.getElementById('busy-overlay');
  if (ov) ov.style.display = b ? 'flex' : 'none';
  board.classList.toggle('busy', b);
}

function namespaceOf(id) {
  if (/^TASK-\d{3}$/.test(id)) return 'sima';
  if (/^TASK-HR-\d{3}$/.test(id)) return 'candash';
  if (/^TASK-OMR-\d{3}$/.test(id)) return 'shared';
  if (/^TASK-REFACTOR-\d{3}$/.test(id)) return 'root';
  return 'root';
}

function filterTasks(list) {
  return list.filter(t => {
    if (filters.scope !== 'all' && namespaceOf(t.id) !== filters.scope) return false;
    if (filters.assignee) {
      const a = String((t.assigned_to || '') + ' ' + (t.qa_engineer || '') + ' ' + (t.reviewer || '') + ' ' + (t.run_agent_id || '')).toLowerCase();
      if (!a.includes(filters.assignee.toLowerCase())) return false;
    }
    if (filters.search) {
      const s = String((t.id + ' ' + (t.title || '') + ' ' + (t.status || '') + ' ' + (t.last_error || '')).toLowerCase());
      if (!s.includes(filters.search.toLowerCase())) return false;
    }
    if (t._conflict) return false; // conflicted tasks are blocked
    return true;
  });
}

function runStatePill(t) {
  const rs = t.run_state || 'NONE';
  const cls = 'pill run-' + rs;
  return `<span class="${cls}" title="Run state: ${rs}">${rs}</span>`;
}

function statusBadge(status) {
  return `<span class="badge status-${status}">${status.replace(/_/g, ' ')}</span>`;
}

function metaValue(v) { return v ? String(v) : '\u2014'; }

function renderCard(t) {
  const assignee = metaValue(t.assigned_to);
  const qa = metaValue(t.qa_engineer);
  const reviewer = metaValue(t.reviewer);
  const attempts = t.attempts || 0;
  const branch = t.branch ? t.branch : '\u2014';
  const evidence = t.evidence_hash ? '&#10003;' : '\u2014';
  const error = t.last_error ? `! ${t.last_error}` : '';
  const runPill = runStatePill(t);

  return `
    <article class="card" draggable="true" data-id="${escapeHtml(t.id)}"
             data-status="${escapeHtml(t.status)}"
             role="button" aria-label="Task ${escapeHtml(t.id)}">
      <div class="card-head">
        <span class="card-id">${escapeHtml(t.id)}</span>
        ${runPill}
      </div>
      <div class="card-title">${escapeHtml(t.title || '')}</div>
      <div class="card-meta">
        <span class="meta meta-assignee" title="Author/implementer"><span class="meta-k">A:</span><span class="meta-v">${escapeHtml(assignee)}</span></span>
        <span class="meta meta-qa" title="QA"><span class="meta-k">Q:</span><span class="meta-v">${escapeHtml(qa)}</span></span>
        <span class="meta meta-reviewer" title="Reviewer"><span class="meta-k">R:</span><span class="meta-v">${escapeHtml(reviewer)}</span></span>
        <span class="meta meta-attempts" title="Attempts"><span class="meta-k">#:</span><span class="meta-v">${attempts}</span></span>
      </div>
      <div class="card-footer">
        <span class="card-branch" title="Branch">${escapeHtml(branch)}</span>
        <span class="card-evidence" title="Evidence hash">${evidence}</span>
        ${error ? `<span class="card-error" title="${escapeHtml(t.last_error)}">${escapeHtml(error)}</span>` : ''}
      </div>
    </article>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render() {
  const filtered = filterTasks(tasks);
  const byStatus = {};
  STATUS_ORDER.forEach(s => (byStatus[s] = []));

  filtered.forEach(t => {
    const col = byStatus[t.status];
    if (col) col.push(t);
  });

  board.innerHTML = '';
  STATUS_ORDER.forEach(status => {
    const colTasks = byStatus[status];
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.status = status;
    col.innerHTML = `
      <div class="col-head">
        <span class="col-title">${status.replace(/_/g, ' ')}</span>
        <span class="col-count">${colTasks.length}</span>
      </div>
      <div class="col-items" data-status="${status}"></div>
    `;
    const items = col.querySelector('.col-items');
    colTasks.forEach(t => {
      items.innerHTML += renderCard(t);
    });
    board.appendChild(col);

    // Drop targets
    const itemsEl = items;
    itemsEl.addEventListener('dragover', onDragOver);
    itemsEl.addEventListener('dragleave', onDragLeave);
    itemsEl.addEventListener('drop', () => onDrop(status));
  });

  // Attach card drag listeners after insert
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
    card.addEventListener('click', () => openMenu(card));
  });
}

function validTargets(from) {
  const map = {
    TODO: ['IN_PROGRESS'],
    IN_PROGRESS: ['NEEDS_QA', 'REVISE'],
    NEEDS_QA: ['QA_PASSED', 'QA_FAILED'],
    QA_FAILED: ['REVISE'],
    QA_PASSED: ['NEEDS_REVIEW'],
    NEEDS_REVIEW: ['IN_REVIEW'],
    IN_REVIEW: ['DONE', 'REVISE'],
    REVISE: ['IN_PROGRESS'],
    DONE: ['STAGE_VERIFIED'],
    STAGE_VERIFIED: [],
  };
  return map[from] || [];
}

function onDragStart(e) {
  draggedCard = e.currentTarget;
  draggedCard.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedCard.dataset.id);
}

function onDragEnd() {
  if (draggedCard) draggedCard.classList.remove('dragging');
  draggedCard = null;
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.col-items').forEach(i => i.classList.remove('drag-over'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!draggedCard) return;
  const from = draggedCard.dataset.status;
  const itemsEl = e.currentTarget;
  const to = itemsEl.dataset.status;
  const ok = validTargets(from).includes(to);
  itemsEl.classList.toggle('drag-over', ok);
  itemsEl.closest('.col').classList.toggle('drag-over', ok);
  if (!ok) itemsEl.setAttribute('title', `Invalid drop: ${from} \u2192 ${to} is not a valid transition`);
  else itemsEl.removeAttribute('title');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
  e.currentTarget.closest('.col').classList.remove('drag-over');
}

async function onDrop(toStatus) {
  if (!draggedCard) return;
  const taskId = draggedCard.dataset.id;
  const fromStatus = draggedCard.dataset.status;
  if (!validTargets(fromStatus).includes(toStatus)) return;
  openModal(taskId, fromStatus, toStatus);
}

function openMenu(card) {
  if (busy) return;
  const taskId = card.dataset.id;
  const fromStatus = card.dataset.status;
  const targets = validTargets(fromStatus);
  if (targets.length === 0) {
    setStatus('No valid transitions from ' + fromStatus, 'warn');
    setTimeout(() => setStatus(''), 2000);
    return;
  }
  // If only one target, go straight to modal; otherwise let user pick via modal's readonly field is single.
  openModal(taskId, fromStatus, targets[0]);
}

function openModal(taskId, fromStatus, toStatus) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const role = ROLE_FOR_TRANSITION[`${fromStatus}->${toStatus}`] || 'implementer';

  document.getElementById('modal-taskid').value = taskId;
  document.getElementById('modal-from').value = fromStatus;
  document.getElementById('modal-to').value = toStatus;
  document.getElementById('modal-to-status').value = toStatus;
  document.getElementById('modal-role').value = role;
  document.getElementById('modal-agent-id').value = '';
  document.getElementById('modal-evidence-text').value = '';
  document.getElementById('modal-confirm').checked = false;
  document.getElementById('modal-evidence-hint').textContent = EVIDENCE_HINT[`${fromStatus}->${toStatus}`] || '';
  modalErr.style.display = 'none';
  modalErr.textContent = '';
  modal.showModal();
}

modalCancel.addEventListener('click', () => modal.close());
modalClose.addEventListener('click', () => modal.close());
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

modalForm.addEventListener('submit', async e => {
  e.preventDefault();
  const taskId = document.getElementById('modal-taskid').value;
  const toStatus = document.getElementById('modal-to').value;
  const role = document.getElementById('modal-role').value;
  const agentId = document.getElementById('modal-agent-id').value.trim();
  const evidenceText = document.getElementById('modal-evidence-text').value.trim();
  const confirm = document.getElementById('modal-confirm').checked;

  if (!agentId) { showModalErr('Agent / operator ID is required.'); return; }
  if (!confirm) { showModalErr('Please confirm the transition.'); return; }

  const evidence = {};
  if (evidenceText) evidence.note = evidenceText;

  setBusy(true);
  modalErr.style.display = 'none';
  try {
    const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: toStatus, role, agent_id: agentId, evidence, confirm }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      showModalErr(body.error || `Transition failed (HTTP ${res.status})`);
      return;
    }
    modal.close();
    setStatus(`Transitioned ${taskId} to ${toStatus}`, 'ok');
    setTimeout(() => setStatus(''), 2000);
    await loadTasks();
  } catch (err) {
    showModalErr('Network error: ' + err.message);
  } finally {
    setBusy(false);
  }
});

function showModalErr(msg) {
  modalErr.textContent = msg;
  modalErr.style.display = 'block';
}

async function loadTasks() {
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    tasks = data.tasks || [];
    render();
    setStatus(`${tasks.length} tasks loaded`, 'ok');
    setTimeout(() => setStatus(''), 1500);
  } catch (err) {
    setStatus('Failed to load tasks: ' + err.message, 'bad');
  }
}

async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/healthz`, { cache: 'no-store' });
    const data = await res.json();
    const ok = data.ok && data.git && data.git.ok;
    healthPill.textContent = ok ? 'API healthy' : 'API degraded';
    healthPill.className = 'pill ' + (ok ? 'ok' : 'bad');
    if (data.worker) {
      healthPill.textContent += ` \u00b7 worker ${data.worker.activeRuns || 0} runs`;
    }
  } catch (err) {
    healthPill.textContent = 'API unreachable';
    healthPill.className = 'pill bad';
  }
}

document.getElementById('filter-scope').addEventListener('change', e => { filters.scope = e.target.value; render(); });
document.getElementById('filter-assignee').addEventListener('input', e => { filters.assignee = e.target.value; render(); });
document.getElementById('filter-search').addEventListener('input', e => { filters.search = e.target.value; render(); });
document.getElementById('btn-refresh').addEventListener('click', () => { loadTasks(); loadHealth(); });

loadTasks();
loadHealth();
setInterval(() => { loadTasks(); loadHealth(); }, REFRESH_MS);
