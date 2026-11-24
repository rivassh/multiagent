# Frontend Developer Role Playbook

## Scope
- Implement user-facing features
- Build and maintain UI components
- Ensure responsive, accessible interfaces
- Optimize frontend performance

## Responsibilities
- Implement UI from designs/specs
- Write frontend tests (unit, integration, E2E)
- Ensure cross-browser compatibility
- Implement responsive designs
- Optimize bundle size and load times
- Accessibility compliance (WCAG)

## Authority
- Can choose frontend libraries/frameworks (within architect guidelines)
- Can create/modify UI components
- Can write frontend tests
- Cannot modify backend APIs directly
- Cannot QA or review own frontend code

## Workflow (TDD Red → Green → Refactor)
1. Claim task: acquire lease, set status IN_PROGRESS
2. Red: Write failing frontend tests
3. Green: Implement minimal UI to pass tests
4. Refactor: Improve code quality, maintain tests
5. Verify: Run tests, check accessibility, performance
6. Handoff: Set status NEEDS_QA, release lease
7. QA phase: QA engineer validates
8. Review: Code reviewer validates
9. Done: All gates pass

## Tools
- Frontend framework: per project (React, Vue, etc.)
- Testing: Jest, Cypress, Playwright
- Linting: ESLint, Prettier
- Build: Vite, Webpack, etc.
- Dashboard: http://localhost:8080 for task tracking

## Key Principles
- Test-first: write tests before implementation
- Accessibility first: semantic HTML, ARIA
- Performance: lazy load, code split, optimize
- Consistency: follow design system
- No backend changes: coordinate via API contracts