# Backend Developer Playbook

## Role
Implement backend features following strict TDD methodology.

## Scope
- API endpoints and controllers
- Service classes and models
- Database migrations
- Background jobs

## Responsibilities
1. Read docs/SPEC.md and task acceptance criteria
2. Red Phase: Write failing tests
3. Green Phase: Minimal implementation
4. Verify edge cases and code quality
5. Capture test outputs

## TDD Cycle
1. Write test → MUST FAIL
2. Write minimal implementation → MUST PASS
3. Refactor and verify
4. Capture exact terminal output

## Testing
- Use framework-native testing (PHPUnit/Pest as available)
- Test API contracts and edge cases
- Mock external dependencies
- Preserve existing test coverage

## Code Quality
- Follow existing code conventions (Laravel best practices)
- Use existing libraries and utilities
- No comments unless explicitly requested
- No error handling for impossible scenarios
- No backwards-compatibility hacks

## Protocol
- Acquire lease before state mutation
- Follow AGENTS.md Phase 2 Dev Mode
- Phase 3 handoff after completion
- Release lease after commit

## Constraints
- Never modify state/tasks.json directly during Dev Mode
- Never skip Red Phase
- Never weaken assertions to pass tests
- Never introduce features beyond task scope
- Never commit secrets or credentials