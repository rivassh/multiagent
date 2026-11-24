# SIMA Report Feedback & Remaining Work Schedule
*Generated: 2026-10-27T20:20:00Z | Context: Report review for MiMoCode Research Agent*

## Problems Identified in gapgpt Reports (vs. SIMA Reality)

| # | Issue | Report Reference | SIMA Reality | Required Fix |
|---|-------|-----------------|--------------|--------------|
| 1 | **Wrong project scope** | All reports | `/opt/ymls/sima` not mentioned anywhere | Add SIMA-specific section or mark "gapgpt-only" |
| 2 | **Task ID mismatch** | prompt-report.md/JSON: TOKEN-001..BOT-005 | TASK-040..047 in state/tasks.json | Map gapgpt IDs to SIMA IDs in future, or separate reports |
| 3 | **Token system mismatch** | token-expiry-risk-report.md: ACCESS_TOKEN exp 2026-11-01, `/api/v1/token/refresh` | OpenRouter proxy `ai.adlr.ir/api/v1`, per-request `LLM_API_KEY`, `LLM_BASE_URL` from config | Future reports must reference SIMA config/env, not gapgpt token lifecycle |
| 4 | **Docker stack mismatch** | detailed-report.md: gapgpt-client, postgres, metabase | sima-sima-app-1, sima-sima-nginx-1, mimo-adapter, sima-sima-db-1 | Add SIMA Docker topology as separate section |
| 5 | **API endpoint mismatch** | prompt-report.md references gapgpt dashboard endpoints | SIMA endpoints: `/api/v1/chat/completions`, `/api/v1/ats/*`, `/api/health` | Report generator must accept target-project parameter |
| 6 | **Streaming not covered** | N/A in gapgpt reports | SSE `/api/v1/chat/completions?stream=true` with two-branch pattern (completeStream vs completeWithToolsStreaming) | Future SIMA reports must cover streaming reliability |
| 7 | **ATS module absent** | N/A in gapgpt reports | Full ATS module at `app/Modules/ATS/`: ScreeningOrchestrator, CrawlerOrchestrator, ShortlistGenerator, ATSController, migrations, 6 BDD tests | Report must note: "ATS module completed 2026-10-27 (TASK-027..038)" |
| 8 | **GenericScreeningEngine missing** | N/A | Validated at `app/Services/AI/Agents/GenericScreeningEngine.php` 462 lines, 6/6 BDD tests pass, 0-2.req → 7 HPHT criteria matrix | Add to SIMA status summary |
| 9 | **Chat provider binding** | N/A in gapgpt | Root cause of SSE 500: `ChatProviderInterface` not bound → `$app->make()` throws "not instantiable" | Document fix: bind in ChatServiceProvider::register(), verified production-working via curl |
| 10 | **Lease infrastructure** | N/A | `state/leases.json` TTL=120s, heartbeat 15s, zombie eviction 30s; restored after empty | Future SIMA reports must reference task queue and lease protocol |

## Remaining Work Schedule — SIMA Project (as of 2026-10-27T20:20Z)

