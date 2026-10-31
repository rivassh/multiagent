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
- **PROTOCOLS/REVIEWER.md**: Reviewer agent protocols including evidence-based review gate and Black-Box QA stage/E2E verification requirements.
- **state/runner_workflow.js**: Multi-agent runner workflow enforcing evidence-based verification gates and stage/E2E verification on sima.adlr.ir before DONE status.

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

### SUBROUTINE: ACQUIRE_LEASE (Rotating Mode)
1. Run `git fetch origin && git checkout main && git pull --rebase origin main`.
2. Acquire lease on `tasks.json` using the ACQUIRE_LEASE subroutine (§9).
3. Read `state/roles.json` and `state/council.md`.
4. Determine your role via round-robin rotation:
   - Read `rotation_pointer` from `state/roles.json`.
   - Your role = `roles[rotation_pointer % len(roles)]`.
   - Append yourself to `agent_role_history[YOUR_ID]` with your assigned role and timestamp.
   - Advance `rotation_pointer` by 1 in `state/roles.json`.
5. Read `state/tasks.json` and select route based on your assigned role:
   - **ROLE = DESIGNER**: Decompose requirements into atomic tasks (CASE A). Assign task to the IMPLEMENTER who will follow next in rotation. Update `state/team_log.md`.
   - **ROLE = IMPLEMENTER**: Claim an actionable task (CASE C): set `assigned_to = YOUR_ID`, `status = "IN_PROGRESS"`, `attempts = attempts + 1`.
   - **ROLE = REVIEWER**: Claim a completed task (CASE B): set `reviewer = YOUR_ID`, `status = "IN_REVIEW"`.
6. Run `git add state/roles.json state/tasks.json state/team_log.md` → commit → `git push origin main`.
7. Call `RELEASE_LEASE`.

### SUBROUTINE: RELEASE_LEASE (Rotating Mode)
1. Read `state/tasks.json` and `state/council.md`.
2. Based on your assigned role (from step 4 of ACQUIRE_LEASE):
   - **ROLE = IMPLEMENTER task succeeds**: Update `status = "DONE"`, append to `state/team_log.md` → commit → push.
   - **ROLE = IMPLEMENTER task fails**: Update `status = "REVISE"`, `last_error = "<clear actionable error>"` → commit → push.
   - **ROLE = REVIEWER**: Set `status = "APPROVED"` or `status = "REVISE"` with detailed feedback → commit → push.
