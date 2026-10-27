# Autonomous Git-Swarm Protocol Specification (AGENTS.md)

## 1. Core Operating Principles
- **SSOT (Single Source of Truth)**: Git remote (origin/main) is the ONLY coordination bus, communication channel, and memory. No local state persists across runs without a commit.
- **Distributed Concurrency**: Two-Phase Locking (2PL) via TTL-backed leases in `state/leases.json`. No state mutation without holding an active lease.
- **Identity**: Worker identity is read from `YOUR_ID` env. If unset, derive once and freeze: `YOUR_ID="agent-" + hostname + "-" + pid`.
- **Append-Only History**: `state/team_log.md` is strictly append-only. Never rewrite or truncate past entries.
- **Strict TDD**: Red (failing test) → Green (minimal implementation) → Refactor/Verify.
- **Docker-Only Execution**: ALL tool execution (PHP, Python, npm, node, composer, artisan, git, and any shell utility) MUST run inside Docker containers. NEVER use host-installed interpreters or binaries. All runtime dependencies (PHP 8.3, Python 3, Node.js, npm, etc.) are provided exclusively via Docker Compose services. This ensures environment reproducibility and isolation across all agents and tasks.

## 2. Shared File Contracts
- **REQUIREMENT.md**: Top-level source requirements and direct user requests.
- **docs/SPEC.md**: Technical architectural specifications, API contracts, interfaces.
- **state/tasks.json**: Distributed task queue (Statuses: TODO, IN_PROGRESS, NEEDS_REVIEW, IN_REVIEW, REVISE, DONE).
- **state/leases.json**: Distributed locking manifest with UTC TTL timestamps and `last_heartbeat`.
- **state/team_log.md**: Append-only ledger of actions, reviews, and test runs.
- **state/council.md**: Design Council protocol and decisions.
- **state/inbox/**: FIFO mailbox for inter-agent message passing (Reviewer → CodeWriter, etc.).

## 3. Direct User Chat Interception
When a human operator enters instructions, bug reports, feature requests, or questions directly in the chat interface:
1. DO NOT execute, code, or mutate application files directly from conversational context.
2. Call `SUBROUTINE: ACQUIRE_LEASE`.
3. Append the raw instruction into `REQUIREMENT.md` in this format:
   ```
   ## User Directive [UTC_ISO8601] (Captured by YOUR_ID)
   <Exact user message text>
   ```
4. Run:
   ```bash
   git add REQUIREMENT.md
   git commit -m "docs(directive): capture user chat input via YOUR_ID"
   git push origin main
   ```
5. Call `SUBROUTINE: RELEASE_LEASE`.
6. Trigger Phase 1 (Planning / Task Breakdown) to parse the requirement delta into atomic tasks in `state/tasks.json`.

## 4. Target Resolution & Hub-and-Spoke
- **Control Plane (Hub)**: `/opt/multiagent` — SSOT, task queue, lease management, and protocol enforcement.
- **Spoke (Target Subproject)**: `sima` — Talent Acquisition, Chat, Security, RAG modules. All tasks are registered in `state/tasks.json` under the SIMA project.
- **TARGET_SUBPROJECT = sima**
- Each subproject is accessed via a Git Worktree (see Section 5) to ensure isolation and prevent merge conflicts.

## 5. Git Worktree Isolation
For every new task, a separate Git Worktree is created in a parallel directory to guarantee isolation:

```bash
# Create a dedicated worktree for the task
git worktree add -b task/TASK-XXX ../worktrees/TASK-XXX master
```

- All code and test edits are executed **only** inside that Worktree and the target subproject's `../` path.
- This eliminates any possibility of merge conflicts between concurrent agents working on different tasks.
- The Worktree is cleaned up after task completion (or left for future reuse).

## 6. Heartbeat & Instant Zombie Eviction
- **Heartbeat field**: Added to `state/leases.json` as `last_heartbeat` (UTC ISO8601 timestamp).
- **Heartbeat update**: Each agent must update `last_heartbeat` in its lease record **every 15 seconds**.
- **Zombie eviction**: If `last_heartbeat` is older than **30 seconds**, another agent may `FORCE-BREAK` the lock and take ownership of the task.
- **Lease TTL**: 120 seconds (as per existing `LEASE_TTL_SECONDS`).
- **Lease acquisition** (ACQUIRE_LEASE) must verify the holder is still alive (heartbeat within 30s) before granting the lease.

## 7. Durable Mailbox & Design Council
- **Design Council** (state/council.md): Records decisions made during review phases, including task assignments, architecture changes, and protocol adjustments.
- **Inbox** (state/inbox/): FIFO mailbox for inter-agent communication.
  - `inbox/` directory stores messages (JSON or plain text) with metadata (sender, recipient, timestamp, type).
  - Agents read from `inbox/` before processing new tasks to ensure no messages are lost.
  - Reviewer → CodeWriter messages are routed through the inbox for auditability.

## 8. Operational Parameters
- **LEASE_TTL_SECONDS = 120**
- **MAX_RETRIES = 10**
- **BACKOFF_BASE_SECONDS = 2**
- **BACKOFF_MAX_SECONDS = 30**
- **HEARTBEAT_INTERVAL = 15** (seconds)
- **ZOMBIE_EVICTION_THRESHOLD = 30** (seconds)

## 9. Core Subroutines

### SUBROUTINE: ACQUIRE_LEASE
1. Run `git fetch origin && git checkout main && git pull --rebase origin main`.
2. Ensure `state/` directory exists. Read `state/leases.json` (initialize if missing: `{"version": 1, "leases": []}`).
3. Check record where `resource == "tasks.json"`:
   - **Case A** (no active lease): Proceed to step 4.
   - **Case B** (active lease, holder expired): Append to `state/team_log.md` `[FORCE-BREAK] Zombie lease of <holder> expired. Broken by YOUR_ID.` → proceed to step 4.
   - **Case C** (active lease, holder == YOUR_ID): Update `expires_at = current_utc_time + LEASE_TTL_SECONDS` → proceed to step 4.
   - **Case D** (active lease held by another worker): Sleep `min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * (2 ^ attempt)) + jitter` → continue retry loop.
4. Mutate record in `state/leases.json`:
   ```json
   {
     "resource": "tasks.json",
     "holder": "<YOUR_ID>",
     "lease_id": "<UUID>",
     "acquired_at": "<CURRENT_UTC_ISO8601>",
     "expires_at": "<CURRENT_UTC_ISO8601 + 120s>",
     "last_heartbeat": "<CURRENT_UTC_ISO8601>"
   }
   ```
5. Run `git add state/leases.json state/team_log.md` → commit → `git push origin main`.
6. If push succeeds: RETURN SUCCESS. If push fails (conflict/rejected): `git rebase --abort 2>/dev/null || true`, `git reset --hard origin/main`, sleep backoff, retry loop.
7. If MAX_RETRIES exceeded: ABORT cycle.

### SUBROUTINE: RELEASE_LEASE
1. Run `git fetch origin && git checkout main && git pull --rebase origin main`.
2. Read `state/leases.json`. Filter out entry where `resource == "tasks.json"` AND `holder == YOUR_ID`.
3. Run `git add state/leases.json` → commit → `git push origin main`.
4. If push fails: `git reset --hard origin/main`, retry.
5. If success: RETURN SUCCESS.

### SUBROUTINE: ACQUIRE_LEASE (Dev Mode)
1. Read `state/tasks.json` and `state/council.md`.
2. Select route:
   - **CASE A** (New/Unprocessed Requirements): Decompose delta requirements into sequential, atomic tasks in `state/tasks.json` (TASK-XXX schema). Update `state/team_log.md`. Run `git add state/tasks.json docs/` → commit → push.
   - **CASE B** (Pending Review Available): Set `reviewer = YOUR_ID`, `status = "IN_REVIEW"`. Run `git add state/tasks.json` → commit → push. Call `RELEASE_LEASE`.
   - **CASE C** (Actionable Task Available): Set `assigned_to = YOUR_ID`, `status = "IN_PROGRESS"`, `attempts = attempts + 1`. Run `git add state/tasks.json` → commit → push. Call `RELEASE_LEASE`.
   - **CASE D** (All Tasks Complete): Append to `state/team_log.md` `[PROJECT_COMPLETE] All tasks marked DONE at <timestamp> by YOUR_ID.` → commit → push. Call `RELEASE_LEASE`.
   - **CASE E** (Starvation/No Actionable Tasks): Call `RELEASE_LEASE` and terminate.

### SUBROUTINE: RELEASE_LEASE (Review Mode)
1. Run `git add state/leases.json` → commit → push.
2. If push fails: `git reset --hard origin/main`, retry.
3. If success: RETURN SUCCESS.

### SUBROUTINE: ACQUIRE_LEASE (Review Mode)
1. Read `state/tasks.json` and `state/council.md`.
2. Select route (same as above, but with `status = "NEEDS_REVIEW"` or `status = "IN_PROGRESS"`).
3. Acquire lease, claim task, run `RELEASE_LEASE`.

### SUBROUTINE: RELEASE_LEASE (Review Mode)
1. Run `git add state/leases.json` → commit → push.
2. If push fails: `git reset --hard origin/main`, retry.
3. If success: RETURN SUCCESS.

### SUBROUTINE: RELEASE_LEASE (Dev Mode)
1. Read `state/tasks.json` and `state/council.md`.
2. Select route (same as above).
3. Acquire lease, claim task, run `RELEASE_LEASE`.
4. If task completes successfully: Update `state/tasks.json` → `status = "DONE"`, append to `state/team_log.md` → commit → push.
5. If task fails: Update `state/tasks.json` → `status = "REVISE"`, `last_error = "<clear, actionable error details>"` → commit → push.
6. Call `RELEASE_LEASE`.
7. Terminate cycle.

### SUBROUTINE: ACQUIRE_LEASE (Design Council)
1. Read `state/council.md`.
2. If a task requires council approval, add a `council_decision` field to the task in `state/tasks.json`.
3. Notify the council via `state/inbox/` (Reviewer → Council).
4. Wait for council decision (simulated by a time-based check or explicit message).
5. Update task status based on council decision.

## 10. Direct Chat Interception
- User directives are captured in `REQUIREMENT.md` with UTC timestamp.
- The directive triggers the full task lifecycle (ACQUIRE_LEASE → task creation → execution → REVISE/APPROVED/REJECTED).
- All chat interactions are logged in `state/team_log.md` for auditability.

## 11. State & File Contracts
- **state/leases.json**: TTL-backed leases with `last_heartbeat` for zombie detection.
- **state/tasks.json**: Task queue with statuses: TODO, IN_PROGRESS, NEEDS_REVIEW, IN_REVIEW, REVISE, DONE.
- **state/team_log.md**: Append-only ledger of all actions, reviews, and test runs.
- **state/council.md**: Design Council decisions and protocol changes.
- **state/inbox/**: FIFO mailbox for inter-agent message passing.
- **worktrees/**: Parallel Git Worktrees for each task (isolation).

## 12. Initial Tests
- **Unit Tests**: `tests/Feature/BDD/*.php` — BDD test suites for each task.
- **Integration Tests**: `tests/Integration/` — end-to-end workflow validation.
- **Lease Tests**: Verify heartbeat updates, zombie eviction, and lease acquisition/release.
- **Worktree Tests**: Ensure parallel task execution doesn't cause conflicts.
- **Council Tests**: Validate Design Council decision propagation.

## 13. Leases.json Schema (Updated)
```json
{
  "version": 1,
  "leases": [
    {
      "resource": "tasks.json",
      "holder": "agent-xxx",
      "lease_id": "uuid",
      "acquired_at": "2026-10-27T12:00:00Z",
      "expires_at": "2026-10-27T13:00:00Z",
      "last_heartbeat": "2026-10-27T12:01:30Z"
    }
  ]
}
```

## 14. Inbox Structure
```
state/inbox/
  ├── reviewer_agent-xxx.json   # Reviewer → Task messages
  ├── codewriter_agent-xxx.json  # CodeWriter → Task messages
  └── council_decision.json      # Council → Task messages
```

## 15. Design Council Protocol (state/council.md)
- **Purpose**: Centralized decision-making for high-impact tasks.
- **Process**:
  1. Task is flagged for council review.
  2. Council members (agents) evaluate the task against criteria.
  3. Decision recorded in `state/council.md`.
  4. Task status updated accordingly (APPROVED, REJECTED, REVISE).
- **Audit**: All council decisions are logged in `state/team_log.md`.

## 16. Worktree Directory Structure
```
worktrees/
  ├── task-TASK-001/    # Isolated worktree for TASK-001
  ├── task-TASK-024/    # Isolated worktree for TASK-024 (Generic Screening Engine)
  └── ...
```

## 17. Lease Management Flow
1. **Acquire**: Agent checks `last_heartbeat` (must be < 30s). If valid, acquires lease with 120s TTL.
2. **Heartbeat**: Agent updates `last_heartbeat` every 15s while holding lease.
3. **Release**: Agent releases lease after task completion or failure.
4. **Zombie Detection**: If `last_heartbeat` > 30s, another agent can force-break and take over.

## 18. Direct Chat Interception (Revisited)
- User message → `REQUIREMENT.md` (with UTC timestamp) → `ACQUIRE_LEASE` → task creation → execution → review → approval/rejection.
- All chat logs are preserved in `state/team_log.md`.

## 19. Testing Setup
- **Test Discovery**: `tests/` directory with BDD-style tests.
- **Test Runner**: `phpunit` (or equivalent) configured to run all BDD tests.
- **Pre-flight**: `git status` check, `git pull` to ensure up-to-date state.
- **Post-execution**: Verify `state/tasks.json` reflects new statuses, `state/team_log.md` has entries, and `state/leases.json` has updated leases.