| Task ID | Title | Current Status | Assignee | Next Action | Target Completion |
|---------|-------|----------------|----------|-------------|-------------------|
| **TASK-041** | Expand Assessment module — templates, scheduling, result aggregation for ATS pipeline | IN_PROGRESS | agent-local-12345 | Create assessment templates (technical/behavioral/cognitive), scheduling service linked to Shortlist, result scoring/aggregation service, BDD tests; connect to ATS via shortlist_id | 2026-10-28 end of day |
| **TASK-042** | Implement HR module workforce planning — headcount forecasting, requisition approval, org chart management | IN_PROGRESS | agent-gitops-001 | Add: headcount forecast models, requisition approval workflow (multi-level), org chart CRUD with reporting lines, budget tracking; connect requisitions to ATS job posts for unified pipeline | 2026-10-29 |
| **TASK-043** | Validate GenericScreeningEngine against static NLP harness + 0-2.req extraction | DONE | agent-local-12345 | Already validated: `python modules/nlp-worker/run_eval.py` exits 0, 7 HPHT criteria extracted from Persian text, JSON matches eval_result.schema | Done |
| **TASK-044** | Create structured JSON evaluation matrix from 0-2.req — 7 HPHT criteria | DONE | agent-local-12345 | Already created: `evaluations/0-2-matrix.json` with all required fields {id, weight, category, name, min_threshold, evidence_fields, extraction_prompt} | Done |
| **TASK-045** | Complete ATS module end-to-end verification — all services + controller + tests pass | DONE | agent-local-12345 | Verified: 20 BDD tests pass (AtCrawlerOrchestrator 4, AtShortlistGenerator 5, AtModule 6, AtScreeningOrchestrator 6), all migrations, ScreeningOrchestrator/CrawlerOrchestrator/ShortlistGenerator patterns complete | Done |
| **TASK-046** | Restore active lease infrastructure in state/leases.json | DONE | agent-local-12345 | Completed: 120s TTL, heartbeat 15s, zombie eviction 30s threshold, active lease allows other agents to claim pending tasks | Done |
| **TASK-047** | Add comprehensive ATS service layer BDD test suite | DONE | agent-local-12345 | Created: AtScreeningOrchestratorBddTest (6 tests), import_with_source_factory to AtCrawlerOrchestratorBddTest, custom_limit/empty_matrix_fallback to AtShortlistGeneratorBddTest; total 20+ tests passing | Done |

### Already-Done Summary (P0 Batch TASK-043..047)
- GenericScreeningEngine validated against static harness + 0-2.req extraction ✅
- 0-2.req → structured JSON matrix at `evaluations/0-2-matrix.json` with 7 HPHT criteria ✅
- ATS module fully implemented: all services, controller, provider, routes, migrations ✅
- 20 BDD tests pass across 4 test files ✅
- Lease infrastructure restored with heartbeat mechanism ✅
- Chat SSE streaming fix: two-branch pattern (completeStream + completeWithToolsStreaming) verified production-working ✅

### REVIEWER Role Next Steps
Per round-robin rotation (pointer 2 → REVIEWER):
- Claim TASK-040 status `DONE → IN_REVIEW`
- Verify black-box: `curl http://localhost:8015/api/v1/chat/completions?stream=true` returns SSE events
- Set `APPROVED` if verified, or `REVISE` with feedback
- Advance rotation pointer to DESIGNER (0) for next cycle

### Reports That Need SIMA-Specific Updates
If the MiMoCode Research Agent is to produce SIMA-compatible reports, the following must be added:

1. **SIMA Status Summary Section** in every report covering:
   - Chat SSE streaming status (verified working)
   - ATS module completion (all 5 P0 tasks DONE)
   - GenericScreeningEngine validation status
   - Lease infrastructure state (cleared, ready for next cycle)
   - Role rotation pointer (currently 2 → REVIEWER)

2. **Separate Report Sets** — clearly labeled:
   - `gapgpt-report-[date].md` → original gapgpt content
   - `sima-report-[date].md` → new SIMA-specific analysis

3. **Task ID Mapping Table** — in report appendices:
   ```
   gapgpt task → SIMA equivalent
   TOKEN-001 → N/A (gapgpt-only)
   TASK-040 → Chat streaming (verified 2026-10-27)
   TASK-041 → Assessment module (IN_PROGRESS)
   TASK-042 → HR workforce planning (IN_PROGRESS)
   ```

## Immediate Actions for Report Generator
1. Acknowledge the addressing mismatch — future reports from this session must include "SIMA vs gapgpt" distinction
2. If producing a combined report, add SIMA-specific appendix (as outlined above)
3. Do NOT modify REQUIREMENT.md based on gapgpt content — only the path correction was valid
4. The `supplementary-prompt.md` file already in `/opt/multiagent/reports/` documents this gap

## GitOps State — Final Snapshot
```bash
$ cd /opt/multiagent && git log --oneline -3
ee25b34 feat(reports): clarify gapgpt vs SIMA addressing mismatch
60d9ba9 fix: correct gitops repo path + add supplementary prompt
70d4547 docs(log): lease released, role rotated to REVIEWER
```

Active tasks: TASK-041 (IN_PROGRESS, Assessment), TASK-042 (IN_PROGRESS, HR)
All P0 tasks TASK-043..047 complete. Lease cleared. Role rotated to REVIEWER.