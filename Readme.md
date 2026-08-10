# Onramp 2.0

**AI-powered developer onboarding & team acceleration platform.**

Onramp helps engineering teams onboard new developers faster, automate code reviews, track skill progression, and give leadership visibility into team health — all powered by multi-provider AI agents.

[![Backend CI](https://github.com/KunjShah95/onramp/actions/workflows/backend.yml/badge.svg)](https://github.com/KunjShah95/onramp/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/KunjShah95/onramp/actions/workflows/frontend.yml/badge.svg)](https://github.com/KunjShah95/onramp/actions/workflows/frontend.yml)

---

## ✨ Features

### 🧠 AI-Powered Developer Tools

| Tool | Description |

| -----
 | ------------- |
| **Architecture Explorer** | Visualize repo structure as an interactive force-directed graph |
| **First PR Accelerator** | Find beginner-friendly issues with step-by-step contribution guides |
| **Learning Path Generator** | Generate personalized learning paths from any codebase |
| **Repo Q&A** | Chat with your codebase via streaming SSE responses |
| **PR Description Generator** | Auto-generate PR titles, descriptions, and changelogs |
| **Code Health Scorer** | Analyze repos for complexity, maintainability, test coverage |
| **Pattern Recognition** | Find similar code patterns across repos |
| **Silent Pair Programming** | AI-guided walkthroughs for solving issues |
| **Quiz Generator** | Module-level quizzes with multiple formats |
| **Regression Test Generator** | Generate test checklists from PR diffs |

### 🧠 AI Model Routing (Query Types)

Every agent declares what kind of prompt it produces via a `query_type` class
attribute. The router (`backend/app/llm.py`) uses that to pick the best
provider chain per task — free-first, with a fallback chain per type:

| Agent | Query type | First provider tried | Cost |
| --- | --- | --- | --- |
| `PRReviewAgent` | `code` | Claude (Anthropic) | paid |
| `FirstPRAccelerator` | `code` | Claude (Anthropic) | paid |
| `AutonomousCodingAgent` | `code` | Claude (Anthropic) | paid |
| `SilentPairProgramming` | `code` | Claude (Anthropic) | paid |
| `TaskQA` | `code` | Claude (Anthropic) | paid |
| `RegressionTestGenerator` | `code` | Claude (Anthropic) | paid |
| `ArchitectureExplorer` | `reasoning` | Gemini | free |
| `PatternRecognition` | `reasoning` | Gemini | free |
| `LearningPathGenerator` | `reasoning` | Gemini | free |
| `DriftDetector` | `reasoning` | Gemini | free |
| `RepoQA` | `reasoning` | Gemini | free |
| `HealthScorer` | `structured` | Groq | free |
| `QuizGenerator` | `structured` | Groq | free |
| `CodebaseTrailer` | `creative` | Claude (Anthropic) | paid |

> `OnboardingReportGenerator` is a pure rule-based agent — it makes no LLM
> calls and declares no query type.

**How the chain is built:** each query type lists preferred providers first,
and the remaining configured providers are appended afterwards, so any single
provider outage falls through the whole chain. Providers without an API key
are skipped. The seven types are `chat`, `code`, `reasoning`, `structured`,
`summarization`, `translation`, and `creative` (`chat` uses the default
free-first chain: OpenRouter → Gemini → Groq → NVIDIA → Mistral →
HuggingFace → OpenAI → Anthropic → Ollama).

**Override per call.** An agent's `query_type` is a *default*, not a law —
pass `query_type=` explicitly to any LLM call and it wins:

```python
from app.llm import QueryType

# Default: PRReviewAgent routes via CODE (Claude first, paid)
await agent.llm.chat(prompt)

# Single-call override — force cheap, JSON-optimized structured output
await agent.llm.json_chat(prompt, query_type=QueryType.STRUCTURED)

# The underlying router is directly usable too (string values accepted):
from app.llm import LLMRouter
router = LLMRouter()
await router.chat("explain why the sky is blue", query_type="reasoning")
await router.chat_stream("summarize this", query_type=QueryType.SUMMARIZATION)
```

> **Trade-off:** `json_chat` on the `code` agents (FirstPR, SilentPair,
> Autonomous, RegressionTest) routes via CODE (Claude first, paid) because
the agent declares its content type. If JSON reliability matters more than
model strength, pass `query_type=QueryType.STRUCTURED` (Groq first, free) as
shown above.

Every served request also reports its actual provider via the `X-LLM-Route`
response header and records free-vs-paid attribution + dollar savings in the
usage logs — see `docs/API.md` (Provider Route Breakdown).

### 💰 Token-Saving Pipeline (parse-once + cache + budgets)

Beyond free-first routing, three more layers keep LLM cost low:

**1. Repo context index — parse once, reuse everywhere, pre-built on a
schedule.** `POST /repos/index` clones + parses a repo **once** (24h Redis
TTL) into a compact JSON context document (entities + dependency graph +
stats) keyed by a stable `index_id` derived from `repo_url@branch`.
Re-posting returns the cached document with zero cloning/parsing; `DELETE`
re-indexes. `POST /explore/analyze` accepts the `index_id` to skip its own
clone/parse. (Redis optional — in-process fallback in dev.) Indexes are
**pre-built so the first request never waits**: `POST /repos/index` with
`"async_build": true` dispatches a Celery `build_repo_index` task and
returns `202` + task id immediately, and the `refresh_repo_indexes` beat
task runs nightly (03:00 UTC) to rebuild every registered repo whose index
is missing, older than `REPO_INDEX_MAX_AGE_HOURS` (20h), or within
`REPO_INDEX_COLD_WINDOW_HOURS` (2h) of the 24h TTL expiring — warm before
the 24h TTL expires. **Pushes invalidate + rebuild instantly**: a GitHub
`push` webhook (`POST /webhooks/github`) for a registered repo evicts its
LLM cache scope (`evict_scope` — both cache tiers) and dispatches
`build_repo_index` so the next question about that repo sees fresh code.
Each index also carries an **`evolution` block** (git-history layer): the
last 50 commits, top contributors, per-file ownership (changes + strongest
author) and the head commit's changed files — computed deterministically
from `git log`, never via the LLM.

**2. Requirement-driven context selection.**
`GET /repos/index/{index_id}/context?requirement=...&max_tokens=4000` scores
files against the task and returns only the relevant slice, so agents never
receive the whole repository. Each agent already declares its `query_type`
(above); now it also pulls just the context it is bound to. All LLM-backed
agents (health, learn, quiz, drift, patterns, explore) accept `index_id` in
place of a full `repo_structure` body: whole-repo scoring uses the cached
entities, while every LLM prompt embeds a token-budgeted requirement slice.

**3. Redis LLM response cache (exact + semantic).** Repeated prompts (same
query type + normalized prompt + system + max_tokens) are served from Redis
instead of a provider — keyed via `app/services/llm_cache.py`, TTL 1h
(`LLM_CACHE_TTL`). Cache hits are attributed as a `cache/redis` route with
`free=true` and **$0 price**, so they show up in the cost-savings dashboard
as requests that avoided the full baseline cost. On top of exact matching,
**near-duplicate questions also hit**: prompts are embedded locally (hashed
n-grams — no embedding API, so probing stays free) and a stored answer is
served only when cosine similarity ≥ `LLM_SEMANTIC_THRESHOLD` (0.85) AND
the new question's content words are a subset of the stored prompt's — the
subset gate blocks one-word rewrites (`sort`→`reverse`) that raw similarity
can't tell apart. Semantic hits report as `cache/semantic` (free, $0). The
`/v1` gateway reports `X-LLM-Cache: HIT/MISS` plus `X-LLM-Cache-Tier`
(`redis`/`semantic`/`MISS`). Streaming responses are not cached. Disable or
retune via `LLM_SEMANTIC_CACHE=0`, `LLM_SEMANTIC_THRESHOLD`,
`LLM_SEMANTIC_BUCKET_CAP`.

**4. Token budgets.** Every selected context slice is trimmed to
`max_tokens` (~4 chars/token, `app/services/llm_costs.estimate_tokens`)
before being embedded in a prompt; long files are dropped first, then
truncated, so prompts stay small.

### 👥 Onboarding & Learning

- **Trainee Dashboard** — Track progress, unlocked modules, streak, XP
- **Gamification** — XP points, leveling, badges, streaks, leaderboards
- **Module-Level Access** — Grant/revoke module access per user per team
- **Onboarding Reports** — Auto-generated HTML/Markdown docs for any repo
- **Onboarding Plans** — 30-60-90 day structured plans with milestones and pulse check-ins
- **Learning Paths** — Persisted milestones with completion tracking
- **Onboarding Hub** — Central portal for new developers with guided paths
- **Quiz Generator** — Module-level quizzes with auto-grading
- **Wiki** — AI-generated onboarding wikis from any repo URL
- **Playbooks** — Reusable onboarding playbook templates with tagging

### 📋 Task Management

- Full task lifecycle: create → assign → start → submit → review → approve → complete
- AI-assisted code review with inline issue detection
- Review queue with status badges (under_review, needs_changes, approved, product_review)
- Direct approve / route-to-product from submitted state
- Product sign-off gate with structured feedback
- Dedicated review queue page with filtering and bulk actions

### 📊 CTO / Leadership Dashboard

- Task distribution & completion rate charts
- Per-member progress with completion bars
- Pending reviews & recent activity timeline
- Action items requiring attention
- Activity trend analysis (7-day velocity)
- Executive dashboard for CEO/CTO role
- Senior developer space for team leads
- HR dashboard for team health metrics

### 📈 Production Observability & Ops

- **Prometheus `/metrics`** — dependency-free text-format registry with 10 metric
  families: HTTP request totals/latency/in-flight, LLM calls by provider &
  free/paid, LLM cache hits (redis/semantic) & misses, embedding calls,
  WebSocket connections. Scrape with Prometheus + Grafana (docker-compose.prod.yml).
- **Structured JSON logging** — `LOG_FORMAT=json` emits one JSON object per line
  (Loki / Datadog / CloudWatch ready). `LOG_LEVEL` controls verbosity.
- **Request correlation IDs** — every request gets an `X-Request-ID` echoed in
  the response and logged, so failures trace end-to-end.
- **Liveness & readiness probes** — `GET /health` (process up) and `GET /ready`
  (DB + Redis reachable, returns 503 when a dependency is down) for K8s/Docker
  orchestrators.
- **Security headers** — HSTS (prod), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy; opt-in CSP via
  `CSP_HEADER`.
- **OpenAPI security scheme** — BearerAuth declared so `/docs` has an Authorize
  button and typed clients can be generated.

### 📱 PWA

- Web app manifest + installable icons (any + maskable)
- Service worker: app-shell precache, network-first navigations with offline
  fallback, cache-first hashed assets, network-only API calls
- Registered only in production builds (dev keeps Vite HMR intact)

### 📦 TypeScript SDK (`@onramp/sdk`)

- Typed client for the OpenAI-compatible gateway: chat, streaming chat, embeddings,
  model listing
- AIaaS agent execution, API-key validation/creation, usage + tiers
- Zero runtime dependencies; works in Node 18+ and browsers
- `sdk/` package — build with `npm run build`, test with `npm test`

### 🔐 Enterprise-Grade Security

- JWT-based auth (HS256, 7-day expiry)
- bcrypt password hashing
- Fernet field-level encryption for PII
- RBAC with 9 roles (new_dev, developer, senior_dev, tester, cto, ceo, owner, member, hr)
- OAuth2 social login (Google, GitHub) with CSRF state tokens
- Password reset flow with short-lived JWT reset tokens
- Alembic database migrations (8 versions)
- CORS allowlist + Vercel regex
- Production env validation on boot

### 💳 Billing & API Gateway

- Razorpay subscription management (free / pro / enterprise)
- API key management with usage tracking
- Rate limiting (200 req/min, Redis-backed)
- Usage quotas with endpoint-level breakdown

### 🔔 Notifications & Integrations

- In-app notification center (read/unread, preferences, quiet hours, digest)
- 14 notification event types with distinct icons and colors
- Notification bell with real-time badge count and dropdown preview
- Mark all read, pagination, type-filtered views
- Webhooks (create, test, rotate secrets, delivery logs)
- GitHub integration (token validation, scope checking)
- Slack integration (channel config, event-driven)
- Email via SendGrid (digest, alerts)

---

## 🏗 Tech Stack

### Backend

| Component | Technology |
| ----------- | ----------- |
| **Framework** | Python 3.12, FastAPI |
| **Database** | PostgreSQL 16 (asyncpg, SQLAlchemy 2.0) |
| **Migrations** | Alembic |
| **Cache** | Redis (distributed rate limiting, caching) |
| **Observability** | Prometheus + Grafana (dependency-free /metrics) |
| **AI** | Multi-provider: OpenRouter, Gemini, Groq, OpenAI, Anthropic |
| **Auth** | Custom JWT (bcrypt + Fernet encryption) |
| **Billing** | Razorpay (INR) |
| **Monitoring** | Sentry |
| **Email** | SendGrid |

### Frontend

| Component | Technology |
| ----------- | ----------- |
| **Framework** | React 19, TypeScript (strict mode) |
| **Build** | Vite 6 |
| **Styling** | Tailwind CSS 3 |
| **Animation** | Framer Motion |
| **Charts** | Recharts |
| **HTTP** | fetch (custom wrapper with auto-auth) |
| **State** | TanStack React Query |
| **Icons** | Phosphor Icons |
| **Testing** | Vitest, React Testing Library, Playwright |

### Infrastructure

| Component | Technology |
| ----------- | ----------- |
| **Backend Hosting** | Railway |
| **Frontend Hosting** | Vercel |
| **Containerization** | Docker Compose (hardened: non-root, healthchecks) |
| **Reverse Proxy** | Nginx (non-root, port 8080) |
| **Monitoring** | Prometheus + Grafana (docker-compose.prod.yml) |
| **CI/CD** | GitHub Actions |

---

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis (optional, for rate limiting)

### 1. Clone & Install

```bash
# Clone the repo
git clone https://github.com/KunjShah95/onramp.git
cd onramp

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../web
npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, JWT_SECRET, and at least one AI provider key

# Frontend
cp web/.env.example web/.env
# Edit web/.env — set VITE_API_URL (default: http://localhost:8000/api/v1)
```

### 3. Run Database Migrations

```bash
cd backend
.venv/Scripts/python -m alembic upgrade head
```

### 4. Start the Servers

```bash
# Terminal 1 — Backend
cd backend
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend
cd web
npm run dev
```

### 5. Open the App

Navigate to [http://localhost:5173](http://localhost:5173) and register a new account.

---

## 🐳 Docker Quick Start (One Command)

Start the **full stack** (PostgreSQL + Redis + Backend API + Frontend UI) with one command:

```bash
# 1. Copy the environment template (edit if needed)
cp .env.example .env

# 2. Set at least one AI provider API key in .env (GEMINI_API_KEY, OPENROUTER_API_KEY, etc.)
#    Open .env with a text editor and fill in your key(s).

# 3. Start all services
docker compose up -d

# 4. View logs
docker compose logs -f

# 5. Open the app
#    Frontend: http://localhost:8080
#    Backend API: http://localhost:8001
#    API Docs: http://localhost:8001/docs

# 6. Stop all services
docker compose down
```

> **Note:** The first build will take a few minutes (installing Python & Node.js dependencies).

### Docker Service Ports

| Service | URL | Description |
| --------- | ----- | ------------- |
| **Frontend** | <http://localhost:8080> | React app (Nginx, proxies `/api` → backend) |
| **Frontend (dev)** | <http://localhost:5173> | React app (Vite dev server, `npm run dev`) |
| **Prometheus** | <http://localhost:9090> | Metrics (scrapes backend `/metrics`, prod compose only) |
| **Grafana** | <http://localhost:3000> | Dashboards (admin/admin by default, prod compose only) |
| **Backend API** | <http://localhost:8001> | FastAPI backend |
| **API Docs** | <http://localhost:8001/docs> | Swagger UI (interactive) |
| **PostgreSQL** | localhost:5433 | Database (user: `onramp`, pass: `postgres_password`, db: `onramp`) |
| **Redis** | localhost:6379 | Cache (pass: `redis_password`) |

> **Note:** Host port 5433 is used instead of 5432, and 8001 instead of 8000, to avoid conflicts with locally-running PostgreSQL and backend dev servers. All internal Docker networking is unaffected (services communicate via Docker DNS internally).

### Docker Database Commands

```bash
# Connect to PostgreSQL (via Docker's internal port 5432)
docker compose exec postgres psql -U onramp -d onramp

# Or connect from host (via mapped port 5433):
psql -h localhost -p 5433 -U onramp -d onramp

# View logs
docker compose logs postgres

# Reset database (removes volumes, recreates fresh)
docker compose down -v && docker compose up -d
```

### Required Configuration

The app needs at least one AI provider API key to function. Get a free one:

- **[Google Gemini](https://aistudio.google.com/apikey)** — Free tier
- **[OpenRouter](https://openrouter.ai/)** — Free tier

Set the key in your `.env` file:

```bash
GEMINI_API_KEY=your-key-here
```

### Frontend API URL

The frontend is pre-built as a static site served by Nginx on port 80. It uses a **relative API URL** (`/api/v1`) by default, so API calls go through Nginx's proxy (`/api/*` → `backend:8000`) on the same origin — no CORS issues.

To use an absolute URL instead:

```bash
VITE_API_URL=http://localhost:8000/api/v1 docker compose up -d
```

or set `VITE_API_URL` in your `.env` file.

---

## 🚀 Deploying to Render (API + Celery Workers + Redis)

The backend runs on Render as three services sharing one Redis (Key Value) instance. A [`render.yaml`](./render.yaml) blueprint defines the whole stack — the recommended way to set it up or reproduce it.

### Blueprint (recommended)

1. Dashboard → **New → Blueprint** → connect this repo (pick the branch that contains `render.yaml`).
2. Render creates: `onramp-redis` (Key Value), `onramp-api` (web service), and `onramp-worker` + `onramp-beat` (background workers).
3. During creation you're prompted for the `sync: false` secrets — fill them with the same values the API service already uses.

> **Apply order:** the blueprint links services to `main`, and the API image depends on the `backend/Dockerfile` stage reorder (production = default target). Apply it only after this change is on `main` — otherwise the API service builds a worker image and its `/health` check fails.

| Resource | Render type | What it runs |
|---|---|---|
| `onramp-redis` | Key Value (Redis) | Celery broker + result store — auto-wired as `REDIS_URL` |
| `onramp-api` | Web service | `alembic upgrade head` + uvicorn (`production` Dockerfile stage), health check `/health` |
| `onramp-worker` | Background worker | `celery -A app.tasks.celery_app worker -Q agent-tasks,analytics-tasks,notification-tasks,default` |
| `onramp-beat` | Background worker | `celery -A app.tasks.celery_app beat` (digests, nightly sweeps, repo indexes) |

> **Why background workers?** A Web Service must bind a port and passes a deploy-time port scan. A Celery process binds none — creating it as a Web Service times out the deploy with *"No open ports detected… create a background worker instead"*. Background workers are liveness-monitored only (no port, no health check).

Secrets prompted on first apply (`sync: false`): `DATABASE_URL`, `JWT_SECRET`, `PII_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `API_KEY_HMAC_SECRET`, `CORS_ALLOWED_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`, plus optional LLM/OAuth/billing keys (Gemini/OpenRouter/Groq, GitHub/Google OAuth, Razorpay, SendGrid, Sentry). All services share them via the `onramp-shared` environment group.

Notes:

- **Redis**: the free Key Value plan has no persistence — bump `plan` in `render.yaml` for durability. `ipAllowList: []` keeps it private-network only; Render services connect over the internal network.
- **Deploys**: services auto-deploy on commits to `main`. Once the blueprint is live, the CD workflow's `RENDER_DEPLOY_HOOK_URL` secret is redundant.
- **Migrations** run automatically on API deploys (`alembic upgrade head` in the Dockerfile CMD).

### Manual dashboard setup (no blueprint)

1. **New → Redis** → wait for *Available* → copy the **Internal URL** (`rediss://default:…@…:6379`).
2. **New → Web Service** → root dir `backend`, Dockerfile target `production`, health check path `/health`. Add `REDIS_URL` plus the secrets above.
3. **New → Background Worker** → root dir `backend`, start command:

   ```bash
   celery -A app.tasks.celery_app worker -l info -Q agent-tasks,analytics-tasks,notification-tasks,default
   ```

4. Repeat for the scheduler (**Background Worker**):

   ```bash
   celery -A app.tasks.celery_app beat -l info
   ```

5. Set the **same env vars on every service** — env vars are per-service on Render unless you use an Environment Group.

---

## 🔑 Seeded Test Accounts

Run the seed script to populate the database with realistic sample data across all 39 tables:

```bash
cd backend
python ../scripts/seed_dev_user.py
```

All accounts share the same password: **`demo123`**

| Name | Email | Role | Team |
| ------ | ------- | ------ | ------ |
| **Kunj Shah** | `kunj@onramp.dev` | Owner (admin) | InnovateHub |
| **Varad Karandikar** | `varad@onramp.dev` | CTO (admin) | InnovateHub |
| **Sarah Chen** | `sarah@onramp.dev` | Senior Dev | InnovateHub / Platform Eng |
| **Marcus Johnson** | `marcus@onramp.dev` | Senior Dev | InnovateHub |
| **Alisha Patel** | `alisha@onramp.dev` | Developer | InnovateHub |
| **David Kim** | `david@onramp.dev` | Developer | InnovateHub / Platform Eng |
| **Emma Wilson** | `emma@onramp.dev` | New Dev | InnovateHub |
| **James Thompson** | `james@onramp.dev` | New Dev | InnovateHub / Platform Eng |
| **Priya Sharma** | `priya@onramp.dev` | Tester | InnovateHub |

> **Tip:** Log in as **Kunj Shah** (`kunj@onramp.dev` / `demo123`) to see the CTO/Executive dashboard, or as **Emma Wilson** (`emma@onramp.dev` / `demo123`) for the trainee view.

> You can also register a new account at [http://localhost:5173/register](http://localhost:5173/register) or use OAuth (Google/GitHub) if configured.

---

## 🤝 Contributing

### 📋 Prerequisites

- Python 3.12+, Node.js 20+, PostgreSQL 16
- Familiarity with FastAPI, SQLAlchemy 2.0 async, React, and Tailwind CSS

### 🧪 Running Tests

```bash
# Backend tests (177+ tests covering services, APIs, and DB migrations; dual storage backends)
cd backend
python -m pytest tests/ -q                          # All tests (memory backend)
python -m pytest tests/test_task_service.py          # Single test file
python -m pytest tests/ -k "not billing_e2e" -q     # Exclude slow E2E tests
python -m pytest tests/ -x --tb=short                # Stop on first failure

# Backend tests with PostgreSQL (requires running PG)
python -m pytest tests/test_task_service.py --run-postgres
python -m pytest tests/test_gamification.py --run-postgres

# Frontend tests
cd web
npx vitest run                                       # Unit tests (49+ tests)
npx tsc --noEmit                                     # TypeScript check (strict mode, zero errors)
npx playwright test                                   # E2E tests (auth, dashboard, review-queue)
```

### 🗄 Seeding Sample Data

The seed script populates all **39 database tables** with realistic demo data:

```bash
cd backend
python ../scripts/seed_dev_user.py                   # Full seed (90+ records)
python ../scripts/seed_dev_user.py --quick            # Minimal: users + teams only
python ../scripts/seed_dev_user.py --dry-run           # Preview without writing
python ../scripts/seed_dev_user.py --force             # Re-create existing data
```

> See [🔑 Seeded Test Accounts](#-seeded-test-accounts) below for the full list of users.

### 📦 Data Migration (Legacy JSONB → Real Tables)

If you have existing data in the legacy `dynamic_documents` JSONB table from before migration 008:

```bash
cd backend
python ../scripts/migrate_dynamic_to_tables.py              # Full migrate
python ../scripts/migrate_dynamic_to_tables.py --dry-run     # Preview only
python ../scripts/migrate_dynamic_to_tables.py --collection onramp_tasks  # Single collection
```

### 📝 Code Style

- **Backend:** Follow PEP 8, use type hints everywhere, async-first patterns
- **Frontend:** Strict TypeScript mode, functional components with hooks
- **Imports:** Sort standard library → third-party → local (separated by blank line)
- **Tests:** Write parametrized tests that run against both `InMemoryStorage` and `PostgresStorage` when possible

### 🔄 Git Workflow

```bash
# Create a feature branch
git checkout -b feat/my-feature

# Make changes and commit
# Use conventional commits: feat:, fix:, chore:, docs:, test:, refactor:
git commit -m "feat: add cohort onboarding endpoint"

# Push and open a PR
git push origin feat/my-feature
```

### 🐳 Docker Development

```bash
# Start full stack with Docker
docker compose up -d

# Run seed inside the container
docker compose exec backend python /app/scripts/seed_dev_user.py

# Run tests inside the container
docker compose exec backend python -m pytest tests/ -q

# View backend logs
docker compose logs -f backend
```

---

## 🗺 Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full product roadmap and upcoming milestones.

### What's next (v1.2)

- Real-time WebSocket notifications
- Local AI model support (Ollama)
- Milestone tracking with roadmap view
- PR review auto-apply suggestions
- GitLab & Bitbucket integration
- Community playbook marketplace
- Mobile-responsive views for key pages

---

## 🏛 Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  Vite → Tailwind → AuthContext → react-query → API  │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (JSON/SSE)
                   ▼
┌─────────────────────────────────────────────────────┐
│         API Gateway (FastAPI + Nginx)                │
│  AuthMiddleware → RateLimit → ResponseWrapper        │
├─────────────────────────────────────────────────────┤
│  ▸ Auth         ▸ Tasks         ▸ Teams             │
│  ▸ AI Agents    ▸ Dashboard     ▸ Notifications     │
│  ▸ Billing      ▸ Admin         ▸ Integrations      │
│  ▸ Gamification ▸ Reports       ▸ Quiz              │
└──────────────────┬──────────────────────────────────┘
                   │ asyncpg / Redis
                   ▼
┌─────────────────────────────────────────────────────┐
│           PostgreSQL 16 + Redis                      │
│  Users / Teams / Tasks / API Keys / Gamification     │
└─────────────────────────────────────────────────────┘
```

The backend uses a **layered middleware** approach:

1. `CORSMiddleware` (outermost)
2. `LoggingMiddleware` (request/response logging)
3. `ResponseWrapperMiddleware` (unified `{success, data}` envelope)
4. `RateLimitMiddleware` (200 req/min per IP)
5. `AuthMiddleware` (JWT verification, public path allowlist)

---

## 📁 Project Structure

```text
onramp/
├── backend/
│   ├── app/
│   │   ├── agents/          # 10 AI agents (HealthScorer, etc.)
│   │   ├── api/v1/          # 25+ route modules
│   │   ├── database/        # SQLAlchemy models, config
│   │   ├── middleware/       # Auth, RateLimit, Logging, ResponseWrapper
│   │   └── services/        # Business logic (billing, github, etc.)
│   ├── alembic/             # Database migrations (8 versions)
│   ├── tests/               # 177+ pytest tests (dual memory+postgres storage)
│   └── scripts/             # Dev utilities
├── web/
│   ├── src/
│   │   ├── components/      # Reusable UI (Sidebar, Cards, etc.)
│   │   ├── context/         # AuthContext, ThemeContext, ToastContext
│   │   ├── lib/             # API client, utils, types
│   │   ├── pages/           # 44 page components (role-gated with 15+ skeleton variants)
│   │   ├── hooks/           # Custom hooks
│   │   └── test/            # 49 Vitest tests
│   ├── e2e/                 # Playwright tests
│   └── public/
├── kubernetes/              # K8s manifests (optional)
├── docker-compose.yml       # Local dev environment
└── nginx.conf               # Reverse proxy config
```

---

## 🔐 Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| ---------- | ---------- | ------------- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (generate with `secrets.token_urlsafe(32)`) |
| `ENV` | ✅ | `development` or `production` |
| `OPENROUTER_API_KEY` | ⬜ | Provider keys can be set here **or** via the Admin Console → *Provider Keys · Platform* (encrypted in the DB — no .env edit needed); at least one key is required per provider |
| `GEMINI_API_KEY` | ⬜ | Google Gemini key (or set via Admin Console) |
| `MISTRAL_API_KEY` | ⚠️ | Mistral models (OpenAI-compatible) |
| `HUGGINGFACE_API_KEY` | ⚠️ | HuggingFace router (OpenAI-compatible) |
| `RAZORPAY_KEY_ID` | ⬜ | Razorpay billing key (INR) |
| `RAZORPAY_KEY_SECRET` | ⬜ | Razorpay billing secret |
| `RAZORPAY_WEBHOOK_SECRET` | ⬜ | Razorpay webhook signature verification |
| `RAZORPAY_PLAN_STARTUP` / `RAZORPAY_PLAN_PROFESSIONAL` / `RAZORPAY_PLAN_USAGE_BASED` | ⬜ | Razorpay plan IDs per tier |
| `SENDGRID_API_KEY` | ⬜ | Transactional email |
| `REDIS_URL` | ⬜ | For distributed rate limiting |
| `SENTRY_DSN` | ⬜ | Error monitoring |

### Frontend (`web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ⬜ | API base URL (default: `http://localhost:8000/api/v1`) |

---

## 📜 License

MIT

---

## 👥 Contributors

- Kunj Shah (@KunjShah95)
- Varad Vekariya (@varadvekariya6)

---

*Built with ❤️ for developers who want to ship faster.*
