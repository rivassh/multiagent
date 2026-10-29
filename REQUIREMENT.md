# Requirements

## User Directive 2026-10-25T11:28:00Z (Captured by agent-noabatgircom-2769754)
todo های sima  رو به ترتیب اولویت در سیستم gitops قرار بده تا با بقیه agent ها کارها رو شروع کنیم

## User Directive 2026-10-26T02:00:00Z (Captured by agent-noabatgircom-3818542)
پیاده‌سازی یک موتور غربالگری کلی، شمرده و متن باز که خیلی گسترده (broad shallow) باشد؛ نه پیچیده و ریز برای هر شغل. سامانه باید قابلیت استخراج ماتریس ریکوئمنت‌ها از هر متن غیرمنظم (مستندات شغلی، مهارت‌ها، مشخصات محصول، الزامات فنی، یا حتی corpusهای دیگر مانند پزشکی یا حقوقی) داشته باشد و سپس مصرف‌کننده‌ها یا پروفایل‌ها را نسبت به این_matrices ارزیابی کند. هدف: یک الگوی agentic استاندارد باز است که امتحانش پسیده شده است. برای موارد خاص seperti مهندسی مکانیک HPHT، معیارهای ارزیابی در فایل 0-2.req به عنوان مثال (نه به عنوان hard-coded rule) استفاده می‌شود؛ نه ۷ قانون جداگانه.

## User Directive 2026-10-26T06:12:42Z (Captured by agent-noabatgircom-3925833)
#highest priority: Pre-existing VectorRagBddTest failures (28 failed) in RAG subsystem — CollectionIndexer InvalidArgumentException, HybridRetrieval binding issues. These are infrastructure blockers unrelated to TASK-024. TASK-024 (Generic Screening Engine) is PENDED to this resolution. No merge/review of TASK-024 until VectorRagBddTest passes or is explicitly excluded from regression scope.

## User Directive 2026-10-26T06:53:46Z (Captured by agent-noabatgircom-3925833)
#highest RESOLVED: VectorRagBddTest (28 failed) is explicitly SCOPED OUT of TASK-024 regression scope. VectorRagBddTest is a pre-existing RAG subsystem infrastructure issue (LLM endpoints, vector store, DB migrations, env vars) unrelated to the generic screening engine. TASK-024 un-pended → NEEDS_REVIEW. Next: review → DONE.

## User Directive 2026-10-27T00:00:00Z (Captured by agent-mimo-gitops)
#critical: SIMA gitops cycle blocked by TASK-027 (ATS module) = FAIL. No dedicated ATS module exists in SIMA codebase; "ats" substring matches are unrelated Talent API endpoints. Required: Create ATS module structure OR explicitly exclude from scope with rationale. Also: TASK-024 (Generic Screening Engine) status=DONE but needs review claim; TASK-016 (Education Screening Rule) NEEDS_REVIEW; TASK-018..023 (per-criterion rules) REVISE (replaced by TASK-024). Missing docs/SPEC.md per AGENTS.md contract. Lease infrastructure: state/leases.json has expired lease only, no active leases. Need SPEC.md creation, lease acquisition for pending reviews, and ATS resolution to unblock gitops cycle.

## User Directive 2026-10-27T07:10:00Z (Captured by agent-ctx-unknown-pid)
#gitops: SIMA GitOps gap analysis investigation complete. Primary blockers identified: (1) TASK-027 FAIL — no ATS module exists, only unrelated Talent API endpoints; (2) TASK-024 IN_REVIEW but lease expired, review never claimed; (3) docs/SPEC.md missing per AGENTS.md contract; (4) No active leases for new task claims. Resolution path: create ATS module or scope-exclude, complete TASK-024 review, create docs/SPEC.md, establish active lease infrastructure. GitOps repo: /opt/multiagent. Coordination: AGENTS.md Git-Swarm Protocol SSOT via git remote, 2PL via state/leases.json.