3. Call `RELEASE_LEASE` (standard subroutine).
4. Terminate cycle.

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
- **state/roles.json**: Round-robin rotation state for role assignment.
- **state/inbox/**: FIFO mailbox for inter-agent message passing.
- **worktrees/**: Parallel Git Worktrees for each task (isolation).

## 12. Round-Robin Role Rotation

### Purpose
Replace fixed per-agent roles (DESIGNER, IMPLEMENTER, REVIEWER) with a rotating assignment so no agent permanently holds a single role. Prevents self-review, enables fair load distribution, and ensures every agent cycles through all responsibilities.

### Rotation Cycle
```
DESIGNER → IMPLEMENTER → REVIEWER → DESIGNER → ...
```

### State Contract
`state/roles.json`:
```json
{
  "version": 1,
  "rotation_pointer": 0,
  "roles": ["DESIGNER", "IMPLEMENTER", "REVIEWER"],
  "agent_role_history": {
    "agent-xxx": [
      {"role": "DESIGNER", "timestamp": "2026-10-27T12:00:00Z"},
      {"role": "IMPLEMENTER", "timestamp": "2026-10-27T12:05:00Z"}
    ]
  }
}
```

### Rotation Rules
1. **Pointer-based**: `rotation_pointer` is a shared counter. Each agent reads it, claims `roles[pointer % len(roles)]`, then advances the pointer by 1.
2. **No fixed assignment**: An agent's role changes every cycle. After implementing, the same agent rotates to reviewer in the next cycle.
3. **Self-review prevention**: The rotation pointer advances after each task completion, ensuring `reviewer` is always a different agent from `assigned_to` (in a 2+ agent swarm).
4. **Load balancing**: If an agent is busy (holding a lease), the next agent in line claims the next available role — no agent is permanently locked into one role.
5. **Auditability**: Every role assignment is recorded in `agent_role_history[YOUR_ID]` with a UTC timestamp.
6. **Starvation prevention**: If no actionable tasks exist for the current role, the agent calls `RELEASE_LEASE` and terminates — the next agent in rotation picks up the next available role.

### Role Responsibilities
- **DESIGNER**: Decompose new requirements into atomic tasks (TASK-XXX schema). Assign tasks to the IMPLEMENTER who follows next in rotation.
- **IMPLEMENTER**: Claim a TODO task, set `assigned_to = YOUR_ID`, `status = "IN_PROGRESS"`. Implement via TDD (Red → Green → Refactor). On completion, set `status = "DONE"`.
- **REVIEWER**: Claim a DONE/NEEDS_REVIEW task, set `reviewer = YOUR_ID`, `status = "IN_REVIEW"`. Verify against BDD tests and acceptance criteria. Set `status = "APPROVED"` or `status = "REVISE"` with detailed feedback.

## 14. Initial Tests
- **Unit Tests**: `tests/Feature/BDD/*.php` — BDD test suites for each task.
- **Integration Tests**: `tests/Integration/` — end-to-end workflow validation.
- **Lease Tests**: Verify heartbeat updates, zombie eviction, and lease acquisition/release.
- **Worktree Tests**: Ensure parallel task execution doesn't cause conflicts.
- **Council Tests**: Validate Design Council decision propagation.

## 15. Leases.json Schema (Updated)
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

## 16. Inbox Structure
```
state/inbox/
  ├── reviewer_agent-xxx.json   # Reviewer → Task messages
  ├── codewriter_agent-xxx.json  # CodeWriter → Task messages
  └── council_decision.json      # Council → Task messages
```

## 17. Design Council Protocol (state/council.md)
- **Purpose**: Centralized decision-making for high-impact tasks.
- **Process**:
  1. Task is flagged for council review.
  2. Council members (agents) evaluate the task against criteria.
  3. Decision recorded in `state/council.md`.
  4. Task status updated accordingly (APPROVED, REJECTED, REVISE).
- **Audit**: All council decisions are logged in `state/team_log.md`.

## 18. Worktree Directory Structure
```
worktrees/
  ├── task-TASK-001/    # Isolated worktree for TASK-001
  ├── task-TASK-024/    # Isolated worktree for TASK-024 (Generic Screening Engine)
  └── ...
```

## 19. Lease Management Flow
1. **Acquire**: Agent checks `last_heartbeat` (must be < 30s). If valid, acquires lease with 120s TTL.
2. **Heartbeat**: Agent updates `last_heartbeat` every 15s while holding lease.
3. **Release**: Agent releases lease after task completion or failure.
4. **Zombie Detection**: If `last_heartbeat` > 30s, another agent can force-break and take over.

## 20. Direct Chat Interception (Revisited)
- User message → `REQUIREMENT.md` (with UTC timestamp) → `ACQUIRE_LEASE` → task creation → execution → review → approval/rejection.
- All chat logs are preserved in `state/team_log.md`.

## 21. Zero-Manual-Edit Rule (Auto-Capture User Directive)
When a human operator issues any instruction in the chat environment (e.g., "بیلـد کن تسک‌های sima را بررسی و پیاده‌سازی کن"), the agent MUST perform the following steps automatically with a single terminal command sequence — zero manual editing:

### SUBROUTINE: CAPTURE_USER_DIRECTIVE
1. Generate directive template with current UTC timestamp and agent identity:
   ```bash
   YOUR_ID="${YOUR_ID:-agent-$(hostname)-$$}"
   TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```
2. Append directive to `REQUIREMENT.md`:
   ```bash
   printf '\n## User Directive [%s] (Captured by %s)\n%s\n' "$TS" "$YOUR_ID" "<user-directive-text>" >> REQUIREMENT.md
   ```
3. Execute auto-commit and push:
   ```bash
   git add REQUIREMENT.md && git commit -m "feat(requirement): auto-capture user directive for sima" && git push origin master
   ```
4. Start task processing cycle: Call `SUBROUTINE: ACQUIRE_LEASE` → Phase 1 task breakdown → execution lifecycle.

### Key Constraints
- **No manual editing**: The entire append → commit → push sequence runs as one terminal command block.
- **Mandatory**: Applies to every user directive, question, feature request, or bug report in chat.
- **Project target**: `[PROJECT]` is derived from the directive text (e.g., `sima`, `candash`); default `sima`.
- **Branch**: Push targets `master` (the remote default branch).

## 22. Language Protocol
- All agents must respond in **English** only.
- If a previous response was not in English, the agent must repeat the answer in **English**.
- Technical terms, file paths, command examples, and code snippets may retain their original language structure but the surrounding explanation must be in English.
- This protocol applies to all chat interactions, code reviews, task descriptions, state file entries, and documentation.
- Violations must be corrected in the next response cycle and logged in `state/team_log.md` with the tag `[LANG-CORRECT]`.

## 10. Strict Task State Machine & Lifecycle (TOP-MSG-058)
All tasks must strictly follow the 8-stage lifecycle:
`REQUIREMENT -> SPEC -> TEST -> CODE -> REVIEW -> REFINE -> VERIFY -> DONE`
- Implementer roles may only advance: SPEC -> TEST -> CODE -> REVIEW (status: TODO).
- Reviewer roles must route rework to: stage="REFINE", status="TODO" (NEVER APPROVED/DONE).
- Transition to DONE is strictly prohibited without stage="VERIFY" passing 100%.
