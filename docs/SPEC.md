# SIMA Technical Specification (docs/SPEC.md)

## Purpose
Single Source of Truth (SSOT) for the SIMA project technical architecture, API contracts, and interfaces — required by the Autonomous Git-Swarm Protocol (AGENTS.md).

## Architecture Overview
- **Stack**: Laravel 13 (PHP 8.3, FPM), PostgreSQL 16 + pgvector, Redis 7, Docker Compose (profiles: `dev`, `sima-core`), nginx, Vite/Tailwind frontend.
- **LLM Gateway**: Modular mimo stack (mimo-backend + mimo-adapter → OpenRouter via OpenAI-compatible API). Local GGUF + LiteLLM optional (compose profile `local-llm`, default OFF).
- **Agent**: mimo (mimocode) runtime with MCP tools.

## Modules
| Module | Purpose | Status |
|--------|---------|--------|
| Talent Acquisition (ATS) | Candidate sourcing/screening from JobVision & Jobinja; screening engine; executive shortlist | Partial (API-only, TASK-027 FAIL) |
| Chat / Generative UI | Schema-driven dynamic UI (chart/table/card/form) via LLM-extracted schemas | Complete (TASK-025) |
| Chat / SecurityModerator (Sanjeman) | Layer 6 guard: prompt injection, PII, toxicity | Complete (TASK-026) |
| Chat / RAG | Hybrid retrieval: PostgreSQL FTS + pgvector → RRF | Complete (TASK-028) |
| HR | Departments, org chart, leave/attendance, documents | Complete (Phase 8) |
| RBAC | 4 roles (admin, recruiter, hiring_manager, auditor); 25+ permissions | Complete |
| Assessment | Candidate assessments, screening results, shortlist | Partial |

## API Contracts
- Talent: `/api/v1/talent/screen`, `/api/v1/talent/shortlist-top`, `/api/v1/talent/screening/{jobId}`
- Chat: SSE via `App\Services\AI\Streaming\SSEHandler`; conversation persistence via `ChatConversation`
- Health: aggregate DB, ES, LLM status

## Interfaces
- LLM tool-calling: `MimoAdapterClient.chatWithTools()` (enrich_and_extract_profile, evaluate_job_fit, generate_executive_shortlist)
- Retrieval: `HybridRetrieval` (FTS + vector), `VectorRetrieval` (pgvector), `DatabaseRetrieval`

## GitOps / Swarm Protocol Reference
See AGENTS.md in this repo. Shared contracts: REQUIREMENT.md, docs/SPEC.md, state/tasks.json, state/leases.json, state/team_log.md.

## Known Gaps
- TASK-027: ATS module not found — Talent capability exists only as API endpoints.
- VectorRagBddTest: 28 pre-existing failures, explicitly scoped out of TASK-024.
- JobVision/LinkedIn: capability NOT READY (missing UI frontend, LinkedIn crawler impl, LLM service verification, API credentials).
- JobVision-to-chat trace (2026-11-02): local PostgreSQL had 15 active posts, but replaying the observed list query retrieved five closed rows; the runtime `schedule:list` was empty and a read-only JobVision request returned HTTP 401. The external source total is therefore unverified. See the SIMA worktree's `docs/jobvision-chat-data-flow.md`.

## Source Ingestion Without an API
- Prefer documented provider APIs when available; when access is unavailable, an operator may supply an authorized browser export such as HAR as an explicit input to a local, source-specific adapter.
- Treat HAR files as sensitive: strip cookies, authorization headers, tokens, and other session secrets before persistence or logging; process locally and never replay captured credentials.
- Extract only fields needed for an approved purpose, normalize into the shared profile/source schema, preserve source and capture-time provenance, deduplicate deterministically, validate uncertain fields, and require human review where extraction is ambiguous.
- Do not bypass authentication, access controls, CAPTCHAs, or rate limits; do not automate broad profile harvesting. Respect provider terms and applicable privacy rules.
- Use synthetic fixtures for parser and pipeline tests. New sources should be onboarded through a concise adapter checklist and reusable validation, redaction, normalization, and upsert stages rather than one-off scripts.

## Separate Chat Analytics Pipeline

### Goal and deployment boundary
- Provide an analysis copy of SIMA chat data for authorized analysts; the operational SQL database remains the source of truth and is never migrated or written by this pipeline.
- Implement the pipeline in a separate `sima-analytics/` project at this repository's root. Its Docker Compose project, MongoDB volume, credentials, and private MongoDB network are independent of SIMA's Compose stack. Do not edit or depend on the SIMA submodule worktree for the analytics deployment.
- The ETL worker may join SIMA's existing network only to read from a dedicated read-only SQL account. MongoDB must not join that shared network or be exposed publicly; analyst access is local/explicit and read-only by default.
- Initial use is human data analysis and traceability. The project does not perform model fine-tuning; any future training export requires separate review and explicit selection of approved, de-identified examples.

### Data contract
- Store one analytics record per conversation message, keyed by source conversation/message identifiers and source update time so backfills and retries are idempotent.
- Preserve message role, content after privacy sanitization, timestamps, conversation ordering, model/provider where available, detected intent, prompt-template version/hash, retrieval collection and counts, and tool call name/arguments/result summaries when available.
- Do not copy direct identifiers (phone numbers, emails, access tokens, API keys, or source account identifiers). Use a keyed pseudonymous actor key only when needed to join a user's records; keep its secret outside the repository and analytics database dumps.
- Minimize candidate or third-party personal data in tool arguments/results. Store only fields required for the analytical purpose; no candidate contact details. If content cannot be safely sanitized, omit it and record a non-sensitive omission reason.
- Keep operational errors visible in ETL logs without logging unsanitized message content or credentials.

### ETL contract
- Support initial backfill and repeatable incremental runs from SQL to MongoDB, using a durable checkpoint/watermark and stable upserts. Advance the checkpoint only after destination writes succeed; rerunning a batch must not duplicate records or skip failed records.
- Source access is read-only. A failed extraction, transformation, or load is reported as a failed run and can be retried; never return a success-shaped result for a partial run.
- Add validation for counts, duplicate keys, missing required fields, redaction behavior, and checkpoint recovery. Include fixtures with synthetic data; tests must not use production chat content.
- Document stack startup, configuration without committed secrets, initial backfill, incremental run, backup/retention, analyst read-only access, and example aggregation queries.

### Planned implementation tasks
1. TASK-087: specify the event/privacy contract and persist trace metadata for intent, retrieval, model/prompt version, and tool executions in SIMA's existing SQL store.
2. TASK-088: create the separate MongoDB/ETL Compose environment and safe analyst read-only access.
3. TASK-089: implement and test the privacy-sanitizing, idempotent backfill/incremental ETL.
4. TASK-090: add verification/quality checks and analyst operating documentation and queries.
5. TASK-091: trace and document JobVision ingestion/synchronization, database reads and writes, chat retrieval, and the reported job-count discrepancy using read-only evidence.
6. TASK-092: add a Mermaid sequence diagram for the JobVision-to-chat flow, including storage boundaries, retrieval limitations, and the observed sync caveats.
7. TASK-093: secure JobVision employer-token configuration and expiry recovery; do not treat candidate-portal HAR credentials as employer credentials or implement refresh without a verified provider endpoint.