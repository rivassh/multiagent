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
4. Perform exploratory testing against acceptance criteria
5. Check code quality: linting, formatting, patterns
6. Validate security: no secrets, proper auth, input validation
7. **Mandatory blackbox gate**: For any task touching UI, navigation, or user interaction, QA MUST run a matching blackbox end-to-end scenario in `sima-blackbox-tests/tests/` against a live SIMA instance (`BASE_URL`, default `https://dev2.sima.adlr.ir` per `.env`). Local static unit tests alone are insufficient evidence.
8. Attach evidence to `state/sima/team_log.md`: test file, scenario names, exact `BASE_URL` used, pass/fail result, timestamp, and retained artifacts (trace/screenshot/video on failure). `test-results/.last-run.json` containing only `{"status":"passed","failedTests":[]}` with no scenario names or URL is NOT sufficient evidence.
9. Set status: QA_PASSED or QA_FAILED with evidence
10. If QA_FAILED: task goes to REVISE with actionable feedback

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
## Mandatory Interaction-Flow Coverage (added)
- For any task touching UI, navigation, or user interaction, acceptance criteria MUST include an "Interaction flows" subsection.
- QA MUST add/run a blackbox end-to-end scenario in sima-blackbox-tests/ for each interaction flow and attach evidence.
- QA MUST reject (QA_FAILED) if interaction flows are missing from criteria or untested.
