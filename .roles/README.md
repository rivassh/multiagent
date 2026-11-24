# Role Contracts

This directory contains explicit Markdown playbooks for role-based agent contracts.
Each playbook defines a specific role's scope, responsibilities, protocol, and constraints.

## Available Roles

| Role | File | Purpose |
|------|------|---------|
| Product Owner | `product-owner.md` | Requirement decomposition & acceptance criteria |
| Scrum Master | `scrum-master.md` | Triage, blocking resolution, dependency checks |
| Architect CTO | `architect-cto.md` | System specs, ADRs, global constraints |
| Frontend Dev | `frontend-dev.md` | Strict TDD, frontend implementation |
| Backend Dev | `backend-dev.md` | Strict TDD, backend implementation |
| QA Engineer | `qa-engineer.md` | Verification against acceptance criteria |
| Code Reviewer | `code-reviewer.md` | Independent review protocol |

## Loading a Role

Stateless agents can load any role without conversation history:

```bash
source .roles/load_role.sh <role-name>
```

Example:
```bash
source .roles/load_role.sh code-reviewer
```

## Role Isolation

- Author cannot QA or Review their own task
- QA and Review are strictly decoupled from implementation
- Each role has explicit scope and constraints
- Roles follow AGENTS.md protocol lifecycle