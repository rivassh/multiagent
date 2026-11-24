# Chat Analytics Event Contract

**Version**: 1.0.0  
**Status**: Draft  
**Author**: agent-noabatgircom-2254092  
**Date**: 2026-11-10  
**Scope**: Multiagent / SIMA chat analytics — privacy-safe event schema and capture tool traces  
**Out of Scope**: Message content storage, user re-identification, cross-session linkage, any PII collection

---

## 1. Design Principles

| Principle | Description |
|-----------|-------------|
| **Privacy by Default** | No raw user content, no direct identifiers, no cross-session linkage keys |
| **Minimal Viable Telemetry** | Only fields required for operational insight and product improvement |
| **Bounded Cardinality** | All enum fields have fixed, documented value sets; no free-text fields |
| **Implementation Agnostic** | Contract is decoupled from storage (MongoDB, ClickHouse, etc.) and transport (Kafka, HTTP, file) |
| **Verifiable Capture** | Every event source is traceable to a tool/process; analysts can audit end-to-end without production secrets |
| **Versioned Stability** | Event names and field schemas are versioned; breaking changes require new event name |

---

## 2. Event Taxonomy

All events follow the naming pattern: `chat.<domain>.<action>@<version>`

| Event Name | Version | Domain | Trigger |
|------------|---------|--------|---------|
| `chat.session.started@v1` | 1 | session | New chat session initialized |
| `chat.session.ended@v1` | 1 | session | Session explicitly closed or timed out |
| `chat.request.started@v1` | 1 | request | User message received, processing begins |
| `chat.request.completed@v1` | 1 | request | Assistant response fully generated |
| `chat.request.failed@v1` | 1 | request | Processing terminated with error |
| `chat.token.delta@v1` | 1 | streaming | Each token chunk emitted (optional, sampled) |
| `chat.retrieval.used@v1` | 1 | retrieval | Vector/keyword search executed for context |
| `chat.tool.called@v1` | 1 | tool | Any tool/function invoked by assistant |
| `chat.tool.completed@v1` | 1 | tool | Tool execution finished (success/failure) |
| `chat.feedback.received@v1` | 1 | feedback | Explicit user feedback (thumbs up/down, rating) |

**Versioning Rule**: Increment version (v2, v3...) only for breaking changes (field removal, type change, enum value removal). Additive changes (new optional fields, new enum values) stay on same version.

---

## 3. Common Base Fields (Present in Every Event)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_name` | string | ✓ | Stable event identifier, e.g. `chat.request.completed@v1` |
| `event_version` | integer | ✓ | Schema version (1 for v1) |
| `timestamp_utc` | string (ISO 8601) | ✓ | Event generation time, UTC, millisecond precision |
| `session_id_hash` | string (hex, 64 chars) | ✓ | SHA-256(session_id \| salt), salt rotated daily via config |
| `request_seq` | integer | ✓ | Monotonic sequence number within session (1, 2, 3...) |
| `environment` | enum | ✓ | `dev` \| `staging` \| `prod` |
| `service_version` | string | ✓ | Git short SHA or semver of emitting service |
| `correlation_id` | string (UUID v4) | ✓ | Links all events for a single request-response cycle |

**Hashing Specification**:
- `session_id_hash = SHA256(session_id + "|" + daily_salt)`
- `daily_salt` is a 32-byte random value, rotated at 00:00 UTC, stored in secure config (not in events)
- Same session_id within 24h → same hash; next day → different hash (no cross-day linkage)
- Analysts cannot reverse hash without salt; salt never logged or emitted

---

## 4. Per-Event Field Definitions

### 4.1 `chat.session.started@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `entry_point` | enum | ✓ | `web_chat` \| `api` \| `widget` \| `mobile` |
| `user_tier` | enum | ✓ | `anonymous` \| `authenticated` \| `premium` |
| `locale` | string | ✗ | BCP 47 tag, e.g. `en-US`, `fa-IR` (max 10 chars) |
| `platform` | enum | ✗ | `desktop` \| `mobile` \| `tablet` \| `unknown` |

