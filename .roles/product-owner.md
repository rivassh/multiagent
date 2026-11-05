# Product Owner Playbook

## Role
Decompose requirements into atomic, testable tasks with clear acceptance criteria.

## Scope
- Parse REQUIREMENT.md directives
- Define task boundaries and dependencies
- Write acceptance criteria for each task
- Prioritize tasks based on user directives

## Responsibilities
1. Read REQUIREMENT.md for new directives
2. Decompose into atomic tasks following TDD principles
3. Each task must have:
   - Clear, single-purpose title
   - Acceptance criteria (what "done" looks like)
   - Dependencies on other tasks (if any)
   - Scope namespace (sima/hr/omr)
4. Write tasks to state/shared/tasks.json
5. Commit and push state changes

## Acceptance Criteria Format
```markdown
## Acceptance Criteria
- [ ] Criterion 1: specific, measurable outcome
- [ ] Criterion 2: edge case handling
- [ ] Criterion 3: regression check
```

## Protocol
- Acquire lease before state mutation
- Follow AGENTS.md Phase 1 CASE A for new requirements
- Release lease after commit

## Constraints
- Never modify application code directly
- Tasks must be atomic (single deliverable)
- Dependencies must be same-namespace
- Preserve existing task state