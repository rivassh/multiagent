# Autonomous Git-Swarm Protocol Specification (AGENTS.md)

1. Core Operating Principles
- SSOT (Single Source of Truth): Git remote (origin/main) is the ONLY coordination bus, communication channel, and memory. No local state persists across runs without a commit.
- Distributed Concurrency: Two-Phase Locking (2PL) via TTL-backed leases in state/leases.json. No state mutation without holding an active lease.
- Identity: Worker identity is read from YOUR_ID env. If unset, derive once and freeze: YOUR_ID="agent-" + hostname + "-" + pid.
- Append-Only History: state/team_log.md is strictly append-only. Never rewrite or truncate past entries.
- Task namespaces: Existing Sima tasks use `TASK-NNN`; HR subproject tasks use `TASK-HR-NNN`; OMR project tasks use `TASK-OMR-NNN`. All namespaces share partitioned state directories but each requires its matching runner scope.
- Dependency isolation: Every `depends_on` ID must match the task namespace of the active runner scope and refer to a task in `DONE`; cross-namespace dependencies are invalid and keep the task blocked.
- Strict TDD: Red (failing test) -> Green (minimal implementation) -> Refactor/Verify.
- Role Separation: Author != QA != Reviewer. No agent may act in more than one role for the same task.

2. Shared File Contracts
- REQUIREMENT.md: Top-level source requirements and direct user requests.
- docs/SPEC.md: Technical architectural specifications, API contracts, interfaces.
- .roles/: Role playbooks (product-owner.md, scrum-master.md, architect-cto.md, frontend-dev.md, backend-dev.md, qa-engineer.md, code-reviewer.md)
- .roles/load_role.sh: Entry script for role assumption
- state/sima/tasks.json: SIMA task queue
- state/candash/tasks.json: Candash/HR task queue
- state/shared/tasks.json: Shared/OMR task queue
- state/sima/leases.json: SIMA lease manifest
- state/candash/leases.json: Candash/HR lease manifest
- state/shared/leases.json: Shared/OMR lease manifest
- state/sima/team_log.md: SIMA append-only ledger
- state/candash/team_log.md: Candash/HR append-only ledger
- state/shared/team_log.md: Shared/OMR append-only ledger
- .env.example: Project root and subproject path definitions
- docker-compose.yml: Root orchestration for all projects

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
   git push origin <coordination-branch>
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
1. Run: git fetch origin && git pull --rebase origin <coordination-branch>
2. Determine partition from scope (sima, hr/candash, omr/shared, or global).
3. Ensure state/<partition>/ directory exists. Read state/<partition>/leases.json (initialize if missing: {"version": 1, "leases": []}).
4. Check record where resource == "<partition>/tasks.json" (or "tasks.json" for global):
   - Case A: No active lease exists -> Proceed to step 5.
   - Case B: Active lease exists AND current_utc_time > expires_at (ZOMBIE LEASE):
     Append to state/team_log.md: "[FORCE-BREAK] Zombie lease of <holder> expired. Broken by YOUR_ID."
     Proceed to step 5.
   - Case C: Active lease exists AND holder == YOUR_ID:
     Update expires_at = current_utc_time + LEASE_TTL_SECONDS.
     Proceed to step 5.
   - Case D: Active lease held by another worker:
     Sleep min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * (2 ^ attempt)) + jitter.
     Continue retry loop.
5. Mutate record in state/<partition>/leases.json:
   {
     "resource": "<partition>/tasks.json",
     "holder": "<YOUR_ID>",
     "lease_id": "<UUID>",
     "acquired_at": "<CURRENT_UTC_ISO8601>",
     "expires_at": "<CURRENT_UTC_ISO8601 + 120s>"
   }
6. Run:
   git add state/<partition>/leases.json state/team_log.md
   git commit -m "chore(lock): acquire <partition>/tasks.json lease by YOUR_ID"
   git push origin <coordination-branch>
