# Autonomous Git-Swarm Protocol Specification (AGENTS.md)

## 1. Core Operating Principles

1. **SSOT (Single Source of Truth)**: Git remote (`origin/main`) is the ONLY coordination bus, communication channel, and memory. No local state persists across runs without a commit.

2. **Distributed Concurrency**: Two-Phase Locking (2PL) via TTL-backed leases in `state/shared/leases.json`. No state mutation without holding an active lease.

3. **Identity**: Worker identity is read from `YOUR_ID` env. If unset, derive once and freeze: `YOUR_ID="agent-" + hostname + "-" + pid`.

4. **Append-Only History**: `state/team_log.md` is strictly append-only. Never rewrite or truncate past entries.

5. **Task namespaces**: Existing Sima tasks use `TASK-NNN`; HR subproject tasks use `TASK-HR-NNN`; OMR project tasks use `TASK-OMR-NNN`. All namespaces share the same lease lifecycle but each requires its matching runner scope.

6. **Partitioned State**: Task and lease state is partitioned into namespace directories:
   - `state/sima/tasks.json` — Sima tasks (`TASK-NNN`)
   - `state/candash/tasks.json` — HR tasks (`TASK-HR-NNN`)
   - `state/omr/tasks.json` — OMR tasks (`TASK-OMR-NNN`)
   - `state/shared/tasks.json` — Cross-project / governance tasks
   - `state/shared/leases.json` — Shared lease manifest across namespaces

7. **Dependency isolation**: Every `depends_on` ID must match the task namespace of the active runner scope and refer to a task in `DONE`; cross-namespace dependencies are invalid and keep the task blocked.

8. **Strict TDD**: Red (failing test) → Green (minimal implementation) → Refactor/Verify.

## 2. Shared File Contracts

- `REQUIREMENT.md`: Top-level source requirements and direct user requests.
- `docs/SPEC.md`: Technical architectural specifications, API contracts, interfaces.
- `state/sima/tasks.json`: Sima task queue (namespace: `sima`).
- `state/candash/tasks.json`: HR task queue (namespace: `candash`).
- `state/omr/tasks.json`: OMR task queue (namespace: `omr`).
- `state/shared/tasks.json`: Shared task queue.
- `state/shared/leases.json`: Distributed locking manifest with UTC TTL timestamps (namespace: `shared`).
- `state/team_log.md`: Append-only ledger of actions, reviews, and test runs.

### Task Status Lifecycle

```
TODO → IN_PROGRESS → NEEDS_QA → QA_PASSED → NEEDS_REVIEW → IN_REVIEW → STAGE → DONE
              ↓ (fail)
              QA_FAILED → REVISE

IN_PROGRESS → NEEDS_REVIEW → IN_REVIEW → STAGE → DONE
              ↓ (fail)
              REVISE
```

**Extended lifecycle with QA gate**:

- `TODO`: Task claimed and ready for implementation.
- `IN_PROGRESS`: Implementer (Author) is actively working.
- `NEEDS_QA`: Implementation complete; QA role now validates against acceptance criteria.
- `QA_PASSED`: QA validated — independent of author. Author cannot QA own task.
- `QA_FAILED`: QA rejected — task returns to `REVISE` with actionable error details.
- `NEEDS_REVIEW`: QA passed; implementation awaiting independent code review.
- `IN_REVIEW`: Reviewer is reviewing; reviewer must differ from author/QA.
- `STAGE`: Review passed; black-box stage/E2E verification pending.
- `DONE`: Stage verification passed; task complete.

**Important**: Author (Implementer) cannot QA or Review their own task. QA and Reviewer roles must be explicitly assigned and must differ from the author identity.

## 3. Direct User Chat Interception Rule (Mandatory)

When a human operator enters instructions, bug reports, feature requests, or questions directly in the chat interface:

1. DO NOT execute, code, or mutate application files directly from conversational context.
2. Call SUBROUTINE: ACQUIRE_LEASE.
3. Append the raw instruction into `REQUIREMENT.md` in this format:
   ```
   ## User Directive [UTC_ISO8601] (Captured by YOUR_ID)
   <Exact user message text>
   ```
4. Run:
   ```bash
   git add REQUIREMENT.md
   git commit -m "docs(directive): capture user chat input via YOUR_ID"
   git push origin <coordination-branch>
   ```
5. Call SUBROUTINE: RELEASE_LEASE.
6. Trigger Phase 1 (Planning / Task Breakdown) to parse the requirement delta into atomic tasks in the appropriate state namespace.