### 4.2 `chat.session.ended@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `duration_ms` | integer | ✓ | ≥ 0, capped at 86,400,000 (24h) |
| `request_count` | integer | ✓ | ≥ 0, capped at 10,000 |
| `end_reason` | enum | ✓ | `user_closed` \| `timeout` \| `error` \| `explicit_logout` |

### 4.3 `chat.request.started@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `intent_category` | enum | ✗ | `job_search` \| `job_detail` \| `application` \| `profile` \| `general` \| `unknown` |
| `has_context` | boolean | ✓ | Whether retrieval context was attached |
| `model_id` | string | ✓ | Stable model identifier, e.g. `gpt-4o-mini`, `llama-3.1-8b` (max 50 chars) |
| `temperature` | number | ✗ | 0.0–2.0, one decimal place |
| `max_tokens` | integer | ✗ | 1–8192 |

### 4.4 `chat.request.completed@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `latency_ms` | integer | ✓ | ≥ 0, capped at 300,000 (5 min) |
| `prompt_tokens` | integer | ✓ | ≥ 0, capped at 100,000 |
| `completion_tokens` | integer | ✓ | ≥ 0, capped at 100,000 |
| `total_tokens` | integer | ✓ | `prompt_tokens + completion_tokens` |
| `finish_reason` | enum | ✓ | `stop` \| `length` \| `tool_calls` \| `content_filter` \| `error` |
| `tool_call_count` | integer | ✓ | ≥ 0, capped at 50 |
| `retrieval_used` | boolean | ✓ | Whether retrieval was invoked |
| `citations_count` | integer | ✗ | ≥ 0, capped at 20 |

### 4.5 `chat.request.failed@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `latency_ms` | integer | ✓ | ≥ 0, capped at 300,000 |
| `error_class` | enum | ✓ | `timeout` \| `rate_limit` \| `model_error` \| `validation_error` \| `network_error` \| `internal_error` \| `content_policy` |
| `error_code` | string | ✗ | Stable error code, e.g. `MODEL_OVERLOADED`, `CONTEXT_TOO_LONG` (max 50 chars) |
| `retryable` | boolean | ✓ | Whether client should retry |
| `partial_tokens` | integer | ✗ | Tokens generated before failure (≥ 0) |

### 4.6 `chat.token.delta@v1` (Sampled — 1% of requests, configurable)

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `token_index` | integer | ✓ | 0-based position in stream |
| `delta_latency_ms` | integer | ✓ | Time since previous token (≥ 0) |
| `is_final` | boolean | ✓ | True for last token in stream |

**Sampling**: Controlled by `CHAT_TOKEN_SAMPLE_RATE` env (default `0.01`). Not emitted if sampling disabled.

### 4.7 `chat.retrieval.used@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `retrieval_type` | enum | ✓ | `vector` \| `keyword` \| `hybrid` \| `sql` |
| `query_hash` | string (hex, 64 chars) | ✓ | SHA-256(normalized_query \| salt), same salt as session_id_hash |
| `top_k` | integer | ✓ | 1–50 |
| `results_returned` | integer | ✓ | 0–top_k |
| `latency_ms` | integer | ✓ | ≥ 0, capped at 60,000 |
| `index_name` | string | ✓ | Logical index identifier, e.g. `job_posts_v2` (max 50 chars) |
| `filter_keys` | array[string] | ✗ | List of filter field names applied (max 10 items, each ≤ 30 chars) |

**Query Hashing**: Normalized query = lowercase, trim, collapse whitespace, remove punctuation. Hash prevents query text reconstruction.

### 4.8 `chat.tool.called@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `tool_name` | string | ✓ | Stable tool identifier, e.g. `search_jobs`, `get_job_detail`, `submit_application` (max 50 chars, from allowlist) |
| `tool_call_id` | string (UUID v4) | ✓ | Unique per invocation, links to `chat.tool.completed` |
| `args_hash` | string (hex, 64 chars) | ✓ | SHA-256(canonical_json_args \| salt), prevents arg reconstruction |
| `args_cardinality` | object | ✗ | Key-value counts only, e.g. `{"filters": 3, "ids": 1}` — no values |