7. If push succeeds: RETURN SUCCESS.
   If push fails (conflict / rejected):
     git rebase --abort 2>/dev/null || true
     git reset --hard origin/main
     Sleep backoff, continue retry loop.
8. If MAX_RETRIES exceeded: ABORT cycle.

SUBROUTINE: RELEASE_LEASE
Repeat up to 5 times:
1. Run: git fetch origin && git checkout main && git pull --rebase origin main
2. Read state/<partition>/leases.json. Filter out entry where resource == "<partition>/tasks.json" AND holder == YOUR_ID.
3. Run:
   git add state/<partition>/leases.json
   git commit -m "chore(lock): release <partition>/tasks.json lease by YOUR_ID"
   git push origin <coordination-branch>
4. If push fails: git reset --hard origin/main, retry.
5. If success: RETURN SUCCESS. (If persistent failure occurs, lease expires naturally via TTL).

6. Main Execution Lifecycle

Phase 0: Preflight Cleanliness
- Execute: git status --porcelain and inspect every changed/untracked path.
- Never discard work with `git reset --hard` or `git clean`. Preserve unrelated changes; stop and ask before proceeding if task files overlap or their ownership is unclear.
- Synchronize with the configured coordination branch without switching branches that contain user work.

Phase 1: Planning, Review-Claim, or Task-Claim
1. Call SUBROUTINE: ACQUIRE_LEASE with appropriate scope.
2. Inspect REQUIREMENT.md and state/<partition>/tasks.json (initialize if missing: {"version": 1, "tasks": []}).
3. Determine the requested task scope before selecting a task:
   - If the user explicitly requests HR tasks, consider only IDs matching `TASK-HR-NNN`; never fall back to a `TASK-NNN` item. If no HR task is actionable, release the lease and report that no HR task is ready.
   - Otherwise, consider only IDs matching `TASK-NNN`; do not select HR or OMR tasks unless the user explicitly requests that scope or names an exact task ID.
   - For an explicit OMR request, consider only IDs matching `TASK-OMR-NNN`.
   - If a task has `depends_on`, every referenced ID must match the active scope's task pattern and refer to a `DONE` task; missing, malformed, or cross-namespace dependencies keep it blocked.
4. Select route:

   - CASE A: New/Unprocessed Requirements Exist
     - Decompose delta requirements into sequential, atomic tasks adhering to TDD.
     - Task Schema:
       {
         "id": "TASK-XXX",
         "title": "...",
         "status": "TODO",
         "assigned_to": null,
         "reviewer": null,
         "qa_engineer": null,
         "stage_assigned_to": null,
         "attempts": 0,
         "last_error": null
       }
       For HR subproject tasks, use the `TASK-HR-XXX` ID namespace.
       For OMR project tasks, use the `TASK-OMR-XXX` ID namespace.
     - Update state/<partition>/tasks.json and refine docs/SPEC.md.
     - Run:
       git add state/<partition>/tasks.json docs/
       git commit -m "chore(plan): register atomic tasks for requirement delta"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Terminate cycle.

   - CASE B: Pending QA Available (status == "NEEDS_QA" AND qa_engineer == null)
     - Select target task. Set qa_engineer = YOUR_ID, status = "NEEDS_QA" (processing).
     - Run:
       git add state/<partition>/tasks.json
       git commit -m "chore(qa): claim QA for ${task.id} by YOUR_ID"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Proceed to Phase 2 (QA Mode).

   - CASE C: Pending Review Available (status == "NEEDS_REVIEW" AND assigned_to != YOUR_ID AND reviewer == null)
     - Select target task. Set reviewer = YOUR_ID, status = "IN_REVIEW".
     - Run:
       git add state/<partition>/tasks.json
       git commit -m "chore(review): claim review for ${task.id} by YOUR_ID"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Proceed to Phase 2 (Review Mode).

   - CASE D: Actionable Task Available (status IN ["REVISE", "TODO"])
     - Select first task (prioritize REVISE over TODO).
     - Set assigned_to = YOUR_ID, status = "IN_PROGRESS", attempts = attempts + 1.
     - Run:
       git add state/<partition>/tasks.json
       git commit -m "chore(claim): claim ${task.id} by YOUR_ID"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Proceed to Phase 2 (Dev Mode).

   - CASE E: All Tasks Complete (status == "DONE")
     - Append to state/team_log.md: "[PROJECT_COMPLETE] All tasks marked DONE at <timestamp> by YOUR_ID."
     - Run:
       git add state/team_log.md
       git commit -m "chore(release): project completed"
       git push origin main
     - Call SUBROUTINE: RELEASE_LEASE. Print "PROJECT COMPLETE" and terminate.

   - CASE F: Starvation / No Actionable Tasks
     - Call SUBROUTINE: RELEASE_LEASE. Terminate cycle.

