# Plan: Deterministic Multi-Source Screening & Verification Engine (v3.0) — Task Breakdown

## Goal
Deliver a deterministic, testable verification engine that accepts multi-source raw dossier data for a target entity and returns a schema-invariant JSON result (trust score, status, audit summary, verified facts, conflicts, curated knowledge snippet) per the v3.0 master prompt.

## Scope / Constraints
- **Protocol**: Work follows `AGENTS.md` Git-Swarm (lease → claim → TDD Red/Green → review → STAGE → DONE). Register/track work as `TASK-NNN` items in `state/tasks.json` (SIMA/general namespace) unless CTO decides a separate namespace/subproject boundary.
- **Max duration per task: ≤ 2 hours** (hard constraint from request). Each task below is sized to fit one focused TDD slice; split further during implementation if a slice expands.
- **Determinism**: No extrapolation/guessing; no probabilistic language in outputs; strict output schema and `null` handling; pure JSON output contract.
- **Integration boundary**: Existing SIMA screening work (e.g. `GenericScreeningEngine`, ATS/talent contracts in `docs/SPEC.md`) must remain backward-compatible unless explicitly versioned. Implementation lives in the SIMA codebase (symlinked worktrees like `sima/`/`candash` context in this repo) — exact file paths to be confirmed at claim time by the implementer.

## Key Decisions (proposed)
1. **Engine form**: Implement as a dedicated deterministic pipeline/service (e.g. `DeterministicVerificationEngine` or equivalent module) with pure functions per phase + a thin orchestration/LLM-boundary adapter. *Rationale*: enables unit testing without LLM/network and enforces schema invariance.
2. **LLM role boundary**: LLM may assist only where unavoidable (e.g. fact isolation from unstructured text) behind a strict validator/normalizer that enforces schema, nulls, banned hedging terms, and JSON-only output; scoring/conflict/weight logic must be deterministic code. *Rationale*: satisfies “Deterministic Data Verification Engine” and zero-extrapolation constraints.
3. **Contract versioning**: Treat v3.0 schema as a versioned contract (`verification_v3` or similar) with fixture-based golden tests to prevent drift.
4. **Status thresholds (per spec)**: `APPROVED` = trust_score > 75 and no unresolved key conflicts; `REJECTED` = trust_score < 40 or acute identity conflict; `NEEDS_MANUAL_AUDIT` = 40–75 or tie-weight conflict. Encode as explicit constants + tests (boundary values 40, 75).

## Task Backlog (atomic, each ≤ 2h)

| ID (suggested) | Title | Est. | Depends on | Owner/role (suggested) | Deliverables / Acceptance Criteria |
|---|---|---:|---|---|---|
| T-01 | Define v3.0 verification contract & fixtures | 1.5h | — | Architect/Dev | Typed DTO/schema (input `{{RAW_DOSSIER}}`, `{{TARGET_ENTITY}}`; output strict schema). Golden JSON fixtures (valid/empty/null/conflict cases). Unit tests: schema invariance (no extra/missing keys), `null` preserved, `entity_id` echoed, pure-JSON parse. |
| T-02 | Implement source authority hierarchy & normalization | 1.5h | T-01 | Dev | Configurable mapping of source types/URLs/tags to tiers 1–4 with weights 1.0/0.8/0.4/0.1; unknown/unreferenced/error/cache-noise → 0.1. Normalization of source metadata. Tests: each tier, dominant-source selection, noise classification. |
| T-03 | Implement Fact Isolation (atomic claims) | 2.0h | T-01, T-02 | Dev | Pipeline step that decomposes raw dossier into atomic claims (title, experience, skill, company, identity/spec fields) with source attribution. If LLM-assisted: adapter + deterministic post-validator; fallback deterministic parser for structured input. Tests: multi-source input yields isolated claims; no invented fields. |
| T-04 | Implement Cross-Validation & tier-4 noise filtering | 2.0h | T-02, T-03 | Dev | Rule: claim only in tier-4 → dropped as noise; claim in ≥1 tier-1 or ≥2 independent tier-2 → `Verified`. Track `total_claims_found`, `verified_claims_count`. Tests cover all acceptance branches and independence definition (distinct sources). |
| T-05 | Implement Conflict Resolution policy | 2.0h | T-03, T-04 | Dev | Higher-weight source wins (`accepted_value` vs `rejected_value`) with rationale; equal-weight conflicts recorded unresolved (no guessing) and flagged for audit; detect acute identity conflicts. Tests: higher-vs-lower, tie-weight, identity-conflict cases; `conflicts_count` accurate. |
| T-06 | Implement Scoring & status decision logic | 1.5h | T-04, T-05 | Dev | `trust_score` 0–100 = weighted average over verified facts based on supporting-source authority presence (formula documented in code/spec). Status: `APPROVED`/`REJECTED`/`NEEDS_MANUAL_AUDIT` per thresholds and conflict rules. Boundary tests: 39/40/75/76 and unresolved key/tie conflicts. |
| T-07 | Implement curated knowledge snippet generator (fact-only) | 1.0h | T-04, T-05 | Dev | Deterministic, compact snippet built only from verified facts (no hedging terms). Enforce banned-phrase filter (`احتمالاً/ممکن است/به نظر می‌رسد/probably/maybe/seems`). Tests: snippet contains only verified data; null/empty-safe. |
| T-08 | Orchestrate end-to-end pipeline & strict JSON emission | 1.5h | T-01–T-07 | Dev | Single entrypoint: `(entity_id, raw_dossier) -> v3 JSON`. Enforce hard constraints: zero extrapolation guard, schema invariance, null handling, pure JSON (strip/forbid markdown/prose). Tests: end-to-end golden runs incl. empty dossier and conflict-heavy dossier. |
| T-09 | Integrate with existing SIMA screening/talent flow (adapter + compatibility) | 2.0h | T-08 | Dev | Adapter from current dossier/candidate/profile inputs to engine and mapping to existing contracts (`/api/v1/talent/screen` or service layer as applicable) without breaking current behavior; feature flag/versioned path if needed. Regression tests for existing `GenericScreeningEngine`/talent paths remain green (scope per SPEC noted gaps). |
| T-10 | API/controller & SSE/chat/tool contract exposure (if required) | 2.0h | T-08, T-09 | Dev | Expose engine via agreed interface (HTTP endpoint and/or LLM tool schema) returning strict JSON; input validation and error shaping (no secret/PII leakage). Contract/integration tests. *Mark optional if product decides service-only in v3.0.* |
| T-11 | Security, privacy & abuse hardening | 1.5h | T-08, T-10 | Dev/Sec | Input size/shape limits, PII/redaction boundaries in logs/snippet, prompt-injection-resistant handling of raw dossier text, deterministic failure modes. Tests: oversized/malicious/noisy inputs do not crash or leak. |
| T-12 | Spec/docs & rollout checklist | 1.0h | T-01–T-11 | Architect/QA | Update `docs/SPEC.md` (contracts, module status, known gaps), add developer/runbook notes (how to supply `RAW_DOSSIER`/sources, tier mapping config), and record verification evidence plan for STAGE. Acceptance: docs match implemented schema/thresholds; no secrets. |