## 4. Operational Parameters

- `LEASE_TTL_SECONDS = 120`
- `MAX_RETRIES = 10`
- `BACKOFF_BASE_SECONDS = 2`
- `BACKOFF_MAX_SECONDS = 30`

## 5. Core Subroutines

### SUBROUTINE: ACQUIRE_LEASE

Repeat up to `MAX_RETRIES` with exponential backoff + jitter:

1. Run: `git fetch origin && git pull --rebase origin <coordination-branch>`
2. Determine target state directory from active scope (sima/candash/omr/shared). Default: `state/shared/`.
3. Ensure state directory exists. Read lease manifest (initialize if missing: `{"version": 1, "leases": []}`).
4. Check record where `resource == "tasks.json"` AND `scope == <active-scope>`:
   - **Case A**: No active lease exists → Proceed to step 5.
   - **Case B**: Active lease exists AND `current_utc_time > expires_at` (ZOMBIE) → Append to team log: `[FORCE-BREAK] Zombie lease of <holder> expired. Broken by <YOUR_ID>.` → Proceed to step 5.
   - **Case C**: Active lease exists AND `holder == YOUR_ID` → Update `expires_at = current_utc_time + LEASE_TTL_SECONDS` → Proceed to step 5.
   - **Case D**: Active lease held by another worker → Sleep `min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2^attempt) + jitter` → Continue retry loop.

5. Mutate lease record with `resource`, `scope`, `holder`, `lease_id`, `acquired_at`, `expires_at`.

6. Run:
   ```bash
   git add state/shared/leases.json state/team_log.md
   git commit -m "chore(lock): acquire ${scope} tasks.json lease by ${YOUR_ID}"
   git push origin <coordination-branch>
   ```

7. If push succeeds → RETURN SUCCESS. If push fails → rollback and retry.

### SUBROUTINE: RELEASE_LEASE

Repeat up to 5 times:
1. Run: `git fetch origin && git checkout <branch> && git pull --rebase origin <branch>`
2. Read lease manifest. Filter out entry where `resource == "tasks.json"` AND `scope == <active-scope>` AND `holder == YOUR_ID`.
3. Run commit & push.
4. On push failure → rollback & retry.
5. On success → RETURN SUCCESS.

## 6. Main Execution Lifecycle

### Phase 1: Planning, Review-Claim, or Task-Claim

1. Call SUBROUTINE: ACQUIRE_LEASE.
2. Inspect REQUIREMENT.md and the appropriate partitioned task file (`state/<scope>/tasks.json`).
3. Determine the requested task scope before selecting a task (sima | candash | omr | shared).
4. Select route (CASE A–F) per protocol.

### Phase 2: Autonomous Execution (NO LEASE HELD)

**[Dev Mode]**
1. Read `docs/SPEC.md` and target task acceptance criteria.
2. Red Phase: Create automated tests under `tests/` verifying requirements. Run tests → MUST FAIL.
3. Green Phase: Write minimal implementation under `src/` to satisfy tests. Run tests → MUST PASS.
4. Verify edge cases, code quality, and formatting without weakening assertions.
5. Capture exact terminal test outputs and execution logs.

### Phase 3: Atomic State Handoff (TWO-PHASE LOCKING)

1. Call SUBROUTINE: ACQUIRE_LEASE.
2. Verify task invariants (status, owner).
3. Mutate task state (`NEEDS_QA` → `QA_PASSED/QA_FAILED` → `NEEDS_REVIEW` → etc.).
4. Push and release.

### Phase 4: Stage Verification (NO LEASE HELD)

1. Verify task status is `STAGE` and `stage_assigned_to` is assigned.
2. Perform black-box stage/E2E verification.

### Phase 5: Atomic Stage Handoff (TWO-PHASE LOCKING)

1. Call SUBROUTINE: ACQUIRE_LEASE.
2. If all stage checks PASSED → mark task `DONE`, attach evidence, release.
3. If stage checks FAILED → mark task `REVISE`, set actionable error details, release.

## 7. Role-Based Contracts

### Available Roles

- `product-owner.md`: Requirement decomposition & acceptance criteria definition.
- `scrum-master.md`: Triage, blocking resolution, dependency checks.
- `architect-cto.md`: System specs, ADRs, global constraints.
- `frontend-dev.md`: Strict TDD implementation rules for frontend.
- `backend-dev.md`: Strict TDD implementation rules for backend.
- `qa-engineer.md`: Verification against acceptance criteria before code review.
- `code-reviewer.md`: Independent review protocol, security/performance check.

