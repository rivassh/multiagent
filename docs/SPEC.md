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
| Talent Acquisition (ATS) | Candidate sourcing/screening from JobVision & Jobinja; screening engine; executive shortlist | Partial (API-only, TASK-027 FAIL); screening engine TASK-024 DONE |
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
- TASK-027: ATS module not found — Talent capability exists only as API endpoints; no dedicated ATS module structure exists in the SIMA codebase (substring matches are unrelated Talent API endpoints).
- VectorRagBddTest: 28 pre-existing failures, explicitly scoped out of TASK-024 regression scope (pre-existing RAG subsystem infrastructure issue: LLM endpoints, vector store, DB migrations, env vars).
- JobVision/LinkedIn: capability NOT READY (missing UI frontend, LinkedIn crawler implementation, LLM service verification, API credentials).
- TASK-033: SIMA chatbot HTTP 500 error — resolved by adding proper error handling in ChatQueryService.php (try/catch around LLM provider calls, returning meaningful JSON error responses instead of uncaught exceptions).
- OTP Security: Fixed OTP bypass vulnerability in chat.blade.php (debug_code auto-fill removed), added EnsureOtpAuthenticated middleware to force OTP login on all pages, restricted debug_code to dev_mode config only. (TASK-081)