**Total: 12 tasks, 19.5h planned (each ≤ 2h).** Parallelizable after T-01/T-02: (T-03→T-04→T-05) can partially overlap with T-07 prep; T-09/T-10 follow T-08; T-12 runs alongside late-stage work.

## Dependency Graph (summary)
- T-01 → T-02, T-03, T-08
- T-02 → T-03, T-04
- T-03 → T-04, T-05, T-07
- T-04, T-05 → T-06, T-07, T-08
- T-06, T-07 → T-08
- T-08 → T-09, T-10, T-11
- T-09, T-10 → T-11 (hardening of exposed surface), T-12

## Validation / Quality Gates
- **Unit tests (TDD)** per task: authority weights, isolation, cross-validation branches, conflict/tie/identity cases, scoring boundaries, schema/null/pure-JSON/banned-phrase guards.
- **Golden/contract tests**: fixed `RAW_DOSSIER` → exact/structurally-equal expected JSON (including `audit_summary` counts and `dominant_source`).
- **Integration/regression**: existing SIMA screening/chat flows unaffected (per `docs/SPEC.md` compatibility expectations); run relevant PHPUnit/BDD suites in SIMA env (`sudo docker` as required by repo norms).
- **STAGE evidence** (per protocol): black-box verification on configured stage endpoint with sample dossier; record URL/commands/output in task evidence before `DONE`.

## Risks & Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| LLM introduces non-determinism/hedging in isolation/snippet | Contract breach | Keep scoring/conflict in code; strict post-validators + banned-term filter + JSON schema gate (T-03,T-07,T-08). |
| Ambiguous “key data” / “identity conflict” definition | Wrong status | Define explicit field set (e.g. name/company/role/date-of-birth as applicable) in T-01/T-05 spec and test it. |
| Source metadata missing/inconsistent in raw dossiers | Mis-weighting | Default-to-tier-4/unknown rules in T-02; surface in `audit_summary`. |
| Integration touches active `IN_PROGRESS` SIMA areas (TASK-093/095) | Merge/conflict | Coordinate via leases/board; schedule T-09/T-10 after confirming boundaries. |
| Performance on large dossiers | Latency | Input caps and linear-pass algorithms in T-11; profile in STAGE. |

## Open Questions (resolve before/at sprint start)
1. **Execution target**: implement inside SIMA (`app/Services/...`) vs a separate module/package in this mono-repo? (Affects paths and test harness.)
2. **`dominant_source` definition**: highest-weight source contributing any verified fact, or most frequent contributor by verified claims?
3. **Independence for “two tier-2 sources”**: distinct domains/identities vs distinct records — exact rule?
4. **Key fields for “unresolved conflict in key data”** blocking `APPROVED`: which attributes qualify?
5. **Trust-score formula detail**: exact weighted-average definition over verified facts/supporting sources (normalization when multiple sources support one fact).
6. **Expose as**: internal service only, REST endpoint, and/or chat/LLM tool in v3.0 (drives T-10 scope)?

## CTO/Team Session Output (Scrum)
- **Sprint goal**: Ship v3.0 deterministic verification pipeline with schema-locked JSON output and automated contract tests.
- **Capacity assumption**: 2 engineers can complete in ~1.5–2 days given ≤2h tasks and parallel tracks; adjust after dependency check on SIMA codebase access.
- **Definition of Done (per task)**: tests written & passing (Red→Green), code reviewed, no schema/compat regressions, evidence/log updated per `AGENTS.md`, stage-verified where applicable.
- **Immediate next step**: confirm open questions 1–6, then register T-01..T-12 into `state/tasks.json` (lease + plan commit) and claim T-01.