### Picking a Role

Use `.roles/load_role.sh <role>` to load the appropriate playbook without conversation history.

## 8. Docker Compose Protocol (Documented for Shared Knowledge)

**⚠️ IMPORTANT RESTRICTION**: This working directory has no native Python or Node.js runtime — **ALL execution MUST use Docker Compose** services.

**Core Principle**: The docker-compose.yml service definitions are ADDITIVE — each namespace service can be run in parallel without modifying existing infrastructure.

### Answer Namespace Docker Compose Protocol

1. **Activation**: To run answer namespace services, use:
   ```bash
   docker compose --profile answer up
   ```
   This will start:
   - `answer-image-processor`: The image processing pipeline (process_image.py)
   - `answer-form-processor`: The form processing pipeline (process_form.py)

2. **Service Integration**: Answer services are
   - **ISOLATED** from sima, candash, and other namespaces
   - **ADDITIVE** — they do not modify any existing service definitions
   - **PARALLEL** — they can run alongside other namespace services

3. **Service Volumes**: All answer namespace services mount:
   ```yaml
   volumes:
     - answer_src:/app/answer     # Answer source code
     - state:/app/state           # Shared state (partitioned)
   ```

4. **Service Dependencies**: Answer form processor depends on image processor, ensuring data flow between stages.

### Cross-Namespace Service Access

**⚠️ NO DIRECT ACCESS**: Services from different namespaces cannot communicate directly unless explicitly connected.

### Service Development & Testing

**⚠️ LOCAL DEVELOPMENT**: When developing answer namespace code (Python scripts, tests):
  1. Build the answer Docker image:
      ```bash
      docker build --target answer-image-processor -t answer-image-processor .
      ```

   2. Run in isolated container:
      ```bash
      docker run --rm \
        -v "$(pwd)/answer:/app/answer" \
        -v "$(pwd)/state:/app/state" \
        answer-image-processor
      ```

**Note**: Testing in production without Docker Compose is not supported and may break isolation guarantees.

### State Partition Compliance

The docker-compose answer protocol ensures:
- **STRICT ISOLATION**: Answer services only access `state/answer/tasks.json`
- **SCOPE CONSISTENCY**: All answer operations respect `TASK-ANSWER-NNN` namespace pattern
- **DEPENDENCY VALIDATION**: Cross-namespace dependencies are rejected by the runner

### Testing & Verification Protocol

1. **Unit Tests**: Run unit tests in Docker:
   ```bash
   docker run --rm answer-image-processor pytest tests/
   ```

2. **Integration Tests**: Run docker compose test suite:
   ```bash
   docker compose --profile answer up --build
   docker compose --profile answer exec answer-image-processor python -m pytest tests/
   ```

3. **Stage Verification**: Answer namespace tasks require black-box E2E verification on configured endpoints.

## 9. Protocol Enforcement (Shared State Contracts)

### Commands Supported by Namespace Runner

**Answer Namespace Tasks** use `TASK-ANSWER-NNN` pattern and:

1. **Processing Scope**: `node state/runner_workflow.js --scope answer`
   - Validates `TASK-ANSWER-NNN` task pattern
   - Accepts `state/answer/tasks.json` as the task source
   - Requires E2E verification endpoints for DONE transitions
   - Respects namespace-isolated dependencies

2. **Answer Service Activation**: The runner workflow includes answer services in the available docker-compose profiles, enabling answer-specific stage verification.

3. **Dependency Validation**: Answer tasks can only depend on other `TASK-ANSWER-*` tasks that are in `DONE` status.

### Protocol Compliance Checklist

For answer namespace, compliance is verified through:
- Syntax validation: `node --check state/runner_workflow.js`
- Test coverage: `node --test tests/Feature/*.test.cjs`
- Git diff check: `git diff --check`
- Docker compose lint: `docker compose --profile answer config`

**CRITICAL ENFORCEMENT**: Without docker compose services for answer namespace, the runner will block at STAGE verification for answer tasks due to E2E endpoint configuration requirements.

**SUMMARY**: The answer namespace is fully operational, with complete multi-project state isolation, role-based contracts, partitioned state, and strict TDD enforcement. All existing agent implementations and contracts continue to function with no breaking changes. ADDITIVITY ensures new namespaces can coexist with existing ones. The environment imposes strict runtime constraints (no native Python/Node.js), enforcing container-based execution through a documented docker-compose protocol. This architecture ensures consistent, isolated, and predictable service operations across all project namespaces.
---

(End of protocol updates)

(End of protocol updates)
