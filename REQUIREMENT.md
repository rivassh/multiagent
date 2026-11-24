# Requirements

## User Directive [2026-11-05T15:08:00Z] (Captured by agent-noabatgircom-2254092)
DIRECTIVE: Refactor Swarm Architecture into Role-Based, Isolated Multi-Project System
1. OS Agnostic & Path Resolution: Eliminate all OS symlinks. Introduce .env.example defining project relative paths (PROJECT_ROOT, subproject paths). Ensure complete cross-platform execution (Linux / Windows WSL / Docker).
2. Docker Orchestration & Minimal Web Dashboard: Provide a root docker-compose.yml that standardizes runtime dependencies. Include a lightweight dashboard service (Python http.server or a minimal static HTML/JS dashboard) reading state/**/tasks.json directly from files to display Kanban/task statuses.
3. Multi-Project State Isolation: Migrate single state/tasks.json and state/leases.json into partitioned directories: state/sima/, state/candash/, state/shared/. Update lease management and task runner logic to respect these namespaces without cross-state collision.
4. Lifecycle & Quality Gate Extension: Extend task statuses to: TODO -> IN_PROGRESS -> NEEDS_QA -> QA_PASSED (or QA_FAILED) -> NEEDS_REVIEW -> IN_REVIEW -> DONE. Strictly decouple the Reviewer and QA roles from the Task Implementer (Author cannot QA or Review their own task).
5. Role-Based Contracts (.roles/): Create .roles/ directory with explicit Markdown playbooks: product-owner.md, scrum-master.md, architect-cto.md, frontend-dev.md & backend-dev.md, qa-engineer.md, code-reviewer.md. Create an entry script or runner contract (load_role.sh / docs) so any newcomer or stateless agent can pick a role and immediately know their scope without conversation history.
6. Protocol Update (AGENTS.md): Update AGENTS.md and docs/SPEC.md to reflect these contracts, the new lifecycle, and the partitioned state schema.

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

## User Directive [2026-11-03T07:20:46Z] (Captured by agent-noabatgircom-2254092)
متاسفانه فرصت گرفتن api نداریم و خیلی موارد بعد از این هم این طور خواهند بود. هدف طرح ریزی روالی کلی است که بعد از این با یک اشاره سریع تر انجام بشه

## User Directive [2026-11-03T07:28:34Z] (Captured by agent-noabatgircom-2254092)
اگر شروع کنی کارها رو انجام دادن به روال کنونی که برای jobvision هست آسیبی وارد نمی شه که؟ 
backward compability رعایت می شه؟

## User Directive [2026-11-03T17:43:53Z] (Captured by agent-noabatgircom-2254092)
یکی از task-hr ها رو شروع کن

## User Directive [2026-11-03T07:33:23Z] (Captured by agent-noabatgircom-2254092)
حاضری شروع کنیم؟

## User Directive [2026-11-03T07:50:12Z] (Captured by agent-noabatgircom-2254092)
مثه اینکه همزمان کسی داره روی network شبکه داکر این پروژه کار می کنه. نقشه رو نشون بده اگر به مشکلی خوردی  تا بعدش بگم چی کار کنیم

## User Directive [2026-11-03T11:54:40Z] (Captured by agent-noabatgircom-2254092)
اصلاح شد. دوباره بررسی کن

## User Directive [2026-11-03T12:01:52Z] (Captured by agent-noabatgircom-2254092)
اصلاح شد. دیگه موردی نیست؟ بریم برای شروع کار؟

## User Directive [2026-11-03T12:04:58Z] (Captured by agent-noabatgircom-2254092)
har رو یه بار بیشتر نمی دیم قضیه ش چیه انقدر گیر داری روی اون؟ الگو بر می داری برای مثلا لینکدین و بعد میریزمش دور. بیشتر توضیح می دی؟

## User Directive [2026-11-03T12:33:28Z] (Captured by agent-noabatgircom-2254092)
اصلاح شد. دیگه حرفی نیست؟

## User Directive [2026-11-03T12:38:05Z] (Captured by agent-noabatgircom-2254092)
ببین این قسمت har در واقع هوش مصنوعی به کارش میاد فقط. خود agent که نقش developer داره انگار ببرسی می کنه و می فهمه مثلا برای گرفتن اطلاعاتش کدوم درخواست رو با چه ابزاری باید در کد پیاده سازی کنه که دیتای مدنظر رو بگیره

