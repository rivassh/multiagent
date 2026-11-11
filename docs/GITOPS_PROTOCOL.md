# Git-Swarm Protocol: Portable GitOps for Human Workflows

**Version:** 1.0  
**Scope:** Platform-agnostic (GitHub, GitLab, Gitea, Bitbucket, self-hosted Git)  
**Source:** Derived from AGENTS.md + runner_workflow.js analysis + incident review

---

## 1. Problem Statement

**GitOps ≠ Human Workflow Engine**

| Traditional GitOps (ArgoCD/Flux) | This Protocol |
|----------------------------------|---------------|
| Continuous reconciliation | Discrete task lifecycle |
| Cluster state = Git state | Task state = Git state |
| No human identity in loop | Author ≠ QA ≠ Reviewer (enforced) |
| Desired state = manifests | Desired state = task status machine |
| RBAC on K8s resources | RBAC on state transitions |

This protocol implements **Git-backed workflow orchestration** for human task pipelines with cryptographic evidence, role separation, and linearizable state changes.

---

## 2. Core Principles (from AGENTS.md)

### 2.1 Single Source of Truth (SSOT)
- **Git remote (origin/main)** is the ONLY coordination bus, communication channel, and memory
- No local state persists across runs without a commit
- All state mutations go through Git

### 2.2 Distributed Concurrency Control
- **Two-Phase Locking (2PL)** via TTL-backed leases in `state/<partition>/leases.json`
- No state mutation without holding an active lease
- Lease TTL: 120 seconds (configurable)

### 2.3 Identity
- Worker identity from `YOUR_ID` env var
- Format: `agent-<hostname>-<pid>` if unset
- Frozen for session duration

### 2.4 Append-Only History
- `state/<partition>/team_log.md` is strictly append-only
- Never rewrite or truncate past entries

### 2.5 Task Namespaces
| Namespace | Pattern | State Partition |
|-----------|---------|-----------------|
| SIMA | `TASK-NNN` | `state/sima/` |
| HR/Candash | `TASK-HR-NNN` | `state/candash/` |
| OMR | `TASK-OMR-NNN` | `state/shared/` |

### 2.6 Dependency Isolation
- Every `depends_on` ID must match the task namespace of the active runner scope
- Cross-namespace dependencies are invalid and keep the task blocked

### 2.7 Strict TDD
- Red (failing test) → Green (minimal implementation) → Refactor/Verify

### 2.8 Role Separation (MANDATORY)
- **Author ≠ QA ≠ Reviewer** for the same task
- No agent may act in more than one role for the same task
- Enforced at lease acquisition and state transition time

---

## 3. Extended Task Lifecycle (State Machine)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TASK STATE MACHINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TODO ──(claim+lease)──► IN_PROGRESS ──(tests pass+lease)──► NEEDS_QA     │
│       ▲                                                                    │
│       │                                                                    │
│       └────────(revision)──────────────────────────────────────────────────┘
│                                                                             │
│  NEEDS_QA ──(QA agent+lease+test run)──► QA_PASSED ──(auto)──► NEEDS_REVIEW │
│                    │                                                              │
│                    └─(fail)──► QA_FAILED ──(auto)──► REVISE                     │
│                                                                             │
│  NEEDS_REVIEW ──(Reviewer agent+lease)──► IN_REVIEW ──(approve+lease)──► DONE │
│                                              │                              │
│                                              └─(reject+lease)──► REVISE       │
│                                                                             │
│  DONE ──(stage E2E verification+lease)──► STAGE_VERIFIED (optional)        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Valid Transitions Table (EXHAUSTIVE - all others REJECTED)

| From | To | Role | Requires Lease | Requires Evidence |
|------|-----|------|----------------|-------------------|
| TODO | IN_PROGRESS | implementer | YES | NO |
| IN_PROGRESS | NEEDS_QA | implementer | YES | YES (test run) |
| IN_PROGRESS | REVISE | implementer | YES | NO |
| NEEDS_QA | QA_PASSED | qa | YES | YES (test run + hash) |
| NEEDS_QA | QA_FAILED | qa | YES | YES (test run + hash) |
| QA_PASSED | NEEDS_REVIEW | system | NO | NO (auto) |
| QA_FAILED | REVISE | system | NO | NO (auto) |
| NEEDS_REVIEW | IN_REVIEW | reviewer | YES | NO |
| IN_REVIEW | DONE | reviewer | YES | YES (review evidence) |
| IN_REVIEW | REVISE | reviewer | YES | YES (review evidence) |
| REVISE | IN_PROGRESS | implementer | YES | NO |
| DONE | STAGE_VERIFIED | stage_verifier | YES | YES (E2E evidence) |

