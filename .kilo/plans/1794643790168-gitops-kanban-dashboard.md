# GitOps Kanban Dashboard with Real Agent Execution

## Context

The current `dashboard/dashboard.html` is a read-only mock: drag-and-drop only logs a message, and `docker-compose.yml` mounts `./state` read-only. The repository has two state layouts:

- Canonical/current task data: `state/tasks.json` (71 tasks).
- Partition files: `state/sima/tasks.json`, `state/candash/tasks.json`, `state/shared/tasks.json` (local, stale, and sometimes duplicated).

The actual application code lives in nested Git repositories:

- `projects/sima` (`.git/HEAD` -> `develop`)
- `projects/candash` (`.git/HEAD` -> `main`)
- `projects/omr` is not currently a Git repository.

The existing `state/runner_workflow.js` auto-advances tasks without running an agent. It will remain as a separate CLI utility but will not be used by the dashboard flow.

## Decisions

- Dashboard writes to both state layouts with automatic detection; duplicate IDs with different statuses are blocked for mutation.
- Each browser session gets a generated agent ID, but the operator must explicitly enter/confirm the role ID for each stage. This preserves `Author != QA != Reviewer`.
- State transitions commit directly to `origin/master`.
- Agent code changes use a task branch in the target subproject and merge into the subproject base branch only after `DONE`.
- All stages can launch real agents: implementer, QA, reviewer, and optional stage verifier.
- Agent results are recommendations for QA/review; a human drag is still required for final approval and merge.
- Agents run only for clean tasks with a valid target repository. Existing dirty tasks use manual evidence transitions.
- Runtime is Docker Compose; backend implementation uses Node.js built-in HTTP (no new runtime dependency).

## Architecture

```
Browser (dashboard UI)
  -> dashboard service (Node HTTP API + static UI)
     -> state store / transition validator / lease manager
     -> Git: state commits to origin/master
     -> agent-worker service (filesystem/state queue)
        -> create isolated worktree in target subproject
        -> run AGENT_RUNNER_CMD (default: kilo wrapper)
        -> run tests / collect evidence
        -> commit task branch, update state, append team_log
```

### Target repository mapping

| Task namespace | Code repo | Base branch | State file |
|---|---|---|---|
| `TASK-NNN` | `projects/sima` | `SIMA_BASE_BRANCH` (default `develop`) | `state/tasks.json` or `state/sima/tasks.json` |
| `TASK-HR-NNN` | `projects/candash` | `CANDASH_BASE_BRANCH` (default `main`) | `state/tasks.json` or `state/candash/tasks.json` |
| `TASK-OMR-NNN` | `projects/omr` | `OMR_BASE_BRANCH` (default `main`) | `state/tasks.json` or `state/shared/tasks.json` |
| `TASK-REFACTOR-NNN` | root `multiagent` repo | `master` | `state/tasks.json` |
| Other/unknown | none | none | block agent run |

OMR agent runs are blocked until `projects/omr` is a Git repository with a configured remote.

## State schema additions

Add optional fields to each task without rewriting existing tasks:

```json
{
  "run_state": "NONE|QUEUED|RUNNING|SUCCEEDED|FAILED|BLOCKED",
  "run_id": "run-<uuid>",
  "run_role": "implementer|qa|reviewer|stage_verifier",
  "run_agent_id": "agent-...",
  "run_requested_at": "ISO8601",
  "run_started_at": "ISO8601",
  "run_finished_at": "ISO8601",
  "branch": "task/TASK-001/run-<uuid>",
  "worktree": "/worktrees/sima/TASK-001/run-<uuid>",
  "base_commit": "<sha>",
  "head_commit": "<sha>",
  "test_command": "npm test",
  "test_output": "...",
  "evidence_hash": "sha256:...",
  "qa_recommendation": "PASS|FAIL|null",
  "review_recommendation": "PASS|FAIL|null",
  "merged_at": "ISO8601|null",
  "merge_commit": "<sha>|null"
}
```

`last_error` remains the human-readable failure reason. Full logs are stored in `/var/log/gitops/<run-id>.log`; only summaries and evidence hashes go into Git.

## State file resolver

Implement `state/kanban_store.js`:

1. Read `state/tasks.json`, `state/sima/tasks.json`, `state/candash/tasks.json`, `state/shared/tasks.json`.
2. Index tasks by `id`.
3. If an ID exists in multiple files with different status or different `assigned_to`/`reviewer`/`qa_engineer`, mark it `CONFLICT` and reject mutations for that ID.
4. If duplicates are identical, choose `state/tasks.json` first, then the partition matching the ID namespace.
5. Return the resolved write target and lease resource:
   - `state/tasks.json` -> `state/leases.json`, resource `tasks.json`
   - `state/sima/tasks.json` -> `state/sima/leases.json`, resource `sima/tasks.json`
   - `state/candash/tasks.json` -> `state/candash/leases.json`, resource `candash/tasks.json`
   - `state/shared/tasks.json` -> `state/shared/leases.json`, resource `shared/tasks.json`
