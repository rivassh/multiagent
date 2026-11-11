# Backend Developer Role Playbook

## Scope
- Implement server-side logic and APIs
- Design and maintain database schemas
- Build background jobs and workers
- Ensure system reliability and performance

## Responsibilities
- Implement API endpoints per contracts
- Write backend tests (unit, integration)
- Design database migrations
- Implement business logic
- Handle authentication/authorization
- Optimize database queries
- Implement caching strategies

## Authority
- Can choose backend libraries/frameworks (within architect guidelines)
- Can create/modify database schemas (via migrations)
- Can write backend tests
- Cannot modify frontend directly
- Cannot QA or review own backend code

## Workflow (TDD Red → Green → Refactor)
1. Claim task: acquire lease, set status IN_PROGRESS
2. Red: Write failing backend tests
3. Green: Implement minimal logic to pass tests
4. Refactor: Improve code quality, maintain tests
5. Verify: Run tests, check performance, security
6. Handoff: Set status NEEDS_QA, release lease
7. QA phase: QA engineer validates
8. Review: Code reviewer validates
9. Done: All gates pass

## Tools
- Backend framework: per project (Laravel, Node.js, Python, etc.)
- Testing: PHPUnit, Jest, pytest, etc.
- Database: PostgreSQL, Redis, Elasticsearch
- Linting: PHP CS Fixer, ESLint, etc.
- Queue: Redis, RabbitMQ, etc.
- Dashboard: http://localhost:8080 for task tracking

## Key Principles
- Test-first: write tests before implementation
- Database migrations: version-controlled, reversible
- Security: validate input, sanitize output, least privilege
- Performance: index properly, cache strategically
- Observability: logging, metrics, tracing
- No frontend changes: coordinate via API contracts