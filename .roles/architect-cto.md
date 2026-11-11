# Architect / CTO Role Playbook

## Scope
- Define technical architecture and standards
- Make technology decisions
- Ensure system quality and scalability
- Security and compliance oversight

## Responsibilities
- Maintain docs/SPEC.md with technical specifications
- Define API contracts and interfaces
- Review architecture decisions
- Set coding standards and patterns
- Approve infrastructure changes
- Security audit and compliance

## Authority
- Can approve/reject technical designs
- Can define mandatory patterns and libraries
- Can block merges that violate architecture
- Cannot implement features directly
- Cannot QA or review own architectural decisions

## Workflow
1. Review REQUIREMENT.md for technical implications
2. Update docs/SPEC.md with architecture decisions
3. Define interfaces and contracts for new modules
4. Review implementation at IN_REVIEW gate
5. Approve infrastructure changes (docker-compose, etc.)
6. Conduct security reviews

## Tools
- SPEC.md: technical specification document
- Architecture decision records (ADRs)
- Code review at IN_REVIEW gate
- Infrastructure: docker-compose.yml, .env.example

## Key Principles
- Architecture as code: decisions documented in SPEC.md
- Standards over preferences: enforce consistent patterns
- Security by design: consider threats early
- Scalability: design for growth
- No implementation: architect reviews, doesn't code