6. Write atomically: temp file + rename, then `git add`, `git commit`, `git push`.

## Transition rules

| From | To | Role | Evidence | Agent | Code effect |
|---|---|---|---|---|---|
| `TODO` | `IN_PROGRESS` | implementer | no | yes | create worktree/branch |
| `IN_PROGRESS` | `NEEDS_QA` | implementer | test command/output/hash | worker auto on success | commit/push task branch |
| `IN_PROGRESS` | `REVISE` | implementer | reason | no | keep branch |
| `NEEDS_QA` | `QA_PASSED` | QA | QA agent report/hash | yes | no merge |
| `NEEDS_QA` | `QA_FAILED` | QA | QA agent report/hash | yes | no merge |
| `QA_FAILED` | `REVISE` | system | no | no | keep branch |
| `QA_PASSED` | `NEEDS_REVIEW` | reviewer/claim | no | no | no merge |
| `NEEDS_REVIEW` | `IN_REVIEW` | reviewer | no | yes, reviewer agent | no merge |
| `IN_REVIEW` | `DONE` | reviewer | review report + QA pass | reviewer agent recommendation | merge branch, then mark DONE |
| `IN_REVIEW` | `REVISE` | reviewer | review report | reviewer agent recommendation | keep branch |
| `REVISE` | `IN_PROGRESS` | implementer | no | yes, new run | new worktree/branch |
| `DONE` | `STAGE_VERIFIED` | stage_verifier | E2E evidence | optional | no code change |

Rules:

- Reject any transition not in the table.
- Reject if dependencies are not `DONE` or are outside the task namespace.
- Reject if the selected role ID equals any previous role ID for that task.
- `DONE` requires `qa_recommendation == PASS`, `review_recommendation == PASS`, and evidence hashes.
- If a task has no branch and no agent run, allow manual evidence transitions but mark `run_state = BLOCKED` with reason `manual-evidence-only`.

## API

`dashboard/server.js` exposes:

- `GET /api/tasks` -> deduplicated tasks, run state, source file, conflict flags.
- `POST /api/tasks/:id/transition` body:
  ```json
  {
    "to_status": "IN_PROGRESS",
    "role": "implementer",
    "agent_id": "agent-...",
    "evidence": {"test_command": "...", "test_output": "..."},
    "confirm": true
  }
  ```
- `GET /api/tasks/:id/runs` -> run summary/history.
- `GET /api/runs/:id/logs` -> last N log lines from the worker volume.
- `GET /healthz` -> process, Git, worker heartbeat.

All mutating endpoints:

1. Re-read state from disk.
2. Validate transition, role separation, dependencies, and evidence.
3. Acquire lease with heartbeat/renewal.
4. Apply mutation.
5. Append `state/team_log.md`.
6. Commit and push to `origin/master`.
7. Release lease.
8. Return the updated task; UI refreshes from server state.

If push is rejected, abort the mutation, release the lease, and return HTTP 409 with the remote error.

## Agent worker

`state/agent_worker.js`:

1. Poll every 2 seconds for tasks with `run_state == QUEUED`.
2. Enforce `AGENT_MAX_CONCURRENT_RUNS` (default 1).
3. Acquire the role lease.
4. Resolve target repo and base branch.
5. Refuse if the target repo has uncommitted changes or is not a Git repo.
6. Create worktree:
   - `/worktrees/<scope>/<task-id>/<run-id>`
   - branch `task/<task-id>/<run-id>` from `origin/<base-branch>`
7. Write a prompt file containing:
   - task ID, title, summary, acceptance criteria, dependencies
   - role playbook path
   - target repo path and test command
   - instruction to follow TDD, avoid unrelated files, never print secrets
   - required final stdout JSON:
     ```json
     {"status":"PASS|FAIL","test_command":"...","exit_code":0,"summary":"...","changed_files":["..."]}
     ```
8. Run `AGENT_RUNNER_CMD` with placeholders `{worktree}`, `{prompt_file}`, `{task_id}`, `{role}`, `{repo}`.
9. Capture stdout/stderr to `/var/log/gitops/<run-id>.log`.
10. On success, run the test command if the agent did not already run it.
11. On PASS:
    - commit and push the task branch in the target repo
    - update task: `run_state=SUCCEEDED`, `head_commit`, `test_output`, `evidence_hash`
    - implementer: `status=NEEDS_QA`
    - QA: `qa_recommendation=PASS`, `status=QA_PASSED`
    - reviewer: `review_recommendation=PASS`, `status=IN_REVIEW`
12. On FAIL:
    - keep branch/worktree for debugging
    - update task: `run_state=FAILED`, `last_error`
    - implementer: `status=REVISE`
    - QA: `status=QA_FAILED`
    - reviewer: `status=REVISE`
13. Append team_log, commit/push state, release lease.

Lease TTL for agent runs is 900 seconds; the worker renews every 30 seconds. The dashboard API uses the normal 120-second TTL.

### Agent command

`.env.example`:

```env
AGENT_RUNNER_CMD=/opt/multiagent/scripts/run_agent.sh
AGENT_TIMEOUT_SECONDS=1800
TEST_TIMEOUT_SECONDS=900
AGENT_MAX_CONCURRENT_RUNS=1
WORKTREE_ROOT=/worktrees
```

`scripts/run_agent.sh` validates arguments and execs the configured command. The default wrapper targets `kilo`; the exact headless flags must be verified during implementation. Tests use a fake runner so CI does not require a real model.

## UI

Replace `dashboard/dashboard.html` with:

- `dashboard/index.html`
- `dashboard/app.js`
- `dashboard/styles.css`

Behavior:

- Columns: `TODO`, `IN_PROGRESS`, `NEEDS_QA`, `QA_PASSED`, `QA_FAILED`, `NEEDS_REVIEW`, `IN_REVIEW`, `REVISE`, `DONE`; horizontal scroll on small screens.
- Card: ID, title, assignee, QA, reviewer, attempts, run state, branch, evidence indicator, last error.
- Filters: scope (all/sima/hr/omr/refactor), assignee, text search.
- Drag to a valid column opens a modal for role ID and required evidence.
- Invalid drop targets are visually disabled with a reason tooltip.
- Keyboard alternative: select card, choose target status from a menu.
- Auto-refresh every 10 seconds; disable interaction during mutation.
- No CDN assets; no telemetry; self-contained CSS/JS.
- `aria-live` status region for success/error messages.

## Docker Compose

Update `docker-compose.yml`:

- `dashboard`: build from a small Node image or use `node:22-alpine`; mount root repo read-write at `/repo`, state at `/repo/state`, dashboard source at `/app`; expose `127.0.0.1:8080:8080`.
- `agent-worker`: same Node image; mount root repo read-write, subprojects read-write, `/worktrees` named volume, `/var/log/gitops` named volume; shares `/repo` and state.
- Add `worktrees_data` and `agent_logs` volumes.
- Do not mount `state` read-only.
- Add `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `AGENT_RUNNER_CMD`, base branch variables.
- Mount SSH/credential material read-only through a documented secret path; never bake credentials into the image.

## Files to add or change

- Add `state/kanban_store.js`
- Add `state/kanban_transitions.js`
- Add `state/agent_worker.js`
- Add `dashboard/server.js`
- Replace `dashboard/dashboard.html` with `dashboard/index.html`, `dashboard/app.js`, `dashboard/styles.css`
- Add `scripts/run_agent.sh`
- Add `tests/Feature/kanban_store.test.cjs`
- Add `tests/Feature/kanban_transitions.test.cjs`
- Add `tests/Feature/kanban_api.test.cjs`
- Add `tests/Feature/agent_worker.test.cjs`
- Update `docker-compose.yml`
- Update `.env.example`
- Update `docs/SPEC.md` dashboard section
- Update `package.json` with `test:kanban` / `test` scripts

## Implementation order

1. Implement `kanban_store.js` and tests for dedupe/conflict/write target.
2. Implement `kanban_transitions.js` and tests for valid/invalid transitions, dependencies, role separation, evidence.
3. Implement lease acquire/renew/release helpers and conflict tests.
4. Implement `dashboard/server.js` API with an injectable Git runner for tests.
5. Implement `agent_worker.js` with a fake runner and worktree cleanup tests.
6. Build the static UI and modal flows.
7. Update Compose, `.env.example`, and documentation.
8. Run unit/API tests and a Docker Compose smoke test with the fake runner.
9. Run one real low-risk task only after the fake-runner flow passes.

## Validation

- `node --test tests/Feature/kanban_*.test.cjs`
- `node --test tests/Feature/agent_worker.test.cjs`
- `docker compose config`
- `docker compose up -d dashboard agent-worker`
- `curl http://127.0.0.1:8080/healthz`
- Fake-runner drag: `TODO -> IN_PROGRESS -> NEEDS_QA` updates Git and UI.
- Conflict test: duplicate task IDs with different statuses are rejected.
- Lease test: second writer receives HTTP 409 while lease is active.
- Real-runner smoke: one clean `TASK-REFACTOR-*` or documentation task; verify branch, test output, state commit, and merge behavior.

## Risks

- Duplicate/stale partition files can cause blocked tasks until reconciled.
- Dirty subproject worktrees cannot be used by the isolated agent worker.
- The exact `kilo` headless invocation must be verified; the wrapper and fake runner prevent this from blocking implementation.
- Direct push to `origin/master` requires valid Git credentials inside the container.
- Long agent runs need lease heartbeat; a fixed 120-second TTL is insufficient.
- Merging task branches can conflict; conflicts must leave the task in `IN_REVIEW` with actionable `last_error`.

## Out of scope

- Creating or editing tasks from the dashboard.
- Full multi-user authentication/RBAC.
- Running agents against dirty worktrees.
- Initializing the missing OMR Git repository.
- Replacing the existing `state/runner_workflow.js`; it remains a separate CLI utility and is not used by the dashboard.