## User Directive [2026-11-03T12:40:58Z] (Captured by agent-noabatgircom-2254092)
شروع کنیم؟

## User Directive [2026-11-03T13:07:21Z] (Captured by agent-noabatgircom-2254092)
الان دقیقا چی لازم داری؟ har از لینکدین در بیارم؟

## User Directive [2026-11-03T13:14:08Z] (Captured by agent-noabatgircom-2254092)
چون فارسی هایی که تایپ می کنی چپ به راست هست خوب نمی فهمم چی می گی. یا انگلیسی جواب بده یا راست به چپ فارسی بنویس

## User Directive [2026-11-03T13:45:10Z] (Captured by agent-noabatgircom-2254092)
ا طلاعات این har بعد از بررسی تو منسوخ می شن و فقط flow ای در میاری مهمه. بقیه‌ش چه بخوای چه نخوای اطلاعات محرمانه  حساب نمی شه و سوخته هستش

## User Directive [2026-11-03T13:49:08Z] (Captured by agent-noabatgircom-2254092)
تمام اطلاعات حساسش رو تغییر دادم تا دیگر نگرانی نداشته باشی. بررسی کن و flow رو در بیار

## User Directive [2026-11-03T13:56:04Z] (Captured by agent-noabatgircom-2254092)
خیلی خب. به یه دولوپر دیگه می گم این کار رو بکنه. چی کار باید بکنه با har ؟

## User Directive [2026-11-03T13:18:04Z] (Captured by agent-noabatgircom-2254092)
این هم har از لینکدین. چی کار کنیم؟

## User Directive [2026-11-03T08:48:12Z] (Captured by antix1)
می تونی خودت این کار رو بکنی؟

## User Directive [2026-11-03T08:59:39Z] (Captured by antix1)
ادامه بده

## User Directive [2026-11-03T17:14:45Z] (Captured by agent-antix1-23122)
خودم مدیریت می کنم تغییر فایل های پروژه رو بیشتر مدیریت تسک ها منظورم هست که اگر به  در چت جدیدی گفتم تسک های hr  رو انجام بده نره سراغ تسک های sima . مثلا شاید اینجوری درست باشه که اگر task-049 برای سیما هست برای hr رو بذاریم task-hr-001 یا هر جور که صلاح می دونی. تا حالا اصلا این gitops ای که باهاش کار می کنم ندیدم و همش با agent بهش فرمان دادم

## User Directive [2026-11-03T17:29:06Z] (Captured by agent-antix1-24681)
خب به عنوان اولین بحث hr می خوام فارغ از اینکه ما یه چت بات داریم که می فهمه و جواب می ده یه داشبورد داشته باشیم. شاید کسی با داشبورد معمولی راحت تر باشه. منتهی باید قابلیت هر نوع فیلتری رو داشته باشیم. یه جوری باید زیرساختش چیده بشه که به سرعت بشه فیلتر اضافه کرد. با توجه به اینکه قبلا یادمه خواسته بودم بریم سمت elastic  و در نقشه راه هم قرار داره فکر کنم ساختار کد برای ساخت فیلتر جوری باشه که بشه به رااحتی با کوئری ها و ایندکس های الستیک نقش کرد بهتره. نظرت چیه؟

## User Directive [2026-11-03T16:36:40Z] (Captured by agent-antix1-23122)
می تونی به عنوان یه زیرپروژه از sima بدون اینکه با تسک های حال حاضر تداخلی ایجاد بشه داشبورد hr رو ببری جلو؟

## User Directive [2026-11-03T17:28:03Z] (Captured by agent-antix1-14509)
اصرارم به الستیک به خاطر اینه که نمی خوام ساختار دیتابیس عوض بشه. چون اگر با رویکرد غیر وابسته به الستیک بریم اونوقت جلوتر برای هر فیلتر جدید یه وقت باید فیلد جدید به دیتابیس اضافه کنیم که معقول نیست

## User Directive [2026-11-03T17:33:32Z] (Captured by agent-antix1-14509)
در واقع الستیک کم کم می شه یه dataware house که شاید در جاهای دیگه هم بتونیم به عنوان یه  rag collection   بهره ببریم

## User Directive [2026-11-05T11:08:45Z] (Captured by agent-antix1-12099)
پس الانباید بریم سراغ تسک بعدی یعنی ۲ ؟

