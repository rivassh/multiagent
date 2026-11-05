# SIMA Technical Specification (docs/SPEC.md)

## Purpose

Single Source of Truth (SSOT) for the SIMA project technical architecture, API contracts, and interfaces — required by the Autonomous Git-Swarm Protocol (AGENTS.md).

## Architecture Overview

- **Stack**: Laravel 13 (PHP 8.3, FPM), PostgreSQL 16 + pgvector, Redis 7, Docker Compose (profiles: `dev`, `sima-core`), nginx, Vite/Tailwind frontend.
- **LLM Gateway**: Modulo mimo stack (mimo-backend + mimo-adapter → OpenRouter via OpenAI-compatible API). Local GGUF + LiteLLM optional (compose profile `local-llm`, default OFF).
- **Agent**: mimo (mimocode) runtime with MCP tools.
- **Multi-Project Isolation**: State partitioned across sima/, candash/, omr/, shared/ namespaces; each subproject uses its own task scope.

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
- Chat Markdown rendering: pin exact versions of `marked` and `DOMPurify` in each tracked chat UI, render with the compatible `marked.parse()` API, and sanitize generated HTML with DOMPurify before DOM insertion. Regression tests must cover expected formatting and rejection of unsafe HTML/URLs.
- Health: aggregate DB, ES, LLM status

## Interfaces

- LLM tool-calling: `MimoAdapterClient.chatWithTools()` (enrich_and_extract_profile, evaluate_job_fit, generate_executive_shortlist)
- Retrieval: `HybridRetrieval` (FTS + vector), `VectorRetrieval` (pgvector), `DatabaseRetrieval`

## GitOps / Swarm Protocol Reference

See AGENTS.md in this repo. Shared contracts: REQUIREMENT.md, docs/SPEC.md, state/sima/tasks.json, state/candash/tasks.json, state/omr/tasks.json, state/shared/tasks.json, state/shared/leases.json, state/team_log.md.

### Task namespaces

- Existing Sima work remains under `TASK-NNN` IDs.
- HR subproject work uses `TASK-HR-NNN` IDs in the shared queue; an explicit HR request may only claim/review HR-prefixed tasks and must never fall back to general Sima tasks.
- OMR project work uses `TASK-OMR-NNN` IDs in the shared queue; an explicit OMR request may only claim/review OMR-prefixed tasks and must never fall back to Sima or HR tasks.
- Optional `depends_on` task IDs gate selection until all prerequisites are `DONE` and each dependency ID matches the active runner scope's namespace (`TASK-NNN`, `TASK-HR-NNN`, or `TASK-OMR-NNN`). Missing, malformed, or cross-namespace dependencies are invalid and keep the task blocked. All namespaces use the same lease and lifecycle: implementation → review → `STAGE` → `DONE` (or `REVISE` if review or stage verification fails). A passing review does not itself complete a task; the assigned stage operator records black-box verification evidence before a task can become `DONE`.

### Partitioned State

Task and lease state is partitioned into namespace directories:

| Directory | Content |
|-----------|---------|
| `state/sima/` | Sima tasks (`TASK-NNN`), sima-specific runner config |
| `state/candash/` | HR tasks (`TASK-HR-NNN`), HR runner config |
| `state/omr/` | OMR tasks (`TASK-OMR-NNN`), OMR runner config |
| `state/shared/` | Cross-project tasks (`TASK-086` etc.), shared lease manifest |

The `node state/runner_workflow.js` command accepts `--scope sima`, `--scope hr`, or `--scope omr` to process only tasks matching the corresponding pattern. Dependencies are validated to remain within the active scope.

### HR dashboard and filters

- The HR dashboard is a conventional, independently usable UI; chatbot interaction is not required.
- Elasticsearch is the dashboard's search/read-model backend so adding dashboard filters does not require adding relational database columns or changing transactional schema. Keep the UI filter contract separate from Elasticsearch DSL, but make Elasticsearch the required execution target for dashboard search.
- Filter controls and API state must support validated fields/operators/values, sort, pagination, and facets/aggregations. Add a supported filter through a small, defined field/attribute, index, and query configuration path rather than duplicating query construction across UI components.
- The HR index must use an intentional extensible mapping/document strategy for new searchable attributes without uncontrolled dynamic mapping or mapping explosion. Never accept arbitrary client-supplied Elasticsearch DSL.
- Document the source of truth, index ownership, synchronization/freshness, mapping version/reindex strategy, authorization/PII boundaries, and unsupported-field behavior. Treat Elasticsearch as a derived search/read model, not the transactional source of truth.
- Shape HR documents and collection boundaries for possible future reuse as a separately authorized RAG collection. This is a compatibility goal; the HR dashboard does not depend on chatbot code, and RAG implementation is outside its scope.

## Known Gaps

- TASK-027: ATS module not found — Talent capability exists only as API endpoints.
- VectorRagBddTest: 28 pre-existing failures, explicitly scoped out of TASK-024.
- JobVision/LinkedIn: capability NOT READY (missing UI frontend, LinkedIn crawler impl, LLM service verification, API credentials).
- JobVision-to-chat trace (2026-11-02): local PostgreSQL had 15 active posts, but replaying the observed list query retrieved five closed rows; the runtime `schedule:list` was empty and a read-only JobVision request returned HTTP 401. The external source total is therefore unverified. See the SIMA worktree's `docs/jobvision-chat-data-flow.md`.

## Source Ingestion Without an API

- A HAR may be reviewed once, locally, by an authorized developer solely to understand request/response shapes and inform implementation. It is not a product input or recurring ingestion format; do not commit, log, retain, or use real HAR data in tests.
- Never replay captured requests or use captured cookies, tokens, or authorization headers. Do not automate access to private/unofficial LinkedIn endpoints, bypass access controls/CAPTCHAs/rate limits, or implement broad profile harvesting. If safe authorized access cannot be established, document the limitation and stop at an offline JSON adapter.
- The persistent LinkedIn adapter accepts explicit operator-provided profile JSON, maps only present fields into the shared profile contract, and returns a provenance-bearing preview. Missing values remain unknown; preview alone does not persist data.
- Keep LinkedIn source identity namespaced separately from JobVision. Human approval is required before any persistent import, and only approved normalized fields may be saved.
- Use synthetic fixtures for parser and pipeline tests. New sources should be onboarded through reusable validation and normalization rather than one-off scripts.
- Backward compatibility is mandatory: existing JobVision adapter/configuration, routes, database schema, scheduler behavior, and defaults remain unchanged; LinkedIn support must not require JobVision migrations or configuration changes. Regression tests verify the existing JobVision path alongside synthetic tests for the new adapter.

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