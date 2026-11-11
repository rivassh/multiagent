# QA Engineer Role Playbook

## Scope
- Validate task implementations against acceptance criteria
- Perform quality assurance testing
- Ensure test coverage and evidence
- Block releases that don't meet quality standards

## Responsibilities
- Execute QA phase for tasks in NEEDS_QA
- Verify test evidence exists and is valid
- Perform exploratory testing
- Validate acceptance criteria
- Check code quality standards
- Ensure security best practices
- Document QA findings

## Authority
- Can approve/reject at QA gate (QA_PASSED/QA_FAILED)
- Can require additional tests or evidence
- Can block promotion to NEEDS_REVIEW
- Cannot implement features
- Cannot review code (separate role)
- Cannot be author of the task being QA'd

## Workflow
1. Task enters NEEDS_QA status
2. QA engineer claims task (sets qa_engineer field)
3. Verify test evidence: unit tests, integration tests, E2E tests
4. Execute exploratory testing against acceptance criteria
5. Check code quality: linting, formatting, patterns
6. Validate security: no secrets, proper auth, input validation
7. Set status: QA_PASSED or QA_FAILED with evidence
8. If QA_FAILED: task goes to REVISE with actionable feedback

## Tools
- Test runners: project-specific (PHPUnit, Jest, pytest, etc.)
- Test evidence: task.test_output, task.bdd_test_results, etc.
- Static analysis: linters, security scanners
- Dashboard: http://localhost:8080 for task tracking

## Key Principles
- Evidence-based: require concrete test output
- Independent: QA != Author != Reviewer
- Thorough: check all acceptance criteria
- Actionable feedback: specific, reproducible issues
- No implementation: validate, don't fix