### 4.9 `chat.tool.completed@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `tool_call_id` | string (UUID v4) | ✓ | Matches `chat.tool.called.tool_call_id` |
| `latency_ms` | integer | ✓ | ≥ 0, capped at 120,000 |
| `status` | enum | ✓ | `success` \| `error` \| `timeout` \| `rate_limited` |
| `error_class` | enum | ✗ | Required if status ≠ `success`: `validation` \| `not_found` \| `permission_denied` \| `upstream_error` \| `internal` |
| `result_count` | integer | ✗ | For list-returning tools: number of items returned (0–1000) |
| `result_size_bytes` | integer | ✗ | Approximate serialized response size (0–10,000,000) |

### 4.10 `chat.feedback.received@v1`

| Field | Type | Required | Allowed Values / Constraints |
|-------|------|----------|------------------------------|
| `feedback_type` | enum | ✓ | `thumbs_up` \| `thumbs_down` \| `rating_1_5` \| `free_text_flag` |
| `rating_value` | integer | ✗ | 1–5 (only for `rating_1_5`) |
| `request_correlation_id` | string (UUID v4) | ✓ | Links to the request being rated |
| `has_comment` | boolean | ✓ | True if user provided free-text (comment text NEVER stored) |

---

## 5. Explicit PII Exclusion List

The following are **NEVER** included in any event, under any circumstance:

| Category | Examples |
|----------|----------|
| Raw user message content | Any substring of user input, even truncated |
| Assistant response content | Any generated text, citations, or summaries |
| Direct identifiers | Email, phone, national ID, passport, user_id (raw), IP address |
| Auth credentials | JWTs, API keys, session tokens, cookies, passwords |
| Cross-session linkage keys | Raw session_id, user_id, device_id, fingerprint |
| Location data | GPS coordinates, precise address, IP-derived geo < city level |
| Employment PII | Resume text, cover letter, salary, SSN, bank details |
| File contents | Uploaded document text, parsed PDF/OCR output |
| Free-text feedback | User-written comments (only `has_comment: true` flag stored) |

**Semi-Identifiers (Hashed Only)**:
- `session_id` → `session_id_hash` (SHA-256 with daily salt)
- Retrieval query text → `query_hash` (SHA-256 with daily salt)
- Tool arguments → `args_hash` (SHA-256 with daily salt)
- **No raw values ever emitted**; salts rotated daily, never logged

---

## 6. Cardinality & Privacy Budget Guidance

| Constraint | Limit | Rationale |
|------------|-------|-----------|
| Enum value sets | Fixed per contract; additions require version bump | Prevents unbounded cardinality explosions |
| Array fields (`filter_keys`) | Max 10 items, each ≤ 30 chars | Bounded storage, no free-text |
| String fields (non-hash) | Max 50 chars (model_id, tool_name, index_name, error_code) | Identifiable but bounded |
| Integer counters | Capped at documented maximums | Prevents outliers from skewing aggregates |
| Hash fields | Fixed 64-char hex (SHA-256) | Constant size, no entropy leakage |
| Sampling rate (token.delta) | Configurable, default 1% | Volume control for high-cardinality stream events |
| Event batch size | Max 1000 events per write batch (capture tool config) | Backpressure handling |

**Privacy Budget**: No event contains > 1 semi-identifier hash. Cross-event linkage only via `correlation_id` (request-scoped, UUID v4, no user/session semantics). Analysts can aggregate by `session_id_hash` within 24h window only.

---

## 7. Capture Tool Traces

### 7.1 Event Producers (Source → Tool/Process)

| Event | Producer Component | Capture Mechanism |
|-------|-------------------|-------------------|
| `chat.session.started/ended` | SIMA Chat Controller (Laravel) | Middleware emits to local JSONL file |
| `chat.request.started/completed/failed` | ChatQueryService / MimoAdapterChatProvider | Service-layer instrumentation |
| `chat.token.delta` | Streaming response handler (SSE) | Sampled emitter in token loop |
| `chat.retrieval.used` | Retrieval adapters (Elasticsearch, PGVector, SQL) | Adapter wrapper instrumentation |
| `chat.tool.called/completed` | Tool registry / function calling executor | Decorator on tool invocation |
| `chat.feedback.received` | Feedback API endpoint | Controller middleware |

### 7.2 Trace Output Format

