# Autonomous Git-Swarm Protocol Specification (AGENTS.md)

1. Core Operating Principles
- SSOT (Single Source of Truth): Git remote (origin/main) is the ONLY coordination bus, communication channel, and memory. No local state persists across runs without a commit.
- Distributed Concurrency: Two-Phase Locking (2PL) via TTL-backed leases in state/leases.json. No state mutation without holding an active lease.
- Identity: Worker identity is read from YOUR_ID env. If unset, derive once and freeze: YOUR_ID="agent-" + hostname + "-" + pid.
- Append-Only History: state/team_log.md is strictly append-only. Never rewrite or truncate past entries.
- Strict TDD: Red (failing test) -> Green (minimal implementation) -> Refactor/Verify.

2. Shared File Contracts
- REQUIREMENT.md: Top-level source requirements and direct user requests.
- docs/SPEC.md: Technical architectural specifications, API contracts, interfaces.
- state/tasks.json: Distributed task queue (Statuses: TODO, IN_PROGRESS, NEEDS_REVIEW, IN_REVIEW, REVISE, DONE).
- state/leases.json: Distributed locking manifest with UTC TTL timestamps.
- state/team_log.md: Append-only ledger of actions, reviews, and test runs.

3. Direct User Chat Interception Rule (Mandatory)
When a human operator enters instructions, bug reports, feature requests, or questions directly in the chat interface:
1. DO NOT execute, code, or mutate application files directly from conversational context.
2. Call SUBROUTINE: ACQUIRE_LEASE.
3. Append the raw instruction into REQUIREMENT.md in this format:
   ## User Directive [UTC_ISO8601] (Captured by YOUR_ID)
   <Exact user message text>
4. Run:
   git add REQUIREMENT.md
   git commit -m "docs(directive): capture user chat input via YOUR_ID"
   git push origin main
5. Call SUBROUTINE: RELEASE_LEASE.
6. Trigger Phase 1 (Planning / Task Breakdown) to parse the requirement delta into atomic tasks in state/tasks.json.

4. Operational Parameters
- LEASE_TTL_SECONDS = 120
- MAX_RETRIES = 10
- BACKOFF_BASE_SECONDS = 2
- BACKOFF_MAX_SECONDS = 30

5. Core Subroutines

SUBROUTINE: ACQUIRE_LEASE
Repeat up to MAX_RETRIES with exponential backoff + jitter:
1. Run: git fetch origin && git checkout main && git pull --rebase origin main
2. Ensure state/ directory exists. Read state/leases.json (initialize if missing: {"version": 1, "leases": []}).
3. Check record where resource == "tasks.json":
   - Case A: No active lease exists -> Proceed to step 4.
   - Case B: Active lease exists AND current_utc_time > expires_at (ZOMBIE LEASE):
     Append to state/team_log.md: "[FORCE-BREAK] Zombie lease of <holder> expired. Broken by YOUR_ID."
     Proceed to step 4.
   - Case C: Active lease exists AND holder == YOUR_ID:
     Update expires_at = current_utc_time + LEASE_TTL_SECONDS.
     Proceed to step 4.
   - Case D: Active lease held by another worker:
     Sleep min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * (2 ^ attempt)) + jitter.
     Continue retry loop.
4. Mutate record in state/leases.json:
   {
     "resource": "tasks.json",
     "holder": "<YOUR_ID>",
     "lease_id": "<UUID>",
     "acquired_at": "<CURRENT_UTC_ISO8601>",
     "expires_at": "<CURRENT_UTC_ISO8601 + 120s>"
   }
5. Run:
   git add state/leases.json state/team_log.md
   git commit -m "chore(lock): acquire tasks.json lease by YOUR_ID"
   git push origin main
6. If push succeeds: RETURN SUCCESS.
   If push fails (conflict / rejected):
     git rebase --abort 2>/dev/null || true
     git reset --hard origin/main
     Sleep backoff, continue retry loop.
7. If MAX_RETRIES exceeded: ABORT cycle.

SUBROUTINE: RELEASE_LEASE
Repeat up to 5 times:
1. Run: git fetch origin && git checkout main && git pull --rebase origin main
2. Read state/leases.json. Filter out entry where resource == "tasks.json" AND holder == YOUR_ID.
3. Run:
   git add state/leases.json
   git commit -m "chore(lock): release tasks.json lease by YOUR_ID"
   git push origin main
4. If push fails: git reset --hard origin/main, retry.
5. If success: RETURN SUCCESS. (If persistent failure occurs, lease expires naturally via TTL).

6. Main Execution Lifecycle

