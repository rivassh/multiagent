'use strict';

/**
 * kanban_transitions.js
 * Transition rules, dependency gating, role separation, and evidence validation
 * for the GitOps Kanban protocol.
 *
 * Extended lifecycle:
 *   TODO -> IN_PROGRESS -> NEEDS_QA -> QA_PASSED | QA_FAILED -> NEEDS_REVIEW -> IN_REVIEW -> DONE
 *   plus REVISE branches and DONE -> STAGE_VERIFIED.
 */

const VALID_TRANSITIONS = new Set([
  'TODO->IN_PROGRESS',
  'IN_PROGRESS->NEEDS_QA',
  'IN_PROGRESS->REVISE',
  'NEEDS_QA->QA_PASSED',
  'NEEDS_QA->QA_FAILED',
  'QA_FAILED->REVISE',
  'QA_PASSED->NEEDS_REVIEW',
  'NEEDS_REVIEW->IN_REVIEW',
  'IN_REVIEW->DONE',
  'IN_REVIEW->REVISE',
  'REVISE->IN_PROGRESS',
  'DONE->STAGE_VERIFIED',
]);

// Role required to initiate each transition (from -> to)
const TRANSITION_ROLE = {
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

// Evidence required per transition.
const TRANSITION_EVIDENCE = {
  'TODO->IN_PROGRESS': false,
  'IN_PROGRESS->NEEDS_QA': true,    // test command/output/hash
  'IN_PROGRESS->REVISE': true,      // reason
  'NEEDS_QA->QA_PASSED': true,      // QA agent report/hash
  'NEEDS_QA->QA_FAILED': true,      // QA agent report/hash
  'QA_FAILED->REVISE': false,
  'QA_PASSED->NEEDS_REVIEW': false,
  'NEEDS_REVIEW->IN_REVIEW': false,
  'IN_REVIEW->DONE': true,          // review report + QA pass + evidence hashes
  'IN_REVIEW->REVISE': true,        // review report
  'REVISE->IN_PROGRESS': false,
  'DONE->STAGE_VERIFIED': true,     // E2E evidence
};

// Task id namespace patterns
const NAMESPACE_PATTERNS = {
  sima: /^TASK-\d{3}$/,
  candash: /^TASK-HR-\d{3}$/,
  shared: /^TASK-OMR-\d{3}$/,
  root: /^TASK-REFACTOR-\d{3}$/,
};

function namespaceOf(taskId) {
  if (NAMESPACE_PATTERNS.sima.test(taskId)) return 'sima';
  if (NAMESPACE_PATTERNS.candash.test(taskId)) return 'candash';
  if (NAMESPACE_PATTERNS.shared.test(taskId)) return 'shared';
  if (NAMESPACE_PATTERNS.root.test(taskId)) return 'root';
  return null;
}

function partitionOf(namespace) {
  const map = { sima: 'sima', candash: 'candash', shared: 'shared', root: 'root' };
  return map[namespace] || 'root';
}

class TransitionError extends Error {
  constructor(message, code = 'TRANSITION_ERROR') {
    super(message);
    this.name = 'TransitionError';
    this.code = code;
  }
}

class KanbanTransitions {
  constructor({ allTasks = [], yourId = null } = {}) {
    this.allTasks = allTasks;
    this.taskById = new Map();
    for (const t of allTasks) {
      this.taskById.set(t.id, t);
    }
    this.yourId = yourId;
  }

  setTasks(allTasks) {
    this.allTasks = allTasks;
    this.taskById = new Map();
    for (const t of allTasks) {
      this.taskById.set(t.id, t);
    }
  }

  setYourId(yourId) {
    this.yourId = yourId;
  }

  // Validate a single transition request.
  // task: current task object (resolved)
  // toStatus: desired status
  // role: role initiating (implementer|qa|reviewer|stage_verifier|system)
  // agentId: operator/agent id
  // evidence: object with transition evidence
  // Returns { ok: true, task: mutatedTask } or throws TransitionError.
  validateTransition(task, toStatus, { role, agentId, evidence = {} } = {}) {
    if (!task) throw new TransitionError(`Task not found`, 'TASK_NOT_FOUND');
    if (!toStatus) throw new TransitionError('to_status is required', 'MISSING_TO_STATUS');
    if (!role) throw new TransitionError('role is required', 'MISSING_ROLE');

    const from = task.status;
    const transition = `${from}->${toStatus}`;

    // Same status is a no-op, allowed (idempotent re-save)
    if (from === toStatus) {
      return { ok: true, task: { ...task } };
    }

    if (!VALID_TRANSITIONS.has(transition)) {
      throw new TransitionError(`Invalid transition: ${transition} not in transition table`, 'INVALID_TRANSITION');
    }

    // Required role check
    const requiredRole = TRANSITION_ROLE[transition];
    if (role !== requiredRole) {
      throw new TransitionError(
        `${transition} requires role "${requiredRole}", got "${role}"`,
        'WRONG_ROLE'
      );
    }

    // Role separation: agentId must not equal any previous role id for the task
    if (agentId && agentId !== 'unknown') {
      const roleViolation = this.checkRoleSeparation(task, role, agentId);
      if (!roleViolation.valid) {
        throw new TransitionError(roleViolation.reason, 'ROLE_SEPARATION_VIOLATION');
      }
    }

    // Dependency gating: all depends_on must be DONE and within same namespace
    const deps = Array.isArray(task.depends_on) ? task.depends_on : [];
    const unmet = [];
    for (const depId of deps) {
      const depNs = namespaceOf(depId);
      const taskNs = namespaceOf(task.id);
      if (!depNs || depNs !== taskNs) {
        unmet.push(depId);
        continue;
      }
      const dep = this.taskById.get(depId);
      if (!dep || dep.status !== 'DONE') {
        unmet.push(depId);
      }
    }
    if (unmet.length > 0) {
      throw new TransitionError(
        `Unmet dependencies: ${unmet.join(', ')}`,
        'UNMET_DEPENDENCIES'
      );
    }

    // Evidence requirements
    const needsEvidence = TRANSITION_EVIDENCE[transition];
    if (needsEvidence) {
      const evCheck = this.validateEvidence(transition, evidence, task);
      if (!evCheck.ok) {
        throw new TransitionError(evCheck.reason, 'MISSING_EVIDENCE');
      }
    }

    // DONE requires QA pass + evidence hashes (review_recommendation is set by this transition)
    if (toStatus === 'DONE') {
      if (task.qa_recommendation !== 'PASS') {
        throw new TransitionError('DONE requires qa_recommendation == PASS', 'QA_NOT_PASSED');
      }
      if (!task.evidence_hash && !evidence.evidence_hash) {
        throw new TransitionError('DONE requires evidence_hash', 'MISSING_EVIDENCE_HASH');
      }
    }

    // Apply mutation
    const mutated = { ...task };
    mutated.status = toStatus;

    // Role assignments
    if (role === 'implementer') mutated.assigned_to = agentId || mutated.assigned_to;
    if (role === 'qa') {
      mutated.qa_engineer = agentId || mutated.qa_engineer;
      if (toStatus === 'QA_PASSED') mutated.qa_recommendation = 'PASS';
      if (toStatus === 'QA_FAILED') mutated.qa_recommendation = 'FAIL';
    }
    if (role === 'reviewer') {
      mutated.reviewer = agentId || mutated.reviewer;
      if (toStatus === 'IN_REVIEW') {
        // reviewer has started reviewing
      }
      if (toStatus === 'DONE') mutated.review_recommendation = 'PASS';
      if (toStatus === 'REVISE') mutated.review_recommendation = 'FAIL';
    }
    if (role === 'stage_verifier') mutated.stage_verified_by = agentId || mutated.stage_verified_by;

    // Attempts bump on implementer transitions into IN_PROGRESS
    if (transition === 'TODO->IN_PROGRESS' || transition === 'REVISE->IN_PROGRESS') {
      mutated.attempts = (mutated.attempts || 0) + 1;
    }

    // Evidence carry-over
    if (evidence.test_output) mutated.test_output = evidence.test_output;
    if (evidence.test_command) mutated.test_command = evidence.test_command;
    if (evidence.evidence_hash) mutated.evidence_hash = evidence.evidence_hash;
    if (evidence.last_error) mutated.last_error = evidence.last_error;

    return { ok: true, task: mutated };
  }

  checkRoleSeparation(task, role, agentId) {
    const author = task.assigned_to;
    const qa = task.qa_engineer;
    const reviewer = task.reviewer;
    const stageVerifier = task.stage_verified_by;

    // A single identity may not hold two *distinct* roles on the same task.
    // The implementer role maps to author (assigned_to), so author==implementer is the same role.
    const roleField = {
      implementer: 'assigned_to',
      qa: 'qa_engineer',
      reviewer: 'reviewer',
      stage_verifier: 'stage_verified_by',
    }[role];

    const otherFields = {
      implementer: ['qa_engineer', 'reviewer', 'stage_verified_by'],
      qa: ['assigned_to', 'reviewer', 'stage_verified_by'],
      reviewer: ['assigned_to', 'qa_engineer', 'stage_verified_by'],
      stage_verifier: ['assigned_to', 'qa_engineer', 'reviewer'],
    }[role] || [];

    const present = (id) => id && id !== 'unknown' && id !== 'null';

    for (const field of otherFields) {
      const otherId = task[field];
      if (present(otherId) && otherId === agentId) {
        const otherRole = field === 'assigned_to' ? 'author' : field === 'qa_engineer' ? 'qa' : field === 'reviewer' ? 'reviewer' : 'stage_verifier';
        return {
          valid: false,
          reason: `Identity ${agentId} acts as both ${otherRole} and ${role} for the same task`,
        };
      }
    }

    // Terminal-state distinctness: author, qa, reviewer must be 3 distinct identities.
    const terminalStates = ['DONE', 'STAGE_VERIFIED'];
    const roles = [
      { role: 'author', id: author },
      { role: 'qa', id: qa },
      { role: 'reviewer', id: reviewer },
    ].filter(r => present(r.id));
    if (terminalStates.includes(task.status) && roles.length >= 3) {
      const uniqueIds = new Set(roles.map(r => r.id));
      if (uniqueIds.size < 3) {
        return {
          valid: false,
          reason: `Terminal state ${task.status} requires 3 distinct identities (author, qa, reviewer)`,
        };
      }
    }

    return { valid: true };
  }

  validateEvidence(transition, evidence, task) {
    // Implementer completing work needs test command/output/hash
    if (transition === 'IN_PROGRESS->NEEDS_QA') {
      if (!evidence.test_command && !task.test_command) {
        return { ok: false, reason: 'IN_PROGRESS->NEEDS_QA requires test_command evidence' };
      }
      if (!evidence.test_output && !task.test_output) {
        return { ok: false, reason: 'IN_PROGRESS->NEEDS_QA requires test_output evidence' };
      }
    }

    // QA transitions need QA report/hash
    if (transition === 'NEEDS_QA->QA_PASSED' || transition === 'NEEDS_QA->QA_FAILED') {
      if (!evidence.qa_report && !evidence.hash) {
        return { ok: false, reason: 'QA transition requires qa_report or hash evidence' };
      }
    }

    // Review DONE needs review report
    if (transition === 'IN_REVIEW->DONE') {
      if (!evidence.review_report) {
        return { ok: false, reason: 'IN_REVIEW->DONE requires review_report evidence' };
      }
    }

    // Stage verified needs E2E evidence
    if (transition === 'DONE->STAGE_VERIFIED') {
      if (!evidence.e2e_evidence) {
        return { ok: false, reason: 'DONE->STAGE_VERIFIED requires e2e_evidence' };
      }
    }

    return { ok: true };
  }

  // Validate that a proposed target status is reachable from current (for UI drop targets)
  reachableStatuses(fromStatus) {
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
    return map[fromStatus] || [];
  }
}

module.exports = { KanbanTransitions, TransitionError, VALID_TRANSITIONS, namespaceOf, partitionOf };