- **Format**: JSON Lines (`.jsonl`), one event per line
- **Encoding**: UTF-8, no BOM
- **File naming**: `chat-events-<environment>-<YYYYMMDD>-<HHMMSS>-<pid>.jsonl`
- **Rotation**: Size-based (100 MB) or time-based (1 hour), whichever first
- **Retention**: Local disk 7 days; shipped to central store per TASK-088/089
- **Directory**: `/var/log/sima/chat-analytics/` (configurable via `CHAT_ANALYTICS_LOG_DIR`)

### 7.3 Capture Tool: `chat-analytics-shipper`

A standalone, dependency-light binary (Go/Rust) or script that:
1. Tails rotated JSONL files
2. Validates each line against JSON Schema (bundled, versioned)
3. Batches & ships to configured sink (Kafka, HTTP, MongoDB via TASK-088)
4. Emits **self-observability events**: `chat.analytics.shipper.heartbeat@v1`, `chat.analytics.shipper.error@v1`
5. Runs as non-root, read-only access to log dir, write access to checkpoint file

### 7.4 Analyst Verification Procedure (No Production Secrets)

1. **Schema Validation**: `chat-analytics-shipper --validate --schema docs/chat-analytics-event-schema.json < sample.jsonl`
2. **Replay Test**: Shipper has `--dry-run --stdout` mode that outputs validated events to stdout (no network)
3. **Hash Verification**: Given a known `session_id` and date's `daily_salt` (provided by operator via secure channel), verify `session_id_hash` matches — proves hashing works without exposing other sessions
4. **PII Scan**: Automated grep for forbidden patterns (email regex, JWT regex, long base64 strings) on sample data — must return zero matches
5. **Cardinality Check**: `jq -s 'group_by(.event_name) | map({event: .[0].event_name, count: length, unique_sessions: (map(.session_id_hash) | unique | length)})' sample.jsonl` — confirms bounded cardinality
6. **End-to-End Trace**: Correlate `correlation_id` across `request.started` → `retrieval.used` → `tool.called` → `request.completed` — verifies full pipeline capture

### 7.5 Capture Tool Configuration (Non-Secret)

```yaml
# chat-analytics-shipper.yaml (tracked in repo, no secrets)
log_dir: "/var/log/sima/chat-analytics"
schema_path: "docs/chat-analytics-event-schema.json"
rotation:
  max_size_mb: 100
  max_age_hours: 1
batch:
  max_events: 1000
  max_wait_ms: 5000
sink:
  type: "kafka"  # or "http", "mongodb" — set per environment
  # Connection details via env vars only (CHAT_ANALYTICS_KAFKA_BROKERS, etc.)
sampling:
  token_delta_rate: 0.01
validation:
  strict: true
  pii_scan: true
```

---

## 8. Out of Scope (Explicitly NOT in This Contract)

| Item | Reason |
|------|--------|
| Raw message/response storage | Violates privacy-by-design; use separate opt-in feature if needed |
| User re-identification | `session_id_hash` salt rotation prevents cross-day linkage |
| Cross-session user journey | No persistent user identifier emitted |
| A/B test assignment | Handled upstream; only `model_id` reflected here |
| Business metrics (conversion, revenue) | Separate analytics domain |
| Model quality scoring (BLEU, ROUGE) | Requires ground truth; out of telemetry scope |
| Real-time alerting | Consumers implement their own alerting on shipped events |
| Data retention policy enforcement | Infrastructure concern (TASK-088/089) |
| GDPR/CCPA deletion workflows | Requires user identity linkage (excluded) |

---

## 9. Acceptance Criteria for This Contract

- [ ] Document stands alone — no external references needed to understand event schema
- [ ] Every field has type, requirement, constraints, and example
- [ ] PII exclusion list is exhaustive and unambiguous
- [ ] Hashing/salting spec is implementable without crypto expertise
- [ ] Capture tool traces are verifiable by analyst without production credentials
- [ ] Schema versioning strategy supports additive evolution
- [ ] Cardinality bounds are quantified and justified
- [ ] Out-of-scope list prevents scope creep in downstream tasks (TASK-088, 089, 090)

---

## 10. JSON Schema (Normative)

See companion file: `docs/chat-analytics-event-schema.json` (generated from this contract, used by shipper validation).

---

## 11. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-11-10 | agent-noabatgircom-2254092 | Initial draft |