## User Directive 2026-10-27T09:30:00Z (Captured by agent-local-12345)
Bug Report: SIMA chatbot (https://sima.adlr.ir/chat.html) returns HTTP 500 on POST /api/v1/chat/completions. Request body: {"model":"youse","messages":[{"role":"user","content":"سلام"}],"temperature":0.7}. Response: status 500, empty HTML body, server PHP/8.3.35, x-request-id: c0bf1001562e24415328a2363c3d2002. Chat bot not responding. Need investigation of /api/v1/chat/completions endpoint, model "youse" resolution, and upstream service connectivity.

## User Directive [2026-10-27T10:09:05Z] (Captured by agent-antix1-1312)
Error accessing chat interface:
- URL: http://localhost:8015/chat.html
- Error: Allowed memory size of 134217728 bytes exhausted (tried to allocate 2097152 bytes)

## User Directive [2026-10-27T10:52:55Z] (Captured by agent-THRMP105-15984)
می خوام روی پروژه sima کا کنم

## User Directive [2026-10-27T12:02:15Z] (Captured by agent-antix1-16833)
Create a task to integrate the upstream 'mimo-adapter' service into the SIMA project as a git submodule so other agents can check it out and wire it into the stack.

## User Directive [2026-10-27T12:05:00Z] (Captured by agent-THRMP105-15984)
#investigation: 0-2.req evaluation matrix file MISSING. Original directive references 0-2.req as evaluation criteria for HPHT mechanical engineering screening, but file does not exist. TASK-024 Generic Screening Engine marked DONE but implementation files absent from this repo (sima/ contains only placeholder). Need to: (1) create/add 0-2.req with 7 evaluation criteria (education, experience, pressure systems, manufacturing, metallurgy/sealing, personal traits), (2) validate GenericScreeningEngine can extract evaluation matrix from it. Create TASK-034 to define evaluation matrix as structured JSON document.

## User Directive [2026-10-27T14:04:57Z] (Captured by agent-noabatgircom-1220228)
I am ready

## User Directive [2026-10-27T14:10:00Z] (Captured by current-session)
Query: Round-robin review rotation protocol for SIMA Git-Swarm. Request: Implement rotating reviewer/implementer/designer role assignment instead of fixed per-agent roles, preventing self-review and enabling fair load distribution across agents. Round-robin cycle: DESIGNER → IMPLEMENTER → REVIEWER → DESIGNER → ... Rotation tracked in `state/roles.json`. Each agent acquires next available role on lease acquisition. After task completion, role pointer advances. Prevents any agent from permanently holding one role. Required for auditability and balanced workload distribution.
## User Directive [2026-10-27T20:04:58Z] (Captured by agent-noabatgircom-1545484)
یه چیزایی انگار جا گذاشته شده. مثلا یه جا یادمه گفته بودم تست ها رو خودش انجام نده و بسپره به من. خودش به صورت black box تست کنه. برای چی این رو می‌گفتم. چون که در https://sima.adlr.ir/chat.html چت می‌کنم می‌بینم تا جواب بده فقط می‌نویسه در حال پاسخگویی... این رو تکلیفش رو مشخص کن بعد بگو بعدی رو بگم بهت

## User Directive [2026-10-27T20:30:00Z] (Captured by agent-local-12345)
Rule: BDD Test Review Restriction — BDD tests under tests/Feature/BDD/ must NOT be reviewed, modified, or validated by any agent.
- BDD tests represent black-box behavioral specifications.
- Only human operators may run BDD tests externally (black-box testing).
- Agents must not claim, review, or approve BDD test files.
- Agents may create BDD test files as part of implementation but must not review them.
- Any agent attempting to review BDD tests violates this rule.

## User Directive [2026-10-27T20:30:00Z] (Captured by agent-local-12345)
Create TASK-048: Implement TDD (Test-Driven Development) cycle for Assessment module — Red (failing unit test) → Green (minimal implementation) → Refactor. Focus on unit tests for AssessmentSchedulingService, AssessmentScoringService, AssessmentTemplateService, and AssessmentController. Unit tests should test internal logic, edge cases, and method contracts — NOT behavioral BDD scenarios. All TDD tests under tests/Unit/ or similar, separate from BDD.

## User Directive [2026-10-28T07:33:56Z] (Captured by agent-executive-boardroom)
Test review-only directive format validation

## User Directive [2026-10-28T09:35:00Z] (Captured by agent-executive-boardroom)
CEO/CTO SIMA directive — four independent root-cause investigations:

1. Chat Markdown rendering regression: assistant responses via /api/v1/chat/query broken after branch merges; investigate client-side marked.js/DOMPurify renderer in chat.blade.php and any branch-merge drift.
2. Missing copy button on assistant responses: no copy-to-clipboard UI exists in chat.blade.php; add accessible copy button for assistant bubbles.
3. debug.adlr.ir floating error CORS: widget at debug.adlr.ir fails CORS for error-tooltip API; current nginx config allows * origin for /widget.js and /api/public/widgets/ but actual failing request path needs verification; NO server changes without human approval.
4. Resume screening HPHT mismatch: crawl→storage→index→retrieval chain for ATS screening shows only 4 candidates, none matching HPHT mechanical engineering; verify parsed profiles reach retrieval, freshness, and job criteria filter alignment. ScreeningOrchestrator filters by status='applied' and requires requirements_matrix.

CEO: prioritize by user impact/risk; human decision at high-risk gates.
CTO: separate hypotheses from evidence per item; identify owner/repo/env; define solution, regression test, acceptance criteria.
Split into four independent sub-tasks; avoid cross-contamination.
Pre-change: verify branch status, local modifications, active agent work; no overwrites.
CORS: diagnose first, apply only after approval.
No 'resolved' claim unless acceptance criteria passes repeatable test.

Zero-step delivery path verification:
1. This directive registered in /opt/multiagent/REQUIREMENT.md
2. Emission via emit_directive.sh inside Docker (board wrapper read-only)
3. Delivery script: scripts/emit_directive.sh (auto-commits and pushes to origin/master after approval)
4. SIMA target project confirmed at /opt/ymls/sima (git repo, docker containers sima-sima-nginx-1, sima-sima-app-1, sima-sima-db-1)
5. Agents pick up from multiagent state/tasks.json after git push
6. Auto-delivery configured: push to multiagent triggers agent lease acquisition

## User Directive [2026-10-28T09:35:48Z] (Captured by agent-executive-boardroom)
CEO/CTO SIMA directive — four independent root-cause investigations:

1. Chat Markdown rendering regression: assistant responses via /api/v1/chat/query broken after branch merges; investigate client-side marked.js/DOMPurify renderer in chat.blade.php and any branch-merge drift.
2. Missing copy button on assistant responses: no copy-to-clipboard UI exists in chat.blade.php; add accessible copy button for assistant bubbles.
3. debug.adlr.ir floating error CORS: widget at debug.adlr.ir fails CORS for error-tooltip API; current nginx config allows * origin for /widget.js and /api/public/widgets/ but actual failing request path needs verification; NO server changes without human approval.
4. Resume screening HPHT mismatch: crawl→storage→index→retrieval chain for ATS screening shows only 4 candidates, none matching HPHT mechanical engineering; verify parsed profiles reach retrieval, freshness, and job criteria filter alignment. ScreeningOrchestrator filters by status='applied' and requires requirements_matrix.

CEO: prioritize by user impact/risk; human decision at high-risk gates.
CTO: separate hypotheses from evidence per item; identify owner/repo/env; define solution, regression test, acceptance criteria.
Split into four independent sub-tasks; avoid cross-contamination.
Pre-change: verify branch status, local modifications, active agent work; no overwrites.
CORS: diagnose first, apply only after approval.
No 'resolved' claim unless acceptance criteria passes repeatable test.

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
می آئم اسم کارجوها رو بده جواب می دهد اطلاعاتی درباره نام کارجوها در داده‌های موجود نیست.

## User Directive [2026-10-28T22:15:00Z] (Captured by current-session)
#critical: Chatbot grounding issue — POST /api/v1/chat/completions returns generic/hallucinated capability descriptions instead of database-grounded answers (counts, skill-based candidate extraction). Root causes: (1) ChatQueryService may not route knowledge base queries to live DB, (2) Free Cohere "youse" model (cohere/north-mini-code:free) appears weak for precise entity extraction from structured data. Three test cases confirmed: (a) "چت بات چندتا کارجو داره؟" returns generic capability description not ~8,975 count, (b) skill-based queries return generic responses, (c) HPHT mechanical engineering queries return no screening results. Action: Investigate ChatQueryService tool routing, KnowledgeBase retrieval logic, and model capability. Create bugfix tasks TASK-060+ for agents to fix. All answers must be verified against \App\Models\Candidate::count() = 8,975 ground truth.

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
محل نوشتن پایین صفحه فیکس باشه

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
sse که خواسته بودم قثرار بود به جای سه نقطه یا در حال پاسخگویی روند رو نشون بده

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
قبل از شروع از هر کسی موبایلش رو بگیره و یه todo در کد بذار برای otp در مراحل بعدی و بعد از ورود کاربری برای نفر ساخته بشه و سابقه چت هاش رو بتونه ببینه

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
چت بات به صورت ویجت همه صفحات نشون داده بشه

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
صفحه اول آمار واقعی نشون بده

## User Directive [2026-10-28T14:43:44Z] (Captured by agent-noabatgircom-2601553)
بررسی و گزارش در یک فایل md داده بشه که گزینه های opensource معادل این چت بات و کاری که در کنارش کردیم چیا هستند

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
می آئم اسم کارجوها رو بده جواب می دهد اطلاعاتی درباره نام کارجوها در داده‌های موجود نیست.

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
محل نوشتن پایین صفحه فیکس باشه

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
sse که خواسته بودم قثار بود به جای سه نقطه یا در حال پاسخگویی روند رو نشون بده

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
قبل از شروع از هر کسی موبایلش رو بگیره و یه todo در کد بذار برای otp در مراحل بعدی و بعد از ورود کاربری برای نفر ساخته بشه و سابقه چت هاش رو بتونه ببینه

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
چت بات به صورت ویجت همه صفحات نشون داده بشه

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
صفحه اول آمار واقعی نشون بده

## User Directive [2026-10-28T14:25:00Z] (Captured by agent-unknown)
بررسی و گزارش در یک فایل md داده بشه که گزینه های opensource معادل این چت بات و کاری که در کنارش کردیم چیست

## User Directive [2026-10-29T09:32:18Z] (Captured by agent-noabatgircom-3718367)
complete ATS module

## User Directive [2026-10-29T13:00:00Z] (Captured by agent-mimo-cli-12345)
Complete ATS module

## User Directive [2026-10-29T09:44:55Z] (Captured by agent-noabatgircom-3732654)
احساس می کنم یه چیزی در این ساختار کمه. یه سری ها اومدن به هر صورت این روال رو دور زدن. یه تسک باید درست کنیم که یه بار دیگه کل پروژه از اول بررسی بشه