Phase 2: Autonomous Execution (NO LEASE HELD)

[Dev Mode]
1. Read docs/SPEC.md and target task acceptance criteria.
2. Red Phase: Create automated tests under tests/ verifying requirements. Run tests -> MUST FAIL.
3. Green Phase: Write minimal implementation under src/ to satisfy tests. Run tests -> MUST PASS.
4. Verify edge cases, code quality, and formatting without weakening assertions.
5. Capture exact terminal test outputs and execution logs.
6. DO NOT edit state/tasks.json directly here. Proceed to Phase 3.

[QA Mode]
1. Run local test suite on the latest code: verify tests match docs/SPEC.md and pass cleanly.
2. Perform exploratory testing against acceptance criteria.
3. Verify code quality: linting, formatting, patterns, security.
4. Formulate strict binary verdict:
   - QA_PASSED: All criteria met, tests pass, quality acceptable.
   - QA_FAILED: Tests fail, criteria not met, or quality issues.
5. Prepare diagnostic logs and failure trace if rejected. Proceed to Phase 3.

[Review Mode]
1. Run local test suite on the latest code: verify tests match docs/SPEC.md and pass cleanly.
2. Review implementation for anti-patterns, regressions, and security flaws.
3. Verify role separation: Reviewer != Author != QA.
4. Formulate strict binary verdict:
   - PASS: All criteria met, tests pass, regression clean.
   - FAIL: Tests fail, specification breach, or missing coverage.
5. Prepare diagnostic logs and failure trace if rejected. Proceed to Phase 3.

Phase 3: Atomic State Handoff (TWO-PHASE LOCKING)
1. Call SUBROUTINE: ACQUIRE_LEASE.
2. Pull latest and verify task invariants:
   - If Dev Mode: task id still assigned to YOUR_ID and status == "IN_PROGRESS".
   - If QA Mode: task id qa_engineer is YOUR_ID and status == "NEEDS_QA".
   - If Review Mode: task id reviewer is YOUR_ID and status == "IN_REVIEW".
3. Mutate State:
   - If Dev Mode finished:
     Update task: status = "NEEDS_QA".
     Append test execution metrics to state/team_log.md.
     Run:
       git add src/ tests/ state/<partition>/tasks.json state/team_log.md
       git commit -m "feat(${task.id}): complete implementation, await QA"
   - If QA Mode PASSED:
     Update task: status = "NEEDS_REVIEW".
     Append QA approval to state/team_log.md.
     Run:
       git add state/<partition>/tasks.json state/team_log.md
       git commit -m "qa(${task.id}): PASSED [status=NEEDS_REVIEW]"
   - If QA Mode FAILED:
     Update task: status = "REVISE", last_error = "<clear, actionable error details>".
     Append rejection analysis to state/team_log.md.
     Run:
       git add state/<partition>/tasks.json state/team_log.md
       git commit -m "qa(${task.id}): FAILED [status=REVISE]"
   - If Review Mode PASSED:
     Update task: status = "DONE".
     Append review approval to state/team_log.md.
     Run:
       git add state/<partition>/tasks.json state/team_log.md
       git commit -m "review(${task.id}): APPROVED [status=DONE]"
   - If Review Mode FAILED:
     Update task: status = "REVISE", last_error = "<clear, actionable error details>".
     Append rejection analysis to state/team_log.md.
     Run:
       git add state/<partition>/tasks.json state/team_log.md
       git commit -m "review(${task.id}): REJECTED [status=REVISE]"
