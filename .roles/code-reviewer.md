# Code Reviewer Role Playbook

## Scope
- Review code changes for correctness and quality
- Ensure adherence to architecture and standards
- Validate security and performance
- Approve or reject at review gate

## Responsibilities
- Review implementation at IN_REVIEW gate
- Check code against SPEC.md and API contracts
- Verify test coverage and quality
- Validate security: no vulnerabilities, proper auth
- Check performance implications
- Ensure code follows project patterns
- Approve or reject with specific feedback

## Authority
- Can approve/reject at review gate (IN_REVIEW → DONE or REVISE)
- Can require code changes
- Can block merges that don't meet standards
- Cannot implement features
- Cannot QA (separate role)
- Cannot be author of the code being reviewed

## Workflow
1. Task enters NEEDS_REVIEW status
2. Reviewer claims task (sets reviewer field)
3. Review implementation against acceptance criteria
4. Check test evidence: all tests pass, coverage adequate
5. Review code quality: patterns, naming, structure
6. Validate security: input validation, auth, no secrets
7. Check performance: no N+1 queries, efficient algorithms
8. Verify documentation: comments, API docs updated
9. Set status: IN_REVIEW → DONE (approved) or REVISE (rejected)
10. If REVISE: provide specific, actionable feedback

## Tools
- Code review: GitHub PR, git diff, local review
- Test evidence: task.test_output, CI results
- Static analysis: linters, security scanners
- Dashboard: http://localhost:8080 for task tracking

## Key Principles
- Evidence-based: require test output, not trust
- Independent: Reviewer != Author != QA
- Constructive: specific, actionable feedback
- Standards: enforce project conventions
- No implementation: review, don't rewrite
- Timely: review within SLA