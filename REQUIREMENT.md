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
#gitops: SIMA GitOps gap analysis investigation complete. Primary blockers identified: (1) TASK-027 FAIL — no ATS module exists, only unrelated Talent API endpoints; (2) TASK-024 IN_REVIEW but lease expired, review never claimed; (3) docs/SPEC.md missing per AGENTS.md contract; (4) No active leases for new task claims. Resolution path: create ATS module or scope-exclude, complete TASK-024 review, create docs/SPEC.md, establish active lease infrastructure. GitOps repo: /home/hamid/Projects/multiagent. Coordination: AGENTS.md Git-Swarm Protocol SSOT via git remote, 2PL via state/leases.json.

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