**Any transition not in this table = PROTOCOL VIOLATION**

---

## 4. Lease System (Two-Phase Locking)

### 4.1 Lease Record Schema
```json
{
  "resource": "sima/tasks.json",
  "holder": "agent-hostname-12345",
  "lease_id": "uuid-v4",
  "role": "implementer|qa|reviewer|stage_verifier",
  "task_id": "TASK-096",
  "acquired_at": "2026-11-11T12:00:00Z",
  "expires_at": "2026-11-11T12:02:00Z"
}
```

### 4.2 Lease Acquisition Protocol (SUBROUTINE: ACQUIRE_LEASE)
```
REPEAT up to MAX_RETRIES (10) with exponential backoff:
  1. git fetch origin && git pull --rebase origin <coordination-branch>
  2. Read state/<partition>/leases.json
  3. Check existing lease for resource:
     - NONE: proceed
     - ZOMBIE (expired): force-break, log to team_log.md, proceed
     - OWN: extend expires_at, proceed
     - OTHER: backoff, retry
  4. Write new lease record
  5. git add leases.json team_log.md
  6. git commit -m "chore(lock): acquire <resource> by <holder> as <role>"
  7. git push origin <coordination-branch>
  8. SUCCESS or retry on conflict
```

### 4.3 Lease Release Protocol (SUBROUTINE: RELEASE_LEASE)
```
REPEAT up to 5 times:
  1. git fetch && git checkout main && git pull --rebase origin main
  2. Filter out lease where resource matches AND holder == YOUR_ID
  3. git add leases.json
  4. git commit -m "chore(lock): release <resource> by <holder>"
  5. git push origin <coordination-branch>
  6. SUCCESS or retry
```

### 4.4 Role Binding in Lease
- Lease `role` field binds identity to role for specific task
- Same identity CANNOT hold multiple role leases for same task
- Enforced at acquisition time

---

## 5. Evidence Requirements (Cryptographic Proof)

### 5.1 QA Evidence (Required for NEEDS_QA → QA_PASSED/FAILED)
```json
{
  "taskId": "TASK-096",
  "qaEngineer": "agent-hostname-12345",
  "timestamp": "2026-11-11T12:05:00Z",
  "gitCommit": "a1b2c3d4",
  "testCommand": "phpunit --testdox --log-junit junit.xml",
  "exitCode": 0,
  "stdout": "...",
  "stderr": "",
  "junitXml": "base64-encoded",
  "evidenceHash": "sha256(stdout + stderr)"
}
```

**Verification by Reviewer:**
1. Re-compute `evidenceHash` from stored stdout/stderr
2. Verify `gitCommit` exists in history
3. Verify `exitCode === 0` for PASS
4. Verify test coverage matches task acceptance criteria

### 5.2 Review Evidence (Required for IN_REVIEW → DONE/REVISE)
```json
{
  "taskId": "TASK-096",
  "reviewer": "agent-hostname-67890",
  "timestamp": "2026-11-11T12:10:00Z",
  "baseCommit": "origin/main",
  "headCommit": "a1b2c3d4",
  "diff": "unified diff of changed files",
  "approval": "PASS|FAIL",
  "comments": ["...", "..."],
  "signature": "git commit --gpg-sign output"
}
```

**Verification:**
1. Verify diff matches `baseCommit..headCommit`
2. Verify signature matches reviewer's git identity
3. Verify approval rationale matches code changes

### 5.3 Stage/E2E Evidence (Required for DONE → STAGE_VERIFIED)
```json
{
  "taskId": "TASK-096",
  "stageVerifier": "agent-hostname-11111",
  "timestamp": "2026-11-11T12:15:00Z",
  "endpoint": "https://staging.example.com",
  "checks": [
    {"name": "web_endpoint", "passed": true, "status": 200},
    {"name": "api_endpoint", "passed": true, "status": 200, "latencyMs": 145}
  ],
  "rawOutput": "curl -v output...",
  "evidenceHash": "sha256(rawOutput)"
}
```

---

## 6. Runner Architecture (Portable)

### 6.1 Runner Responsibilities
- **ONLY** processes tasks in states: `NEEDS_QA`, `NEEDS_REVIEW`, `REVISE`, `DONE` (for stage gate)
- **NEVER** auto-advances `TODO` → `IN_PROGRESS` or `IN_PROGRESS` → `NEEDS_QA`
- Implements Phase 2 (autonomous execution) and Phase 3 (atomic handoff)
- Does NOT hold leases during Phase 2 (execution)

### 6.2 Runner Phases

#### Phase 0: Preflight Cleanliness
```bash
git status --porcelain
# Inspect every changed/untracked path
# Never discard work with git reset --hard
# Synchronize with coordination branch
```

