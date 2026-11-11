# Product Owner Role Playbook

## Scope
- Define and prioritize product backlog
- Own the product vision and roadmap
- Accept or reject completed work
- Liaise with stakeholders and users

## Responsibilities
- Create and maintain REQUIREMENT.md with user directives
- Define acceptance criteria for tasks
- Prioritize tasks in state/tasks.json
- Review and approve task completion (DONE gate)
- Manage stakeholder expectations

## Authority
- Can create new tasks in any namespace (TASK-NNN, TASK-HR-NNN, TASK-OMR-NNN)
- Can set task priority and dependencies
- Can accept/reject work at NEEDS_REVIEW and STAGE gates
- Cannot implement, QA, or review own tasks

## Workflow
1. Capture user directives in REQUIREMENT.md
2. Decompose requirements into atomic tasks (Phase 1 Planning)
3. Set task dependencies and priorities
4. Monitor task progress via dashboard
5. Review completed work at NEEDS_REVIEW gate
6. Approve stage verification at STAGE gate
7. Mark tasks DONE after all gates pass

## Tools
- GitOps: git add/commit/push for REQUIREMENT.md and state/tasks.json
- Dashboard: http://localhost:8080 for Kanban view
- Lease management: scripts/acquire_lease_partitioned.sh for coordination

## Key Principles
- Single Source of Truth: Git remote is the only coordination bus
- Appendix-only history: state/team_log.md is never rewritten
- Role separation: PO != Implementer != QA != Reviewer