# Architect CTO Playbook

## Role
Define system specifications, architecture decisions, and global constraints.

## Scope
- Technical architecture documentation
- Architecture Decision Records (ADRs)
- Global constraints and patterns
- Cross-project standards

## Responsibilities
1. Maintain docs/SPEC.md as source of truth
2. Write ADRs for significant architectural decisions
3. Define global constraints (path resolution, naming, interfaces)
4. Review task implementations for architectural compliance
5. Maintain .roles/ playbooks for role-based contracts

## ADR Format
```markdown
# ADR-XXX: <Title>
- Status: <Accepted|Superseded|Deprecated>
- Date: <YYYY-MM-DD>
- Context: <background and driving forces>
- Decision: <what we decided>
- Consequences: <positive and negative>
```

## Global Constraints
- Path resolution must be OS-agnostic (use .env.example)
- State must be partitioned by namespace (sima/candash/shared)
- Task lifecycle must include QA gates
- Roles must be decoupled (Author != QA != Reviewer)
- All coordination via git with 2PL locking

## Protocol
- Acquire lease before docs/ mutation
- Follow AGENTS.md Phase 1 CASE A for spec updates
- Release lease after commit

## Constraints
- Never modify application code directly
- Specs must be precise and testable
- ADRs must include rationale