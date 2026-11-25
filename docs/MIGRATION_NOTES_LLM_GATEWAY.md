# Migration Notes: LLM Gateway & Local Learner

Incubated standalone under `/home/hamid/new` (see `llm-gateway/`, `local-learner/`).

## Candidate migrations (gated)

1. mimo adapter -> LiteLLM gateway: only after gateway proven (resource comparison recorded in llm-gateway/README.md).
2. local-learner correction loop -> sima chat: only after v1 validated (7 test scenarios).
3. Decision gate: migrate only if resource/cost comparison favors litellm.

## Out of scope now

- No changes to ProcessMaker 4 / feature/faragostar branch.
- No sima source edits until migration approved.
- No model training/weight changes.