#### Phase 1: Planning / Task Claim (WITH LEASE)
```javascript
// ACQUIRE_LEASE
// Inspect REQUIREMENT.md + state/tasks.json
// Decompose or select task
// Mutate task: assign role, update status
// Commit + push
// RELEASE_LEASE
```

#### Phase 2: Autonomous Execution (NO LEASE)
```
Dev Mode:    Red (write failing tests) → Green (implement) → Verify
QA Mode:     Run test suite → Verify evidence → PASS/FAIL
Review Mode: Review diff → Verify evidence → PASS/FAIL
```

#### Phase 3: Atomic State Handoff (TWO-PHASE LOCKING)
```
ACQUIRE_LEASE
  → Pull latest, verify invariants
  → Mutate state (status, evidence, role assignments)
  → Commit + push
RELEASE_LEASE
```

#### Phase 4/5: Stage Verification (Optional, Production Deploy)
```
Black-box E2E against configured stage endpoint
Evidence captured → Atomic handoff with lease
```

---

## 7. Enforcement Layers (Defense in Depth)

### Layer 1: Runner Logic (Local)
- Validates transitions before mutation
- Enforces role separation at claim time
- Produces evidence artifacts

### Layer 2: Lease System (Git)
- TTL-backed mutual exclusion
- Role binding in lease record
- Force-break for zombie leases
- Append-only team_log.md audit trail

### Layer 3: State Machine Validation (Git Hook / CI)
- Exhaustive transition table
- Rejects any invalid transition
- Runs on every push to protected branches

### Layer 4: Evidence Verification (Git Hook / CI)
- QA evidence: hash + commit + exit code
- Review evidence: diff + signature
- Stage evidence: endpoint + raw output

### Layer 5: Platform Protection Rules (GitHub/GitLab/Gitea)
- Branch protection: required status checks, linear history
- Merge/PR approval rules
- Environment protection rules (for stage gate)

### Layer 6: CI/CD Pipeline (Portable)
- Runs validation scripts on every push/PR
- Fails build on protocol violation
- Reports status to platform

---

## 8. Platform-Agnostic Implementation Guide

### 8.1 Required Repository Structure
```
├── .github/              # GitHub Actions (if GitHub)
│   └── workflows/
│       └── protocol.yml
├── .gitlab/              # GitLab CI (if GitLab)
│   └── ci/
│       └── protocol.yml
├── .gitea/               # Gitea Actions (if Gitea)
│   └── workflows/
│       └── protocol.yml
├── scripts/              # PORTABLE validation scripts
│   ├── validate_transitions.js
│   ├── verify_role_separation.js
│   ├── verify_qa_evidence.js
│   ├── verify_review_evidence.js
│   ├── verify_leases.js
│   └── validate_all.js
├── state/
│   ├── sima/
│   │   ├── tasks.json
│   │   ├── leases.json
│   │   └── team_log.md
│   ├── candash/
│   │   ├── tasks.json
│   │   ├── leases.json
│   │   └── team_log.md
│   └── shared/
│       ├── tasks.json
│       ├── leases.json
│       └── team_log.md
├── REQUIREMENT.md
├── docs/
│   ├── SPEC.md
│   ├── RUNBOOK.md
│   ├── STAGE_EVIDENCE_CHECKLIST.md
│   └── GITOPS_PROTOCOL.md  (this file)
├── .roles/
│   ├── product-owner.md
│   ├── scrum-master.md
│   ├── architect-cto.md
│   ├── frontend-dev.md
│   ├── backend-dev.md
│   ├── qa-engineer.md
│   ├── code-reviewer.md
│   └── load_role.sh
└── AGENTS.md
```

### 8.2 Validation Scripts Interface (Platform-Independent)

All scripts exit with:
- **0** = PASS (protocol compliant)
- **1** = FAIL (protocol violation)
- **2** = ERROR (script bug)

#### `validate_transitions.js`
```bash
# Input: Git commit range or --all
# Checks: Every task status transition in history matches valid table
# Output: JSON report + exit code
node scripts/validate_transitions.js --since=origin/main..HEAD
```

#### `verify_role_separation.js`
```bash
# Input: Current tasks.json
# Checks: No task has same identity in assigned_to, qa_engineer, reviewer
# Output: Violations list + exit code
node scripts/verify_role_separation.js
```

#### `verify_qa_evidence.js`
```bash
# Input: Tasks with status in [QA_PASSED, QA_FAILED, NEEDS_REVIEW, IN_REVIEW, DONE]
# Checks: qa_evidence exists, hash matches, commit exists, exitCode valid
node scripts/verify_qa_evidence.js
```

