# Onramp 2.0 — Complete Project Plan

> Developer onboarding platform: AI agents analyze any GitHub repo → generate personalized learning paths → find first issues → guide contributions → track progress

---

## Table of Contents

- [Architecture](#architecture)
- [Onboarding Pipeline](#onboarding-pipeline)
- [Phase 1: Connect Pages to APIs](#phase-1-connect-pages-to-apis)
- [Phase 2: Complete Onboarding Flow](#phase-2-complete-onboarding-flow)
- [Phase 3: Feature Gaps & Polish](#phase-3-feature-gaps--polish)
- [Phase 4: Scale & Deploy](#phase-4-scale--deploy)
- [File Reference](#file-reference)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React 19)                        │
│  58+ pages (44+ routes) · Workbench panels · Tailwind ·         │
│  Framer Motion + GSAP · Recharts · Monaco Editor · lazy splits │
├────────────────────────────────────────────────────────────────┤
│                     API CLIENT (lib/api.ts)                     │
│  114 typed functions · JWT + cf_ API key · silent refresh       │
├────────────────────────────────────────────────────────────────┤
│               BACKEND (FastAPI · Python 3.12+)                  │
│  42+ routers · 8 middleware · 60+ services                      │
│  16 AI agents · Multi-provider LLM router + EmbeddingRouter     │
├────────────────────────────────────────────────────────────────┤
│                     DATA & WORKER LAYER                         │
│  PostgreSQL 16 (asyncpg/SQLAlchemy 2.0/pgvector, 34 tables)     │
│  Redis (rate-limit + LLM cache + Celery broker + OAuth state)   │
│  Celery worker + beat · GitHub API · SendGrid · Razorpay (INR) │
└────────────────────────────────────────────────────────────────┘
```

### 16 AI Agents

| Agent | Purpose |
|-------|---------|
| **ArchitectureExplorer** | Clone repo → parse AST → build dependency graph → detect architecture pattern |
| **LearningPathGenerator** | Generate 5-8 personalized learning modules from repo structure |
| **FirstPRAccelerator** | Find beginner-friendly issues with complexity scoring → generate step-by-step guides |
| **RepoQA** | Index repo → answer natural language questions with file references |
| **SilentPairProgramming** | Generate narrated walkthrough transcript for solving an issue |
| **PatternRecognition** | Find similar implementation patterns across repositories |
| **RegressionTestGenerator** | Generate test checklist from PR diff |
| **OnboardingReportGenerator** | Generate professional PDF/HTML onboarding report |
| **HealthScorer** | Score repo on coverage, complexity, docs, maintainability |
| **PR Review Agent** | Review PR diffs for bugs, security, code quality |
| **TaskQA** | Review task completion against requirements with scoring |
| **IssueResolutionAgent** | Analyze failure signals → propose resolution steps |
| **AutonomousCodingAgent** | Repo assign → implement → open GitHub PR (part of Autopilot) |
| **DriftDetector** | Detect architecture erosion vs. declared intent |
| **CodebaseTrailer** | Generate repo preview/trailer artifacts |
| **QuizGenerator** | Module-level quizzes with auto-grading |

### Frontend Pages (44+ routes)

All routes are lazy-loaded and RBAC-gated. Core set (full list in `web/src/pages/` + `web/src/App.tsx`):

| Route | Page | Purpose | API Status |
|-------|------|---------|------------|
| `/` | LandingPage | Marketing + feature showcase | ✅ Static |
| `/why-onramp` | WhyOnrampPage | Cost-at-scale calculator (agents vs Onramp) | ✅ Static + benchmark API |
| `/pricing` | PricingPage | Pricing tiers + comparison | ✅ Static |
| `/changelog` | ChangelogPage | Release notes | ✅ Static |
| `/docs` + `/docs/*` | DocsPage + DeveloperPortal | Documentation | ✅ Static |
| `/login` | Login | JWT login + OAuth | ✅ Wired |
| `/register` | Register | New user registration | ✅ Wired |
| `/forgot-password` | ForgotPassword | Password reset | ✅ Wired |
| `/join` | JoinPage | Accept team invite | ✅ Wired |
| `/explore` | ExplorePage | Repo architecture analysis + force graph | ✅ Wired |
| `/learn` | LearnPage | AI learning paths + timeline | ✅ Wired |
| `/first-issue` | FirstIssuePage | Beginner issue finder + PR guides | ✅ Wired |
| `/ask` | AskPage | Repo Q&A with chat interface (SSE) | ✅ Wired |
| `/reports` | OnboardingReportPage | Generate onboarding reports | ✅ Wired |
| `/dashboard` | DashboardPage | CTO metrics + team analytics (Mission Control) | ✅ Wired |
| `/executive` | ExecutivePage | Executive console + cohort trends | ✅ Wired |
| `/ramp` | RampPage | Ramp health, cost, stuck panel (Track→Quantify→Intercept) | ✅ Wired |
| `/reviews` | ReviewQueuePage | Review Ops (load board + suggestion) | ✅ Wired |
| `/team` | TeamPage | Team member management + invites | ✅ Wired |
| `/playbooks` + `/marketplace` | PlaybooksPage + MarketplacePage | Onboarding playbooks + marketplace | ✅ Wired |
| `/billing` | BillingPage | Razorpay subscription + credit wallet | ✅ Wired |
| `/api-keys` | ApiKeysPage | API key management (cf_) | ✅ Wired |
| `/admin` | AdminDashboardPage | Admin console (users, provider keys) | ✅ Wired |
| `/settings` | Settings | User preferences + theme | ✅ Wired |
| `/profile` | Profile | User profile (incl. deactivation) | ✅ Wired |
| `/pr-describe` | PRDescriptionPage | AI PR description generator | ✅ Wired |
| `/tasks` | TasksPage | Onboarding task kanban + list view | ✅ Wired |
| `/my-progress` | TraineeDashboard | Personal onboarding progress | ✅ Wired |
| `/notifications` | NotificationsPage | Notification center (14 types) | ✅ Wired |
| `/wiki` | WikiPage | AI wiki from repo URL | ✅ Wired |
| + 15 more | AuthCallback, Drift, CodeHealth, Dora, HR People, etc. | — | ✅ |

> See `web/src/pages/` (58+ components, `*.test.tsx` excluded) and `STATUS.md:Frontend Routes`.

---

## Onboarding Pipeline

The complete end-to-end flow for training a new developer:

```
┌──────────────────────────────────────────────────────────────┐
│                MANAGER SETUP (BEFORE HIRE)                   │
├──────────────────────────────────────────────────────────────┤
│  /playbooks → Create reusable onboarding playbook            │
│    • Title, description, steps list                          │
│    • Saved per team, reusable for future hires               │
│                                                              │
│  /team → Create team, invite new hire by email               │
│    • Invite sent via SendGrid with acceptance token          │
│    • Token-based acceptance → auto-adds to team              │
│    • Role: trainee (or member/senior/lead)                   │
│                                                              │
│  /dashboard → View team onboarding metrics                   │
│    • Total members, completion rates, first PRs merged       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│           NEW HIRE ONBOARDING (WEEK 1-4)                     │
├──────────────────────────────────────────────────────────────┤
│  Week 1: Understanding the Codebase                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ /explore → POST /api/v1/explore/analyze               │  │
│  │   • Clones repo, parses AST, builds dependency graph  │  │
│  │   • Shows: file count, classes, functions, services   │  │
│  │   • Visual: d3-force interactive graph                │  │
│  │   • Architecture pattern detection + circular deps    │  │
│  │                                                       │  │
│  │ /ask → Index repo → natural language Q&A              │  │
│  │   • "Where is the auth logic?" → exact file paths     │  │
│  │   • Streaming answers with source references          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Week 2: Structured Learning                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ /learn → POST /api/v1/learn/path                      │  │
│  │   • Analyze repo → generate 5-8 personalized modules  │  │
│  │   • Each module: files, objectives, time estimate     │  │
│  │   • Levels: junior (4hr/module), mid, senior (2hr)    │  │
│  │   • Fallback: template-based path from 8 modules      │  │
│  │                                                       │  │
│  │ /learn → "Start Learning" → creates tasks             │  │
│  │   • Each module generates onboarding tasks            │  │
│  │   • Tasks appear in /tasks kanban                     │  │
│  │   • Assigned to the trainee automatically             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Week 3: First Contribution                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ /first-issue → POST /api/v1/first-pr/issues           │  │
│  │   • Fetches issues from GitHub                        │  │
│  │   • Scores by complexity (0-10) via LLM + keyword     │  │
│  │   • Filters by level: junior (≤4), mid (3-7), senior │  │
│  │                                                       │  │
│  │ /first-issue → "View Guide" → POST /api/v1/first-pr/ │  │
│  │   guide                                               │  │
│  │   • Step-by-step guide with files_to_touch + steps    │  │
│  │   • Similar PRs for reference                        │  │
│  │                                                       │  │
│  │ /first-issue → "Walkthrough" → /pair/walkthrough     │  │
│  │   • Narrated pair programming transcript              │  │
│  │   • Senior dev thinking aloud the solution            │  │
│  │   • Files to examine, key insights, solution steps    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Week 4: PR → Review → Complete                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ /tasks → Full 10-state workflow                       │  │
│  │   pending → assigned → in_progress → submitted →     │  │
│  │   under_review → approved → completed                 │  │
│  │   (with needs_changes, product_review loops)          │  │
│  │                                                       │  │
│  │ /tasks → submit PR → AI review via TaskQA             │  │
│  │   • Automated scoring against requirements            │  │
│  │   • Returns score, issues, recommendations            │  │
│  │   • Module auto-unlock on completion                  │  │
│  │                                                       │  │
│  │ /my-progress → Trainee dashboard                      │  │
│  │   • Completion %, modules unlocked, recent tasks      │  │
│  │   • Visual progress bar by state                      │  │
│  │                                                       │  │
│  │ /reports → Generate onboarding report (PDF/HTML)      │  │
│  │   • Repository overview, architecture, learning path  │  │
│  │   • Good first issues, FAQ, estimated hours           │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                MANAGER OVERSIGHT (ONGOING)                    │
├──────────────────────────────────────────────────────────────┤
│  /dashboard → CTO dashboard                                 │
│    • Total tasks, completed, in progress, pending review     │
│    • Trainee leaderboard with completion rates               │
│    • Pending reviews + recent activity timeline              │
│    • Actions requiring attention                             │
│                                                              │
│  /notifications → Real-time updates                          │
│    • Task assigned, submitted, approved, completed           │
│    • Module granted, milestone reached                       │
│    • Filter by type, mark read, delete, clear read           │
│                                                              │
│  /team → Module-level access control                         │
│    • Grant/revoke access to codebase modules                 │
│    • Auto-granted on task completion via unlock_modules      │
│    • Audit trail of all grants with source tracking          │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Connect Pages to APIs (Complete ✓)

**Status: All feature pages are wired to their backend APIs via `web/src/lib/api.ts` (114 typed fns).**

Key wiring in place:

| Page | API Call | Status |
|------|----------|--------|
| ExplorePage | `analyzeArchitecture(repoUrl)` → graph + services + metrics | ✅ |
| LearnPage | `analyzeArchitecture()` → `generateLearningPath()` → timeline | ✅ |
| FirstIssuePage | `findIssues(repoUrl, level)` → scored cards + guide/walkthrough modals | ✅ |
| AskPage | `indexRepo()` → `askQuestionStream()` → streaming chat | ✅ |
| ReportsPage | `generateReport()` / `generateHtmlReport()` → sections | ✅ |
| TasksPage | `listTasks()` → kanban + full workflow transitions | ✅ |
| TraineeDashboard | `fetchTraineeDashboard()` → progress + modules + tasks | ✅ |
| DashboardPage + ExecutivePage | `fetchCTODashboard()` → Mission Control / Executive Console | ✅ |
| RampPage | `GET /ramp/*` → health, stuck, cost model, benchmarks | ✅ |
| ReviewQueue | `GET /review-ops/*` → load board + suggestion + consistency | ✅ |
| PlaybooksPage / Marketplace | `listPlaybooks()` / marketplace endpoints | ✅ |
| TeamPage | `listTeams()` / `createTeam()` / `addTeamMember()` / invites | ✅ |
| NotificationsPage | `listNotifications()` → filters, bulk mark read | ✅ |
| Billing / ApiKeys / Admin / HR | Razorpay, `cf_` keys, admin provider keys, HR metrics | ✅ |
| PRDescriptionPage | `POST /pr-review/describe` → PR description | ✅ |

### Remaining Improvements

- [x] Wiring is complete. Focus now on wedge validation (5-team interviews) and polishing skeletons/toasts.

---

## Phase 2: Complete Onboarding Flow (Built; polish + wedge validation remain)

### Step 1: AI Agent Fallbacks

- [x] Template/data-driven fallbacks in `learning_path_generator`, `onboarding_report_generator`, `silent_pair_programming` when LLM unavailable — wired, now covered by router fallback chain + repo index.

### Step 2: Cross-Page Flows

- [x] "Start Learning" on LearnPage → creates tasks in /tasks
- [x] "View Guide" / "Walkthrough" on FirstIssuePage → modals via `/pair/walkthrough` + `/first-pr/guide`
- [x] Task completion → TraineeDashboard refresh + module auto-unlock + notification
- [x] Autopilot `/autopilot/run` → tasks with PR URLs, review queue, merge auto-complete
- [x] WebSocket live updates (`ws_manager` + `useWebSocket`) for task/presence

### Step 3: States & Polish

- [x] 15+ skeleton loaders, error boundaries, empty states (`web/src/components/`)
- [x] Success/error toasts for mutations (ToastContext)
- [ ] Polish: audit skeletons on newer pages (Ramp, Review Ops, HR cohort curves) + Lighthouse ≥90 on landing
- [ ] WebSocket coverage expansion (notifications already, extend to ramp/stuck)

---

## Phase 3: Wedge + Polish (v1.4-v1.6 built; validation next)

### Wedge: Ramp Visibility & Senior-Time Protection (v1.4-v1.6)

| Feature | Status |
|---------|--------|
| Per-trainee ramp profiles + senior-time cost (`/ramp/summary`) | ✅ Built |
| Stuck detectors + deduped alerts (`/ramp/stuck`, `/ramp/check`, Celery 6h) | ✅ Built |
| Org health score + first-PR benchmark (`/ramp/health` + backfill script) | ✅ Built |
| Review Ops: load board + suggestion + consistency (`/review-ops/*`) | ✅ Built |
| Headcount flows + cohort retention curves (`/hr/*`) | ✅ Built |
| Cost-model dials + sensitivity band + ROI/efficiency benchmarks (`/ramp/cost-model`, `/ramp/benchmark`, `/ramp/efficiency-benchmark`) | ✅ Built |
| RampPanel + CohortTrend/Retention/Headcount panels on Mission Control / Executive / HR | ✅ Built |
| **Next: 5-team validation interviews** (`docs/validation-interview-script.md`) | 🔴 Blocking |

### Remaining Polish (shelved until wedge proven)

- [x] Skeletons, toasts, confirmation dialogs, 44+ pages responsive, keyboard shortcuts, WCAG 2.1 AA — done per ROADMAP.md v1.2
- [ ] Final Lighthouse + bundle audit after wedge pages (`npm run build && npx vitest run test/bundle/...`)
- [ ] Backend ruff + frontend eslint in CI (scripts exist, not yet in workflows)

---

## Phase 4: Scale & Deploy

### Testing

```bash
cd backend
python -m pytest tests/ -q            # 700+ backend tests (incl. ramp/review-ops/benchmark)
python -m pytest tests/test_task_service.py --run-postgres  # PG variant
cd web
npm run typecheck                      # tsc --noEmit (strict, clean)
npx vitest run                         # 58+ Vitest + RTL tests
npx playwright test                    # 65+ E2E (auth, dashboard, review-queue, a11y, perf)
cd sdk
npm test                               # 6 SDK tests
```

### Build & Deploy

```bash
# Frontend (Vercel)
cd web
npm run build                          # → dist/
vercel --prod

# Full stack (Docker) — single-command dev
docker compose up -d                   # Frontend :8080 (Nginx) + Backend :8001 + PG :5433 + Redis :6379

# Production
docker compose -f docker-compose.prod.yml up -d

# Render/Railway (blueprint: API + Celery worker + beat + Redis) — see render.yaml
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/backend.yml  (compileall + alembic + pytest w/ PG service)
# .github/workflows/frontend.yml (tsc --noEmit + vitest run + build)
- Run tests (pytest)
- TypeScript typecheck
- Build (Docker/Nginx)
# Planned: ruff + eslint + pip-audit/npm audit, smoke test post-deploy
```
> CI runs tests/typecheck/build. No deploy jobs yet; staging smoke test (`/health` + authed endpoint) before tag.

---

## File Reference

### Backend Core

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app, 8 middleware layers, 42+ routers, `ENV=production` fail-fast |
| `backend/app/llm.py` | Multi-provider LLM router (QueryType + fallback chain, X-LLM-Route headers) |
| `backend/app/embeddings.py` | EmbeddingRouter (pluggable providers) |
| `backend/app/tasks/celery_app.py` | Celery worker + beat (digests, sweeps, repo index, stuck checks) |

### Backend API Routes (42+ modules in `backend/app/api/v1/`)

| File | Endpoints |
|------|-----------|
| `autopilot.py` | `POST /autopilot/analyze`, `POST /autopilot/run` (full repo→PRs pipeline) |
| `explore.py` | `POST /explore/analyze` (graph) |
| `learn.py` | `POST /learn/path` |
| `first_pr.py` | `POST /first-pr/issues`, `POST /first-pr/guide` |
| `ask.py` | `POST /ask/index`, `POST /ask/query`, `POST /ask/query/stream` (SSE) |
| `repo_index.py` + `repositories.py` | `POST /repos/index`, `GET /repos/index/{id}/context` (cached, webhook-evicted) |
| `reports.py` | `POST /reports/generate`, `POST /reports/generate-html` |
| `tasks.py` | Full task CRUD + state machine (pending→completed), dependencies, WebSocket |
| `dashboard.py` | CTO + trainee dashboards, team analytics |
| `ramp.py` | `/ramp/summary`, `/ramp/stuck`, `/ramp/check`, `/ramp/health`, `/ramp/cost-model`, `/ramp/benchmark`, `/ramp/efficiency-benchmark` |
| `review_ops.py` | `/review-ops/load`, `/review-ops/suggest`, `/review-ops/consistency` |
| `hr_dashboard.py` | `/hr/cohort-retention/{team}`, `/hr/headcount-flow/{team}` |
| `teams.py` | Team CRUD, members, module permissions |
| `playbooks.py` + `marketplace.py` | Playbook CRUD + marketplace |
| `notifications.py` | Notifications CRUD, preferences (14 event types) |
| `pr_review.py` | `POST /pr-review/review`, `POST /pr-review/describe` |
| `ai_gateway.py` + `openai_gateway.py` | API keys (`cf_`), usage, quotas, `/v1/*` OpenAI-compatible gateway |
| `billing.py` | Razorpay subscriptions (INR), checkout, webhooks, top-up |
| `auth.py` + `accounts.py` + `admin.py` | JWT register/login/refresh, OAuth Google/GitHub, profile, admin provider keys |
| `audit.py` + `ops.py` | Audit logs, `/health` `/ready` `/metrics` |
| `webhook_handler.py` | GitHub webhook HMAC, PR-merge auto-complete |
| `slack.py` + `integrations.py` + `ws.py` | Slack digest/slash, webhooks, WebSocket |
| `unique.py` | Pair walkthrough, pattern recognition, test checklist |
| `health.py` / `dora.py` / `gamification.py` / `quiz.py` / `wiki.py` | Health score, DORA, XP/badges, quizzes, AI wiki |
| *(+ 10 more)* | See `backend/app/api/v1/` |

### Backend AI Agents (16 + base)

| File | Agent |
|------|-------|
| `architecture_explorer.py` | Full repo analysis pipeline |
| `learning_path_generator.py` | Personalized learning path |
| `first_pr_accelerator.py` | Issue finder + guide generator |
| `repo_qa.py` | Repo indexing + Q&A |
| `silent_pair_programming.py` | Pair programming walkthrough |
| `onboarding_report_generator.py` | Onboarding report (PDF/HTML) |
| `regression_test_generator.py` | Test checklist from diff |
| `pattern_recognition.py` | Find similar patterns |
| `task_qa.py` | Task completion review |
| `health_scorer.py` | Repo health score |
| `pr_review.py` | PR code review |
| `quiz_generator.py` | Module quizzes |
| `issue_resolution_agent.py` | Failure → resolution steps |
| `coding_agent.py` | Autonomous coding (PR creation) |
| `drift_detector.py` | Architecture drift detection |
| `codebase_trailer.py` | Repo trailer generation |

### Frontend Pages (58+ components, 44+ routes)

| File | Route |
|------|-------|
| `ExplorePage.tsx` | `/explore` |
| `LearnPage.tsx` | `/learn` |
| `FirstIssuePage.tsx` | `/first-issue` |
| `AskPage.tsx` | `/ask` |
| `OnboardingReportPage.tsx` | `/reports` |
| `TasksPage.tsx` | `/tasks` |
| `TraineeDashboard.tsx` | `/my-progress` |
| `DashboardPage.tsx` | `/dashboard` |
| `ExecutivePage.tsx` | `/executive` |
| `RampPage.tsx` | `/ramp` |
| `ReviewQueuePage.tsx` | `/reviews` |
| `HrDashboardPage.tsx` + `HrPeoplePage.tsx` | `/hr` + `/hr/people` |
| `PlaybooksPage.tsx` + `MarketplacePage.tsx` | `/playbooks` + `/marketplace` |
| `TeamPage.tsx` | `/team` |
| `NotificationsPage.tsx` | `/notifications` |
| `PRDescriptionPage.tsx` | `/pr-describe` |
| `WikiPage.tsx` | `/wiki` |
| `WhyOnrampPage.tsx` | `/why-onramp` (cost-at-scale calculator) |
| *(+ 30 more)* | `web/src/pages/` + `web/src/App.tsx` |

### Frontend API Client

| File | Purpose |
|------|---------|
| `web/src/lib/api.ts` | 114 typed fetch functions |
| `web/src/lib/types.ts` | TypeScript interfaces for all data types |

### Infrastructure

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Dev stack: backend + Redis + PostgreSQL (8080/8001/5433/6379) |
| `docker-compose.prod.yml` | Production: + Nginx (no grafana/prometheus — `/metrics` via backend) |
| `Dockerfile` | Backend Docker build (hardened, non-root) |
| `render.yaml` | Render blueprint (API + worker + beat + Redis) |
| `.github/workflows/backend.yml` + `frontend.yml` | CI (compile + alembic + pytest; tsc + vitest + build) |

---

## Quick Start

```bash
# Backend (requires Python 3.12+, PostgreSQL 16, Redis)
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, PII_ENCRYPTION_KEY, API_KEY_HMAC_SECRET, one LLM key
python -m alembic upgrade head
uvicorn app.main:app --port 8000 --reload

# Frontend
cd web
npm install
cp .env.example .env   # VITE_API_URL default http://localhost:8000/api/v1
npm run dev

# Seed demo data (from repo root or backend/)
python scripts/seed_dev_user.py

# Tests
cd backend
python -m pytest tests/ -q
cd ../web
npm run typecheck && npx vitest run && npx playwright test

# Open
# Frontend: http://localhost:5173
# API: http://localhost:8000
# Docs: http://localhost:8000/docs  (dev/staging only)
```