## User Directive [2026-11-03T18:00:25Z] (Captured by agent-noabatgircom-2254092)
تسک جدیدی از  task-hr ها بردار

## User Directive [2026-11-05T11:53:58Z] (Captured by agent-noabatgircom-2254092)
منظورم این بود به پوشه قبل و multiagent بری و از محتوای اون سر در بیاری. یه جور gitops هست برای انجام کارها با چند agent که می خوام باهاش آشنا بشی و تسک های این پروژه رو با اون انجام بدیم. مثلا task-omr-001

## User Directive [2026-11-05T11:53:58Z] (Captured by agent-noabatgircom-2254092)
افزودن namespace و scope مستقل OMR برای task-omr-001 (پیشنهادی)

## User Directive [2026-11-05T11:53:58Z] (Captured by agent-noabatgircom-2254092)
نه اون فقط یه مثال بود. تسک ها رو بچین حالا که با ساختار آشنا شدی.

## User Directive [2026-11-05T11:53:58Z] (Captured by agent-noabatgircom-2254092)
یک endpoint استیجینگ OMR دارم و بعداً آدرسش را می‌دهم

## User Directive [2026-11-05T12:10:23Z] (Captured by agent-noabatgircom-2254092)
start tasks doing and commit your changes at end

## User Directive [2026-11-05T12:10:23Z] (Captured by agent-noabatgircom-2254092)
این تغییرات را حفظ و با OMR scope ادغام کن (پیشنهادی)

## User Directive [2026-11-05T12:44:21Z] (Captured by agent-noabatgircom-2254092)
Search for `task-omr-001|omr-001|TASK-OMR-001`

Read , lines 330 to 390
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/state/tasks.json",
  "view_range": [
    330,
    390
  ]
}

Search for `OMR|task-omr-001|TASK-OMR-001`

Read , lines 1 to 220
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/state/runner_workflow.js",
  "view_range": [
    1,
    220
  ]
}

Read , lines 1 to 240
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/tests/Feature/runner_workflow.test.cjs",
  "view_range": [
    1,
    240
  ]
}

Read , lines 220 to 520
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/state/runner_workflow.js",
  "view_range": [
    220,
    520
  ]
}

Read , lines 446 to 520
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/state/runner_workflow.js",
  "view_range": [
    446,
    520
  ]
}

Read , lines 1 to 180
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/AGENTS.md",
  "view_range": [
    1,
    180
  ]
}

Read , lines 1 to 120
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/docs/SPEC.md",
  "view_range": [
    1,
    120
  ]
}

Search for `stage_assigned_to`

Ran terminal command: node --test tests/Feature/runner_workflow.test.cjs

Read , lines 120 to 180
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/REQUIREMENT.md",
  "view_range": [
    120,
    180
  ]
}

Search for `OMR|TASK-OMR`

Read , lines 754 to 772
Completed with input: {
  "path": "/home/hamid/Projects/multiagent/state/team_log.md",
  "view_range": [
    754,
    772
  ]
}

I found one medium-severity issue in the OMR scope work.

| # | Severity | File | Finding | Confidence |
|---|---|---|---|---|
| 1 | 🟡 MEDIUM | `state/runner_workflow.js` | Namespace isolation is not enforced for dependencies. The dependency gate checks only whether a referenced task is DONE, regardless of whether it belongs to the active scope. For example, an OMR task can be unblocked by a Sima or HR task with a matching status, which violates the contract that explicit OMR work must only depend on `TASK-OMR-*` tasks and the same scope should be isolated. The offending logic is the `dependencies.filter(...status !== 'DONE')` check in `processTaskLifecycle()`. | 8/10 |

Why this matters:
- `--scope omr` currently filters the task list by pattern, but it does not filter the dependency graph by namespace.
- That means a task such as `TASK-OMR-002` could incorrectly proceed when `TASK-001` or `TASK-HR-001` is marked DONE.
- The repo’s own AGENTS/spec requires namespace isolation for HR and OMR work, so this is a real correctness bug, not just a cosmetic issue.

Suggested fix:
- When evaluating `depends_on`, verify each dependency matches the active scope pattern before considering it satisfied.
- For example, in `omr` mode only accept dependencies matching `/^TASK-OMR-\d{3}$/`, and do the same for `hr` and default `sima` modes.
