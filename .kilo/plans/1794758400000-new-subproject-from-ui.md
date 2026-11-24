# Plan: Add new subproject from Kanban UI

**Goal:** Let an operator create a new subproject (code repo + state partition + task namespace) from the Kanban dashboard UI, register it in a data-driven project registry, and have dashboard + agent-worker discover and serve it without code edits. Includes an auto-generated docker-compose app service.

## Context (from codebase inspection)

- 4 namespaces map to code repo + state partition, **hardcoded** in 4 files:
  - `state/kanban_store.js` (`partitionForId`, `PARTITIONS`)
  - `state/kanban_transitions.js` (`namespaceOf`, `partitionOf`, `NAMESPACE_PATTERNS`)
  - `state/agent_worker.js` (`REPO_MAP`)
  - `dashboard/server.js` (`partitionNameForTask`)
- Existing: `sima`→`projects/sima` (develop), `candash`→`projects/candash` (main), `shared`→`projects/omr` (main, not yet a git repo), `root`→`.` (master)
- State partitions: `state/<name>/tasks.json` + `state/<name>/leases.json`
- `docker-compose.yml` mounts `./:/app:rw` into dashboard + agent-worker (write access OK)
- `projects/cchat` and `projects/omr` are empty placeholder dirs
- Dashboard already runs at `http://127.0.0.1:8080` via `docker compose`

## Decisions (all confirmed)

| # | Decision |
|---|----------|
| 1 | Scope: new subproject = empty git repo `projects/<name>`, state partition `state/<name>/`, env vars `<NAME>_PROJECT_PATH|_STATE_PATH|_BASE_BRANCH`, registry entry, auto-generated compose app service |
| 2 | Project discovery via `state/projects.json` registry; dashboard reads per-request, agent-worker reads each poll |
| 3 | Compose: dashboard appends a new app-service block to `docker-compose.yml` (`build: ./projects/<name>`, operator adds Dockerfile); operator runs `docker compose up -d` |
| 4 | App service: `build` from project dir, operator-specified host port (default next free from 8018) |
| 5 | Git remote: operator-provided URL; empty = local-only repo (agent runs blocked until remote configured) |
| 6 | Task ID numbering: scan all tasks matching `<prefix>-NNN`, max+1 (start 001) |

## Files to create / modify (ordered)

### New files
1. `state/projects.json` — project registry seed. Entries for sima, candash, shared, root with fields `{name, taskPrefix, codeRepo, stateDir, baseBranch, composePort, needsDb, gitRemote, gitBranch}`.
2. `tests/Feature/project_registry.test.cjs` — registry load/validate, uniqueness, next-task-id, namespace resolution.
3. `tests/Feature/project_api.test.cjs` — `GET /api/projects`, `POST /api/projects` (create, validation errors, dirs/files created).

### Modified files
4. `state/kanban_store.js` — derive `PARTITIONS` + `partitionForId` from registry (default to existing 4 if registry missing). Read tasks from every registry partition file.
5. `state/kanban_transitions.js` — `namespaceOf`/`partitionOf` driven by registry taskPrefix patterns (default to existing 4).
6. `state/agent_worker.js` — `REPO_MAP` driven by registry; reload registry each tick so new projects are picked up without restart.
7. `dashboard/server.js` — `partitionNameForTask` driven by registry; add `GET /api/projects` (list registry + resolved partitions) and `POST /api/projects` (create project flow).
8. `dashboard/app.js` — add projects list view + "New Project" form (name, taskPrefix, codeRepo, stateDir, baseBranch, composePort, gitRemote, needsDb).
9. `dashboard/index.html` — add projects section + new-project button + form template.
10. `dashboard/styles.css` — styles for projects section/form.
11. `.env.example` — document `<NAME>_PROJECT_PATH|_STATE_PATH|_BASE_BRANCH` env var pattern.
12. `docs/SPEC.md` — document new-project flow + `state/projects.json` schema.

## Project creation flow (POST /api/projects)

1. Validate: name unique, filesystem-safe; taskPrefix unique, matches `^[A-Z0-9]+(-[A-Z0-9]+)*$`; codeRepo/stateDir/composePort unique; baseBranch non-empty; composePort free.
2. Acquire root-partition lease to serialize creation.
3. `mkdir -p projects/<name> state/<name>`
4. `git init` in `projects/<name>`, checkout `<baseBranch>`, if gitRemote provided `git remote add origin <url>`.
5. Write `state/<name>/tasks.json` `{version:1, tasks:[]}`, `state/<name>/leases.json` `{version:1, leases:[]}`.
6. Append entry to `state/projects.json`.
7. Append `<NAME>_PROJECT_PATH|_STATE_PATH|_BASE_BRANCH` to `.env`.
8. Append new app-service block to `docker-compose.yml` (before `volumes:` marker).
9. Release lease; return created project.
10. Rollback on any failure: remove created dirs/files, restore registry/.env/compose.

## Data flow

`UI "New Project" form` → `POST /api/projects` → validate → create repo+state+registry+compose+.env → dashboard responds → operator runs `docker compose up -d` → new app service + state partition live → dashboard `GET /api/tasks` reads new partition → agent-worker picks up namespace each poll.

## Validation

- `docker compose config -q` (syntax)
- `node --test tests/Feature/*.test.cjs` (all existing + new)
- Manual smoke: create project via UI, confirm registry entry, dirs, compose service, docker compose up works

## Out of scope

- Auto-generating the app's Dockerfile / stack (operator supplies)
- DB provisioning even when `needsDb=true` (flag recorded only)
- Deleting / editing / renaming existing projects
- Removing `state/runner_workflow.js` auto-advance (untouched)

## Open question for implementer

None — all decisions resolved. The operator must run `docker compose up -d` after UI creation to bring up the new compose service.