#### `verify_review_evidence.js`
```bash
# Input: Tasks with status in [IN_REVIEW, DONE, STAGE_VERIFIED]
# Checks: review_evidence exists, diff valid, signature matches reviewer
node scripts/verify_review_evidence.js
```

#### `verify_leases.js`
```bash
# Input: Current leases.json + tasks.json
# Checks: Active lease holder matches task assignee/qa/reviewer; no expired leases held
node scripts/verify_leases.js
```

#### `validate_all.js` (Composite)
```bash
# Runs all validations
node scripts/validate_all.js
```

### 8.3 Platform-Specific CI Integration

#### GitHub Actions (`.github/workflows/protocol.yml`)
```yaml
name: Protocol Enforcement
on:
  push:
    branches: [main, develop]
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node scripts/validate_all.js
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# Branch Protection (Settings → Branches):
# Required status checks: "validate"
# Require linear history: true
# Require PR reviews: 1
```

#### GitLab CI (`.gitlab/ci/protocol.yml`)
```yaml
stages:
  - validate

protocol_validation:
  stage: validate
  image: node:20
  script:
    - npm ci
    - node scripts/validate_all.js
  rules:
    - if: $CI_PIPELINE_SOURCE == "push"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  artifacts:
    reports:
      junit: validation-report.xml

# Protected Branches (Settings → Repository → Protected Branches):
# Allowed to merge: Maintainers
# Required approvals: 1
```

#### Gitea Actions (`.gitea/workflows/protocol.yml`)
```yaml
name: Protocol Enforcement
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: node scripts/validate_all.js

# Branch Protection (Repository → Settings → Branches):
# Protected branches: main, develop
# Require status checks: "validate"
```

#### Generic Git Hooks (`.git/hooks/pre-push`)
```bash
#!/bin/bash
# Portable pre-push hook
node scripts/validate_all.js || {
  echo "❌ Protocol validation failed. Push rejected."
  exit 1
}
```

---

## 9. Incident Analysis: v3.0 Protocol Violation

### 9.1 What Happened
- 12 tasks (TASK-096 through TASK-107) completed by single agent `agent-ai-1036762`
- All transitions: `TODO → IN_PROGRESS → NEEDS_QA → QA_PASSED → NEEDS_REVIEW → IN_REVIEW → DONE`
- **Zero** independent QA or Review agents involved
- Runner `processImplementerPhase` auto-advanced to `NEEDS_QA`
- Runner `processQAPhase` checked metadata only, no test execution
- Runner `processReviewPhase` auto-approved to `DONE`

### 9.2 Root Causes in Runner
| Method | Bug |
|--------|-----|
| `processImplementerPhase` | Auto-advance without test execution |
| `processQAPhase` | Checks `task.test_output` field only, no test run |
| `processReviewerPhase` | Auto-approve to DONE |
| `processReviewPhase` | No role separation enforcement |
| No lease in Phase 2 | Violates 2PL |

### 9.3 Fixes Applied
1. **Eliminated auto-advance** - implementer phase runs OUTSIDE runner
2. **QA requires actual test run** + cryptographic evidence
3. **Review requires separate agent** + signed diff evidence
4. **Two-phase locking** mandatory for all mutations
5. **State machine validation** in CI

### 9.4 Remediation
- All 12 tasks rolled back to `NEEDS_REVIEW`
- `last_error`: "Protocol violation: Author performed QA+Review. Requires independent QA and Review agents."
- Runner patched with enforcement layers
- CI validation activated

---

## 10. Quick Start Checklist (New Repository)

- [ ] Copy `scripts/` validation scripts
- [ ] Configure platform CI (GitHub/GitLab/Gitea/Generic)
- [ ] Enable branch protection on `main`/`develop`
- [ ] Require status check "validate" (or platform equivalent)
- [ ] Require 1 approval on PR/MR
- [ ] Enable linear history
- [ ] Configure environments (staging/production) with protection rules
- [ ] Initialize `state/<partition>/` directories with empty JSON
- [ ] Add `REQUIREMENT.md`, `docs/SPEC.md`, `.roles/`
- [ ] Test: create task, run full lifecycle, verify CI catches violations

---

## 11. References

- **AGENTS.md** - Core protocol specification (this repo)
- **docs/SPEC.md** - Technical architecture, API contracts
- **docs/RUNBOOK.md** - Deploy, monitoring, rollback procedures
- **docs/STAGE_EVIDENCE_CHECKLIST.md** - Production deployment verification
- **state/runner_workflow.js** - Reference runner implementation
- **Temporal.io** - Durable execution model inspiration
- **GitHub Actions Environments** - Stage gate pattern
- **GitLab Merge Request Approvals** - Human gate pattern

---

## 12. License

This protocol specification is part of the multiagent project. See repository LICENSE.