Phase 0: Preflight Cleanliness
- Execute: git status --porcelain
  If uncommitted artifacts exist: git reset --hard HEAD && git clean -fd
- Execute: git checkout main && git pull origin main

Phase 1: Planning, Review-Claim, or Task-Claim
1. Call SUBROUTINE: ACQUIRE_LEASE.
2. Inspect REQUIREMENT.md and state/tasks.json (initialize if missing: {"version": 1, "tasks": []}).
3. Select route:

   - CASE A: New/Unprocessed Requirements Exist
     - Decompose delta requirements into sequential, atomic tasks adhering to TDD.
     - Task Schema:
       {
         "id": "TASK-XXX",
         "title": "...",
         "status": "TODO",
         "assigned_to": null,
         "reviewer": null,
         "attempts": 0,
         "last_error": null
       }
     - Update state/tasks.json and refine docs/SPEC.md.
     - Run:
       git add state/tasks.json docs/
       git commit -m "chore(plan): register atomic tasks for requirement delta"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Terminate cycle.

   - CASE B: Pending Review Available (status == "NEEDS_REVIEW" AND assigned_to != YOUR_ID AND reviewer == null)
     - Select target task. Set reviewer = YOUR_ID, status = "IN_REVIEW".
     - Run:
       git add state/tasks.json
       git commit -m "chore(review): claim review for ${task.id} by YOUR_ID"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Proceed to Phase 2 (Review Mode).

   - CASE C: Actionable Task Available (status IN ["REVISE", "TODO"])
     - Select first task (prioritize REVISE over TODO).
     - Set assigned_to = YOUR_ID, status = "IN_PROGRESS", attempts = attempts + 1.
     - Run:
       git add state/tasks.json
       git commit -m "chore(claim): claim ${task.id} by YOUR_ID"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Proceed to Phase 2 (Dev Mode).

   - CASE D: All Tasks Complete (status == "DONE")
     - Append to state/team_log.md: "[PROJECT_COMPLETE] All tasks marked DONE at <timestamp> by YOUR_ID."
     - Run:
       git add state/team_log.md
       git commit -m "chore(release): project completed"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Print "PROJECT COMPLETE" and terminate.

   - CASE E: Starvation / No Actionable Tasks
     - Call SUBROUTINE: RELEASE_LEASE. Terminate cycle.

Phase 2: Autonomous Execution (NO LEASE HELD)

[Dev Mode]
1. Read docs/SPEC.md and target task acceptance criteria.
2. Red Phase: Create automated tests under tests/ verifying requirements. Run tests -> MUST FAIL.
3. Green Phase: Write minimal implementation under src/ to satisfy tests. Run tests -> MUST PASS.
4. Verify edge cases, code quality, and formatting without weakening assertions.
5. Capture exact terminal test outputs and execution logs.
6. DO NOT edit state/tasks.json directly here. Proceed to Phase 3.

[Review Mode]
1. Run local test suite on the latest code: verify tests match docs/SPEC.md and pass cleanly.
2. Review implementation for anti-patterns, regressions, and security flaws.
3. Formulate strict binary verdict:
   - PASS: All criteria met, tests pass, regression clean.
   - FAIL: Tests fail, specification breach, or missing coverage.
4. Prepare diagnostic logs and failure trace if rejected. Proceed to Phase 3.

Phase 3: Atomic State Handoff (TWO-PHASE LOCKING)
1. Call SUBROUTINE: ACQUIRE_LEASE.
2. Pull latest and verify task invariants:
   - If Dev Mode: task id still assigned to YOUR_ID and status == "IN_PROGRESS".
   - If Review Mode: task id reviewer is YOUR_ID and status == "IN_REVIEW".
3. Mutate State:
   - If Dev Mode finished:
     Update task: status = "NEEDS_REVIEW".
     Append test execution metrics to state/team_log.md.
     Run:
       git add src/ tests/ state/tasks.json state/team_log.md
       git commit -m "feat(${task.id}): complete implementation, await review"
   - If Review Mode PASSED:
     Update task: status = "DONE".
     Append approval confirmation to state/team_log.md.
     Run:
       git add state/tasks.json state/team_log.md
       git commit -m "review(${task.id}): APPROVED [status=DONE]"
   - If Review Mode FAILED:
     Update task: status = "REVISE", last_error = "<clear, actionable error details>".
     Append rejection analysis to state/team_log.md.
     Run:
       git add state/tasks.json state/team_log.md
       git commit -m "review(${task.id}): REJECTED [status=REVISE]"
4. Run:
   git push origin main
   If rejected, perform: git pull --rebase origin main and push again.
5. Call SUBROUTINE: RELEASE_LEASE.
6. Terminate iteration cleanly.

