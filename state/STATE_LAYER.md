# State Layer Boundary

This file enumerates every path that belongs to the Git-Swarm state/task/orchestration layer. Deleting every path below removes the entire state layer in one operation without touching product code.

## Tracked under `state/`

- `state/tasks.json` — root task queue
- `state/leases.json` — root lease manifest
- `state/team_log.md` — root append-only ledger
- `state/sima/{tasks.json,leases.json,team_log.md}`
- `state/candash/{tasks.json,leases.json,team_log.md}`
- `state/shared/{tasks.json,leases.json,team_log.md}`
- `state/inbox/*.json` — inter-agent messages
- `state/kanban_store.js` — dedup index + partition resolution
- `state/kanban_leases.js` — TTL lease acquire/release/renew
- `state/kanban_transitions.js` — transition validation
- `state/runner_workflow.js` — lifecycle runner + role separation
- `state/agents.json`
- `state/roles.json`
- `state/council.md`
- `state/notes.md`
- `state/target_resolution.md`
- `state/watchdog.log`
- `state/answer/{README.md,tasks.json}`
- `state/package.json`
- `state/task-mimo-adapter-submodule.json`

## Untracked under `state/`

- `state/processmaker/{tasks.json,leases.json,team_log.md}` (visible via `git status --porcelain`)

## Outside `state/` but part of orchestration layer

- `AGENTS.md` — Autonomous Git-Swarm Protocol spec
- `docs/SPEC.md` — SIMA spec + GitOps/Swarm reference
- `.roles/*.md`, `.roles/load_role.sh`
- `scripts/*.sh`, `scripts/*.js` (acquire/release/validate/verify)
- `dashboard/`, `dashboard.Dockerfile`, `dashboard.py`

## Deletion recipe (one-shot removal)

Tracked paths:
```
git rm -r state/ AGENTS.md docs/SPEC.md .roles/ scripts/ dashboard/ dashboard.Dockerfile dashboard.py
git commit -m "chore(handoff): remove Git-Swarm state/task orchestration layer"
```

Untracked `state/processmaker/`:
```
rm -rf state/processmaker/
```

## Product code kept (NOT part of state layer)

`sima-blackbox-tests/`, `tests/`, `projects/`, `PROTOCOLS/`, `resources/`, `answer/`, `reports/`, `architectural_analysis.md`, `IMPLEMENTATION_SUMMARY.md`, `REQUIREMENT.md`, `TODO.md`, `YOUR_ID.example`, `github_urls.md`, `.env.example`, `.env.qa.example`, `.gitignore`, `docker-compose.yml`, `Makefile`, `gitops.sh`.
