# Requirements

## User Directive 2026-10-25T11:28:00Z (Captured by agent-noabatgircom-2769754)
todo های sima  رو به ترتیب اولویت در سیستم gitops قرار بده تا با بقیه agent ها کارها رو شروع کنیم

## User Directive 2026-10-26T02:00:00Z (Captured by agent-noabatgircom-3818542)
پیاده‌سازی یک موتور غربالگری کلی، شمرده و متن باز که خیلی گسترده (broad shallow) باشد؛ نه پیچیده و ریز برای هر شغل. سامانه باید قابلیت استخراج ماتریس ریکوئمنت‌ها از هر متن غیرمنظم (مستندات شغلی، مهارت‌ها، مشخصات محصول، الزامات فنی، یا حتی corpusهای دیگر مثل پزشکی یا حقوقی) داشته باشد و سپس مصرف‌کننده‌ها یا پروفایل‌ها را نسبت به این ماتریس ارزیابی کند. هدف: یک الگوی agentic استاندارد باز است که امتحانش پسیده شده است. برای موارد خاص مثل مهندسی مکانیک HPHT، معیارهای ارزیابی در فایل 0-2.req به عنوان مثال (نه به عنوان hard-coded rule) استفاده می‌شود؛ نه ۷ قانون جداگانه.

## User Directive 2026-10-26T06:12:42Z (Captured by agent-noabatgircom-3925833)
#highest priority: Pre-existing VectorRagBddTest failures (28 failed) in RAG subsystem — CollectionIndexer InvalidArgumentException, HybridRetrieval binding issues. These are infrastructure blockers unrelated to TASK-024. TASK-024 (Generic Screening Engine) is PENDED to this resolution. No merge/review of TASK-024 until VectorRagBddTest passes or is explicitly excluded from regression scope.

## User Directive 2026-10-26T06:53:46Z (Captured by agent-noabatgircom-3925833)
#highest RESOLVED: VectorRagBddTest (28 failed) is explicitly SCOPED OUT of TASK-024 regression scope. VectorRagBddTest is a pre-existing RAG subsystem infrastructure issue (LLM endpoints, vector store, DB migrations, env vars) unrelated to the generic screening engine. TASK-024 un-pended → NEEDS_REVIEW. Next: review → DONE.

## User Directive 2026-10-27T00:00:00Z (Captured by agent-mimo-gitops)
#critical: SIMA gitops cycle blocked by TASK-027 (ATS module) = FAIL. No dedicated ATS module exists in SIMA codebase; "ats" substring matches are unrelated Talent API endpoints. Required: Create ATS module structure OR explicitly exclude from scope with rationale. Also: TASK-024 (Generic Screening Engine) status=DONE but needs review claim; TASK-016 (Education Screening Rule) NEEDS_REVIEW; TASK-018..023 (per-criterion rules) REVISE (replaced by TASK-024). Missing docs/SPEC.md per AGENTS.md contract. Lease infrastructure: state/leases.json has expired lease only, no active leases. Need SPEC.md creation, lease acquisition for pending reviews, and ATS resolution to unblock gitops cycle.

## User Directive 2026-10-27T07:10:00Z (Captured by agent-ctx-unknown-pid)
#gitops: SIMA GitOps gap analysis investigation complete. Primary blockers identified: (1) TASK-027 FAIL — no ATS module exists, only unrelated Talent API endpoints; (2) TASK-024 IN_REVIEW but lease expired, review never claimed; (3) docs/SPEC.md missing per AGENTS.md contract; (4) No active leases for new task claims. Resolution path: create ATS module or scope-exclude, complete TASK-024 review, create docs/SPEC.md, establish active lease infrastructure. GitOps repo: /home/hamid/Projects/multiagent. Coordination: AGENTS.md Git-Swarm Protocol SSOT via git remote, 2PL via state/leases.json.

## User Directive [2026-11-02T09:52:51Z] (Captured by agent-noabatgircom-2254092)
قسمت ورود به صورت modal نمایش داده بشه

## User Directive [2026-11-02T11:16:24Z] (Captured by agent-noabatgircom-2254092)
مهاجرت نمی خوام بکنم. می خوام یه کپی داشته باشم جدا اصلا داکر کامپوزش هم جدا. حالت data analyse یه سری آدم بشینن روی این دیتا کار کنند. pipline حساب می شه یه جورایی یا etl به یه دیتابیس دیگه

## User Directive [2026-11-02T11:16:24Z] (Captured by agent-noabatgircom-2254092)
عالی. برو جلو

## User Directive [2026-11-02T11:24:41Z] (Captured by agent-noabatgircom-2254092)
انجام شد

## User Directive [2026-11-02T11:28:12Z] (Captured by agent-ca53993e9dea-1)
می‌تونی طبق پروکل های این ریپو کارهایی که تا الان انجام شده و لاگی نداره کم و کاستی هاش رو جبران کنی؟

## User Directive [2026-11-02T12:52:21Z] (Captured by agent-noabatgircom-2254092)
در یکی از چت ها گفته شده بود ۱۵ تا شغل وجود داره احتمال sync برای دیتابیسی که چت بات ازش می خونه درست انجام نشده. برام توضیح می دی روال چطور هست از وقتی که از jobvision میاد  تا وقتی که جواب کاربر داده می شه؟
از کدوم دیتابیس ها فراخونی می شه و به کدوم دیتابیس ها چه دیتاهایی ریخته می شه. اگر بشه این یک مستند بشه برای developerها که عالی می شه

## User Directive [2026-11-02T13:18:37Z] (Captured by agent-noabatgircom-2254092)
continue

## User Directive [2026-11-03T05:36:55Z] (Captured by agent-noabatgircom-2254092)
آماده کن

## User Directive [2026-11-03T06:09:14Z] (Captured by agent-noabatgircom-2254092)
الان token جدید بدم؟

## User Directive [2026-11-03T06:16:08Z] (Captured by agent-noabatgircom-2254092)
@jobvision..ir_har.har رو بررسی کن هم توکن جدید هست که می تونی در .env جدید جاگذاری کنی و کارهای لازم رو انجام بدی که کار کنه و هم روندی که اگر expire شد درستش کنی

## User Directive [2026-11-03T06:43:51Z] (Captured by agent-noabatgircom-2254092)
گذاشتم داخل .env

## User Directive [2026-11-03T09:08:05Z] (Captured by agent-noabatgircom-2254092)
خطا در ارتباط با دستیار: NetworkError when attempting to fetch resource.
جواب شرح شغلی رو نمی ده چت بات

## User Directive [2026-11-03T09:53:42Z] (Captured by agent-noabatgircom-2254092)
همه کارهات رو با sudo docker انجام بده جتی npm install . continue

## User Directive [2026-11-03T10:35:34Z] (Captured by agent-noabatgircom-2254092)
کاملتر کن