4. Run:
   git push origin <coordination-branch>
   If rejected, perform: git pull --rebase origin main and push again.
5. Call SUBROUTINE: RELEASE_LEASE.
6. Terminate iteration cleanly.

Phase 4: Stage Verification (NO LEASE HELD) - Optional for Production Deploy
1. Verify the task is still assigned to YOUR_ID for stage verification and remains in status `DONE`.
2. Verify the reviewed revision in the configured stage environment using black-box checks for the task acceptance criteria, including relevant UI and API flows. Unit tests or mocked responses alone are not stage evidence.
3. Capture the stage URL, exact commands, test output, and pass/fail result. Never substitute a production endpoint for a configured stage endpoint.
4. Do not edit state/tasks.json directly. Proceed to Phase 5.

Phase 5: Atomic Stage Handoff (TWO-PHASE LOCKING) - Optional for Production Deploy
1. Call SUBROUTINE: ACQUIRE_LEASE.
2. Verify the task still has status `DONE`, `stage_verified_by == YOUR_ID`, and the evidence corresponds to the reviewed revision.
3. If all required stage checks PASSED:
   - Update task: set `stage_verified_by = YOUR_ID`, attach the stage verification evidence.
   - Append stage approval and verification metrics to state/team_log.md.
   - Commit with `git add state/<partition>/tasks.json state/team_log.md` and `git commit -m "stage(${task.id}): VERIFIED"`.
4. If any required stage check FAILED:
   - Update task: status = "REVISE", set last_error to actionable failure details.
   - Append rejection and diagnostic details to state/team_log.md.
   - Commit with `git add state/<partition>/tasks.json state/team_log.md` and `git commit -m "stage(${task.id}): FAILED [status=REVISE]"`.
5. Push to the configured coordination branch, then call SUBROUTINE: RELEASE_LEASE.

7. Extended Task Lifecycle
Statuses: TODO -> IN_PROGRESS -> NEEDS_QA -> QA_PASSED | QA_FAILED -> NEEDS_REVIEW -> IN_REVIEW -> DONE
- TODO: Task created, ready for work
- IN_PROGRESS: Author implementing
- NEEDS_QA: Implementation complete, awaiting QA
- QA_PASSED: QA approved, ready for review
- QA_FAILED: QA rejected, needs revision
- NEEDS_REVIEW: QA passed, awaiting code review
- IN_REVIEW: Reviewer reviewing
- DONE: Review approved, all gates passed
- REVISE: Task needs revision (from QA_FAILED or review rejection)

8. Role Contracts
- .roles/product-owner.md: Product Owner playbook
- .roles/scrum-master.md: Scrum Master playbook
- .roles/architect-cto.md: Architect/CTO playbook
- .roles/frontend-dev.md: Frontend Developer playbook
- .roles/backend-dev.md: Backend Developer playbook
- .roles/qa-engineer.md: QA Engineer playbook
- .roles/code-reviewer.md: Code Reviewer playbook
- .roles/load_role.sh: Entry script for role assumption

9. Partitioned State Schema
- state/sima/: SIMA project state (tasks.json, leases.json, team_log.md)
- state/candash/: Candash/HR project state
- state/shared/: Shared/OMR project state
- Each partition has independent lease management
- Runner resolves paths via getStatePaths(scope) function

10. Dashboard Service
- Lightweight Kanban viewer at http://localhost:8080
- Reads state/*/tasks.json directly from files
- Displays task statuses across all partitions
- Auto-refreshes every 30 seconds