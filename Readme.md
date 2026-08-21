# Onramp 2.0

**AI-powered developer onboarding & team acceleration platform.**

Onramp turns any GitHub repository into a live onboarding program. It analyzes
a codebase with a multi-provider AI model router, generates learning paths,
issues, tasks, PRs, and senior reviews automatically, and gives engineering
leadership real-time visibility into team health — all free-first and
token-efficient.

[![Backend CI](https://github.com/KunjShah95/onramp/actions/workflows/backend.yml/badge.svg)](https://github.com/KunjShah95/onramp/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/KunjShah95/onramp/actions/workflows/frontend.yml/badge.svg)](https://github.com/KunjShah95/onramp/actions/workflows/frontend.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Why Onramp

New developers typically spend weeks reading docs, guessing at architecture,
and waiting for reviewers. Onramp replaces that with a system that:

1. **Parses your repo once** into a dependency graph and context index.
2. **Routes every AI call to the cheapest capable provider** — free tiers
   first, paid fallbacks only when needed.
3. **Generates real work** — issues, tasks, learning paths, quizzes, and PRs —
   from that graph, assigned by role and balanced by workload.
4. **Closes the loop** — tasks auto-advance on PR open/merge, issues auto-close,
   and senior reviews land in a review queue.

---

## Features

### Repo Autopilot — repo URL → issues → tasks → PRs → review

The flagship pipeline. Feed it **any GitHub repository** (or a local checkout)
and it runs a full 9-step loop, turning results into real work inside Onramp:

1. **Ingest** — shallow clone (or `git pull` refresh) + update detection that
   reports exactly which files changed since the last run.
2. **Graph** — AST parse (`ParserService`, Python `ast` + tree-sitter, 20+
   languages) + dependency graph (`build_dependency_graph`) → `entities.json`
   / `graph.json`.
3. **Entity graph** — second-pass relationship extraction: class / function /
   API-route nodes with **calls / inheritance / contains / serves** edges →
   `relationships.json`.
4. **Visualize** — standalone `visualization.html` (D3 force-directed graph
   with file + entity modes).
5. **Query** — model-routed AI analysis via `LLMRouter` (reasoning →
   structured), with per-call provider/free attribution recorded.
6. **Issues** — AI-found issues (or real GitHub issues), classified by
   difficulty and **assigned by role**: easy → intern, medium → junior dev,
   hard → senior dev.
7. **Tasks** — each issue becomes a **real Onramp task**, auto-assigned to a
   team member holding the matching role (see *Load-aware assignment* below).
8. **Solve** — `AutonomousCodingAgent` opens one GitHub PR per issue;
   role-based labels (`good-first-issue` / `good-second-issue` /
   `senior-review`) are created and applied automatically.
9. **Validate + Review** — fetches each PR head, re-parses + re-graphs it,
   graph-diffs against the base (broken edges, new cycles), AI-verifies
   resolution + regressions, retries unresolved issues (bounded), and emits a
   structured `SENIOR_REVIEW.md` per issue (root cause, files affected,
   changes, validation, risks, tests).

**Load-aware assignment.** Assignment weights each member's *current workload*:
the member with the fewest active (non-terminal) tasks gets the next issue,
with the round-robin cycle as tie-breaker. Overloaded members are skipped until
their queue drains. The cycle is seeded from the team's task history, so
consecutive runs keep balancing.

**The state machine runs itself.** When the pipeline opens a PR, the linked
task auto-advances `pending → assigned → in_progress → submitted` with the PR
URL attached, landing in the senior-review queue. When the PR **merges**, the
task is auto-approved + completed and — if seeded from a real GitHub issue —
the **originating issue is auto-closed** with a comment linking the merged PR.

**Three surfaces, one pipeline:**

```bash
# 1. CLI — analyze + visualize + find issues
python scripts/repo_autopilot.py --repo https://github.com/owner/repo

#    Full pipeline: solve → validate → senior review (needs GITHUB_TOKEN)
python scripts/repo_autopilot.py --repo https://github.com/owner/repo \
    --solve --max-issues 5 --github-token ghp_...

#    Also ingest open GitHub issues as work items
python scripts/repo_autopilot.py --repo https://github.com/owner/repo \
    --github-issues 10 --solve

#    Local checkout + refresh mode (re-run detects updates, rebuilds graph)
python scripts/repo_autopilot.py --repo ../some/repo --out ./out
```

```bash
# 2. In-app API (authenticated, quota-metered)
curl -X POST http://localhost:8000/api/v1/autopilot/analyze \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/owner/repo", "max_issues": 5}'

#    Full pipeline: analyze → solve → PRs → validate → senior review
curl -X POST http://localhost:8000/api/v1/autopilot/run \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/owner/repo", "max_issues": 5, "max_solve": 3, "max_retry": 1}'
```

1. **Dashboard panel** — Mission Control → *Autopilot · Repo Pipeline*: paste a
   repo URL, click **Run Pipeline**, and created tasks appear instantly (title,
   state badge, role chip, priority) with links into the Tasks console.

CLI output lands in `autopilot_out/<owner-repo>/` — `entities.json`,
`graph.json`, `relationships.json`, `visualization.html`, `report.json`,
`REVIEW.md`, `SENIOR_REVIEW.md`. Task creation is idempotent (re-runs skip
already-imported issues, matched by GitHub issue number or title + repo) and
can be disabled with `"create_tasks": false`.

### AI Model Routing

Every agent declares a `query_type` class attribute. The router
(`backend/app/llm.py`) uses it to pick the best provider chain per task —
free-first, with a fallback chain per type:

| Query type | First providers tried | Cost |
| --- | --- | --- |
| `code` | Anthropic → DeepSeek → OpenAI → Qwen → Gemini → Groq → OpenRouter → NVIDIA → Ollama | paid first, free fallback |
| `reasoning` | DeepSeek → Gemini → OpenAI → Anthropic → Qwen → Groq → OpenRouter → NVIDIA → Ollama | cheap first |
| `structured` | Groq → Gemini → OpenRouter → OpenAI → NVIDIA → Anthropic → Ollama | free-first, JSON-optimized |
| `summarization` | Groq → Gemini → OpenRouter → NVIDIA → OpenAI → Anthropic → Ollama | free-first |
| `translation` | Gemini → Qwen → Zhipu → Groq → OpenRouter → NVIDIA → OpenAI → Anthropic → Ollama | free-first, multilingual |
| `creative` | Anthropic → OpenAI → Gemini → Groq → OpenRouter → NVIDIA → Ollama | paid first, best prose |
| `chat` | default free-first chain: OpenRouter → Gemini → Groq → NVIDIA → Mistral → HuggingFace → OpenAI → Anthropic → Ollama | free-first |

**How the chain is built:** each query type lists preferred providers first,
and remaining configured providers are appended afterwards, so a single
provider outage falls through the whole chain. Providers without an API key are
skipped. Every served request reports its actual provider via the
`X-LLM-Route` response header and records free-vs-paid attribution + dollar
savings in the usage logs.

**Override per call.** An agent's `query_type` is a *default* — pass
`query_type=` explicitly to any LLM call and it wins:

```python
from app.llm import QueryType

await agent.llm.chat(prompt)                              # agent's default type
await agent.llm.json_chat(prompt, query_type=QueryType.STRUCTURED)

from app.llm import LLMRouter
router = LLMRouter()
await router.chat("explain why the sky is blue", query_type="reasoning")
await router.chat_stream("summarize this", query_type=QueryType.SUMMARIZATION)
```

### Token-Saving Pipeline

Beyond free-first routing, three more layers keep LLM cost low:

1. **Repo context index — parse once, reuse everywhere, pre-built on a
   schedule.** `POST /repos/index` clones + parses a repo **once** (24h Redis
   TTL) into a compact JSON context document (entities + dependency graph +
   stats) keyed by a stable `index_id` derived from `repo_url@branch`.
   Re-posting returns the cached document; `DELETE` re-indexes. Indexes are
   **pre-built so the first request never waits**: `"async_build": true`
   dispatches a Celery task and returns `202` immediately, a nightly beat task
   rebuilds every registered index nearing expiry, and a GitHub `push`
   webhook evicts + rebuilds instantly. Each index carries an **`evolution`
   block** (last 50 commits, top contributors, per-file ownership) computed
   deterministically from `git log`, never via the LLM.

2. **Requirement-driven context selection.**
   `GET /repos/index/{index_id}/context?requirement=...&max_tokens=4000` scores
   files against the task and returns only the relevant slice, so agents never
   receive the whole repository. All LLM-backed agents accept `index_id` in
   place of a full `repo_structure` body.

3. **Redis LLM response cache (exact + semantic).** Repeated prompts (same
   query type + normalized prompt + system + max_tokens) are served from Redis
   instead of a provider (`app/services/llm_cache.py`, TTL 1h). Exact hits
   report as `cache/redis`, near-duplicates (hashed n-gram cosine similarity ≥
   `LLM_SEMANTIC_THRESHOLD` with content-word subset check) as `cache/semantic`
   — both `free=true`, **$0**. The gateway reports `X-LLM-Cache` and
   `X-LLM-Cache-Tier` headers. Streaming responses are not cached.

4. **Token budgets.** Every selected context slice is trimmed to `max_tokens`
   (~4 chars/token, `app/services/llm_costs.estimate_tokens`) before being
   embedded in a prompt — long files dropped first, then truncated.

### Onboarding & Learning

- **Trainee Dashboard** — track progress, unlocked modules, streak, XP
- **Gamification** — XP points, leveling, badges, streaks, leaderboards
- **Module-Level Access** — grant/revoke module access per user per team
- **Onboarding Reports** — auto-generated HTML/Markdown docs for any repo
- **Onboarding Plans** — 30-60-90 day structured plans with milestones and pulse check-ins
- **Learning Paths** — persisted milestones with completion tracking
- **Onboarding Hub** — central portal for new developers with guided paths
- **Quiz Generator** — module-level quizzes with auto-grading
- **Wiki** — AI-generated onboarding wikis from any repo URL
- **Playbooks** — reusable onboarding playbook templates with tagging

### Task Management

- Full task lifecycle: create → assign → start → submit → review → approve → complete
- State-machine enforced transitions with timestamps + review-cycle tracking
- Task dependency DAG (`depends_on`) + optional module-quiz gates on start
- Peer review (reviewer ≠ assignee) plus senior review and product sign-off
- Auto-links PRs to tasks via GitHub issue `source_issue` matching
- Review queue with status badges (under_review, needs_changes, approved, product_review)
- Time tracking (estimated vs actual, overrun alerts), team/user progress, bulk assign

### CTO / Leadership Dashboard

- Task distribution & completion rate charts, per-member progress bars
- Pending reviews & recent activity timeline, action items
- Activity trend analysis (7-day velocity)
- **Ramp · Senior-Time** — senior cost + stuck-dev telemetry, first-PR benchmarks
- **Autopilot · Repo Pipeline** — run the repo pipeline from the dashboard
- Executive dashboard for CEO/CTO role, senior space, HR dashboard

### Production Observability & Ops

- **Prometheus `/metrics`** — dependency-free text-format registry: HTTP
  request totals/latency/in-flight, LLM calls by provider & free/paid, LLM
  cache hits (redis/semantic) & misses, embedding calls, WebSocket connections
- **Structured JSON logging** — `LOG_FORMAT=json` emits one JSON object per
  line (Loki / Datadog / CloudWatch ready)
- **Request correlation IDs** — `X-Request-ID` echoed in responses and logs
- **Liveness & readiness probes** — `GET /health` (process up) and `GET /ready`
  (DB + Redis reachable, 503 when a dependency is down)
- **Security headers** — HSTS (prod), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy; opt-in CSP
- **OpenAPI security scheme** — BearerAuth declared so `/docs` has an Authorize
  button and typed clients can be generated

### PWA

- Web app manifest + installable icons (any + maskable)
- Service worker: app-shell precache, network-first navigations with offline
  fallback, cache-first hashed assets, network-only API calls
- Registered only in production builds (dev keeps Vite HMR intact)

### TypeScript SDK (`@onramp/sdk`)

- Typed client for the OpenAI-compatible gateway: chat, streaming chat,
  embeddings, model listing
- AIaaS agent execution, API-key validation/creation, usage + tiers
- Zero runtime dependencies; works in Node 18+ and browsers
- `sdk/` package — build with `npm run build`, test with `npm test`

### Enterprise-Grade Security

- **Neon Auth (Better Auth)** — JWT validation against Neon's JWKS endpoint,
  session-based auth with silent token refresh
- JWT-based auth (HS256, rotating refresh tokens), bcrypt password hashing
- Fernet field-level encryption for PII + stored provider/GitHub tokens
- RBAC with 9 roles (junior_dev, developer, senior_dev, tester, cto, ceo, admin, member, hr)
- OAuth2 social login (Google, GitHub) with CSRF state tokens + account linking
- Password reset flow with short-lived JWT reset tokens
- Alembic database migrations (28 versions)
- CORS allowlist + Vercel regex, production env validation on boot
- GitHub webhook HMAC-SHA256 signature verification

### Billing & API Gateway

- Razorpay subscription management (free / pro / enterprise, INR)
- API key management with usage tracking, credit limits, expiry
- OpenAI-compatible `/v1` gateway (chat, streaming, embeddings, models)
- Rate limiting (Redis-backed) + usage quotas with endpoint-level breakdown
- Per-team provider keys (BYOK) stored encrypted, with multi-key round-robin

### Notifications & Integrations

- In-app notification center (read/unread, preferences, quiet hours, digest)
- 14 notification event types with distinct icons and colors
- Notification bell with real-time badge count and dropdown preview
- Mark all read, pagination, type-filtered views
- Webhooks (create, test, rotate secrets, delivery logs)
- GitHub integration (token validation, scope checking, PR-merge auto-complete)
- Slack integration (channel config, event-driven standups)
- Email via SendGrid (digest, alerts)

---

## Tech Stack

### Backend

| Component | Technology |
| ----------- | ----------- |
| **Framework** | Python 3.12+ (3.13 local), FastAPI |
| **Database** | PostgreSQL 16 (asyncpg, SQLAlchemy 2.0, pgvector) |
| **Migrations** | Alembic |
| **Cache / Broker** | Redis (rate limiting, LLM cache, Celery broker) |
| **Async tasks** | Celery (worker + beat: digests, sweeps, repo indexes) |
| **Observability** | Prometheus + Grafana (dependency-free `/metrics`) |
| **AI** | OpenRouter, Gemini, Groq, NVIDIA (free) + DeepSeek, Qwen, Zhipu, Moonshot, Mistral, OpenAI, Anthropic, HuggingFace, Ollama (paid/local) |
| **Auth** | Neon Auth (Better Auth) + custom JWT (bcrypt + Fernet encryption) |
| **Billing** | Razorpay (INR) |
| **Monitoring** | Sentry |
| **Email** | SendGrid |

### Frontend

| Component | Technology |
| ----------- | ----------- |
| **Framework** | React 19, TypeScript (strict mode) |
| **Build** | Vite 6 |
| **Styling** | Tailwind CSS |
| **Animation** | Framer Motion, GSAP |
| **Charts** | Recharts |
| **HTTP** | fetch (custom wrapper with silent token refresh) |
| **State** | TanStack React Query |
| **Icons** | Phosphor Icons |
| **3D / Viz** | Babylon.js, D3 (force/zoom/drag) |
| **Editing** | Monaco Editor |
| **Testing** | Vitest, React Testing Library, Playwright (incl. a11y + Lighthouse) |

### Infrastructure

| Component | Technology |
| ----------- | ----------- |
| **Backend Hosting** | Render (blueprint: API + Celery workers + Redis) or Railway |
| **Frontend Hosting** | Vercel |
| **Containerization** | Docker Compose (hardened: non-root, healthchecks) |
| **Reverse Proxy** | Nginx (non-root, port 8080) |
| **Orchestration** | Kubernetes manifests (`kubernetes/`) |
| **Monitoring** | Prometheus + Grafana (docker-compose.prod.yml) |
| **CI/CD** | GitHub Actions |

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis (optional, for rate limiting / LLM cache)

### 1. Clone & Install

```bash
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

Navigate to [http://localhost:5173](http://localhost:5173) and register a new
account, or sign in with a [seeded account](#seeded-test-accounts).

---

## Docker Quick Start (One Command)

Start the **full stack** (PostgreSQL + Redis + Backend API + Frontend UI) with
one command:

```bash
# 1. Copy the environment template (edit if needed)
cp .env.example .env

# 2. Set at least one AI provider API key in .env (GEMINI_API_KEY, OPENROUTER_API_KEY, etc.)

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
| **Prometheus** | <http://localhost:9090> | Metrics (prod compose only) |
| **Grafana** | <http://localhost:3000> | Dashboards (admin/admin by default, prod compose only) |
| **Backend API** | <http://localhost:8001> | FastAPI backend |
| **API Docs** | <http://localhost:8001/docs> | Swagger UI (interactive) |
| **PostgreSQL** | localhost:5433 | Database (user: `onramp`, pass: `postgres_password`, db: `onramp`) |
| **Redis** | localhost:6379 | Cache (pass: `redis_password`) |

> **Note:** Host port 5433 is used instead of 5432, and 8001 instead of 8000, to
> avoid conflicts with locally-running PostgreSQL and backend dev servers. All
> internal Docker networking is unaffected (services communicate via Docker DNS).

### Required Configuration

The app needs at least one AI provider API key to function. Get a free one:

- **[Google Gemini](https://aistudio.google.com/apikey)** — Free tier
- **[OpenRouter](https://openrouter.ai/)** — Free tier

Set the key in your `.env` file:

```bash
GEMINI_API_KEY=your-key-here
```

### Frontend API URL

The frontend is pre-built as a static site served by Nginx on port 80. It uses
a **relative API URL** (`/api/v1`) by default, so API calls go through Nginx's
proxy (`/api/*` → `backend:8000`) on the same origin — no CORS issues.

To use an absolute URL instead:

```bash
VITE_API_URL=http://localhost:8000/api/v1 docker compose up -d
```

---

## Load & Performance Testing

Three layers cover responsiveness, load, and full-scale load:

**1. Backend — k6 (HTTP-level, extensive load)**

`k6-load-test.js` runs five scenarios: smoke, load (ramp to 50 VUs), stress
(ramp to 200 VUs), spike (150 VUs instantly), soak (40 VUs for 10 min).

```bash
k6 run k6-load-test.js -e BASE_URL=https://staging.onramp.dev/api/v1
k6 run k6-load-test.js -e BASE_URL=https://staging.onramp.dev/api/v1 -e SCENARIO=stress
```

**2. Backend — pytest (in-process, CI-runnable)**

```bash
cd backend && python -m pytest tests/test_load_performance.py -v --timeout=120
```

Covers per-endpoint latency, average latency, 10-way concurrency, 100-request
stress, 25-way high concurrency, sustained bursts, and throughput stability.

**3. Frontend — bundle, CWV, and concurrent-load checks**

```bash
cd web
npm run build && npx vitest run test/bundle/bundle-analysis.test.ts   # JS/CSS size budgets
npx playwright test e2e/performance/load.spec.ts --project=chromium   # 8 concurrent visitors
npx playwright test e2e/performance/lighthouse.test.ts --project=chromium --workers=1
node scripts/cwv-audit.mjs          # throttled-mobile FCP/LCP/CLS against the dev server
node scripts/mobile-audit.mjs       # horizontal-overflow sweep of every route at 3 viewports
```

---

## Deploying to Render (API + Celery Workers + Redis)

The backend runs on Render as three services sharing one Redis (Key Value)
instance. A [`render.yaml`](./render.yaml) blueprint defines the whole stack.

### Blueprint (recommended)

1. Dashboard → **New → Blueprint** → connect this repo (pick the branch that
   contains `render.yaml`).
2. Render creates: `onramp-redis` (Key Value), `onramp-api` (web service), and
   `onramp-worker` + `onramp-beat` (background workers).
3. During creation you're prompted for the `sync: false` secrets.

| Resource | Render type | What it runs |
| --- | --- | --- |
| `onramp-redis` | Key Value (Redis) | Celery broker + result store — auto-wired as `REDIS_URL` |
| `onramp-api` | Web service | `alembic upgrade head` + uvicorn (production Dockerfile stage), health check `/health` |
| `onramp-worker` | Background worker | `celery -A app.tasks.celery_app worker -Q agent-tasks,analytics-tasks,notification-tasks,default` |
| `onramp-beat` | Background worker | `celery -A app.tasks.celery_app beat` (digests, nightly sweeps, repo indexes) |

> **Why background workers?** A Web Service must bind a port and passes a
> deploy-time port scan. A Celery process binds none — creating it as a Web
> Service times out the deploy with *"No open ports detected… create a
> background worker instead"*.

Secrets prompted on first apply (`sync: false`): `DATABASE_URL`, `JWT_SECRET`,
`PII_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `API_KEY_HMAC_SECRET`,
`CORS_ALLOWED_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`, plus optional
LLM/OAuth/billing keys. All services share them via the `onramp-shared`
environment group.

### Manual dashboard setup (no blueprint)

1. **New → Redis** → copy the **Internal URL** (`rediss://default:…@…:6379`).
2. **New → Web Service** → root dir `backend`, Dockerfile target `production`,
   health check path `/health`.
3. **New → Background Worker** → start command:

   ```bash
   celery -A app.tasks.celery_app worker -l info -Q agent-tasks,analytics-tasks,notification-tasks,default
   ```

4. Repeat for the scheduler:

   ```bash
   celery -A app.tasks.celery_app beat -l info
   ```

5. Set the **same env vars on every service** — use an Environment Group.

---

## Seeded Test Accounts

Run the seed script to populate the database with realistic sample data across
all 39 tables:

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

> **Tip:** Log in as **Kunj Shah** (`kunj@onramp.dev` / `demo123`) to see the
> CTO/Executive dashboard, or as **Emma Wilson** (`emma@onramp.dev` /
> `demo123`) for the trainee view.

> You can also register a new account at
> [http://localhost:5173/register](http://localhost:5173/register) or use OAuth
> (Google/GitHub) if configured.

---

## Contributing

### Prerequisites

- Python 3.12+, Node.js 20+, PostgreSQL 16
- Familiarity with FastAPI, SQLAlchemy 2.0 async, React, and Tailwind CSS

### Running Tests

```bash
# Backend tests (240+ test files covering services, APIs, and DB migrations;
# dual storage backends: InMemoryStorage + PostgresStorage)
cd backend
python -m pytest tests/ -q                          # All tests (memory backend)
python -m pytest tests/test_task_service.py          # Single test file
python -m pytest tests/ -k "not billing_e2e" -q     # Exclude slow E2E tests
python -m pytest tests/ -x --tb=short                # Stop on first failure

# Backend tests with PostgreSQL (requires running PG)
python -m pytest tests/test_task_service.py --run-postgres

# Frontend tests
cd web
npx vitest run                                       # Unit tests
npx tsc --noEmit                                     # TypeScript check (strict mode)
npx playwright test                                  # E2E tests (auth, dashboard, review-queue, a11y)
```

### Seeding Sample Data

```bash
cd backend
python ../scripts/seed_dev_user.py                   # Full seed (90+ records)
python ../scripts/seed_dev_user.py --quick            # Minimal: users + teams only
python ../scripts/seed_dev_user.py --dry-run           # Preview without writing
python ../scripts/seed_dev_user.py --force             # Re-create existing data
```

### Data Migration (Legacy JSONB → Real Tables)

```bash
cd backend
python ../scripts/migrate_dynamic_to_tables.py              # Full migrate
python ../scripts/migrate_dynamic_to_tables.py --dry-run     # Preview only
```

### Code Style

- **Backend:** Follow PEP 8, use type hints everywhere, async-first patterns
- **Frontend:** Strict TypeScript mode, functional components with hooks
- **Imports:** Standard library → third-party → local (separated by blank line)
- **Tests:** Write parametrized tests that run against both `InMemoryStorage`
  and `PostgresStorage` when possible

### Git Workflow

```bash
git checkout -b feat/my-feature
git commit -m "feat: add cohort onboarding endpoint"   # conventional commits
git push origin feat/my-feature
```

### Docker Development

```bash
docker compose up -d                                   # Start full stack
docker compose exec backend python /app/scripts/seed_dev_user.py   # Seed
docker compose exec backend python -m pytest tests/ -q # Tests in container
docker compose logs -f backend                         # Backend logs
```

---

## Roadmap

### What's next

- Real-time WebSocket notifications everywhere
- Local AI model support (Ollama) as a first-class routing tier
- PR review auto-apply suggestions
- GitLab & Bitbucket integration
- Community playbook marketplace
- Mobile-responsive views for key pages

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  Vite → Tailwind → AuthContext → react-query → API  │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (JSON/SSE)
                   ▼
┌─────────────────────────────────────────────────────┐
│         API Gateway (FastAPI + Nginx)                │
│  CORS → SecurityHeaders → Metrics → Logging →        │
│  ResponseWrapper → RateLimit → Auth                  │
├─────────────────────────────────────────────────────┤
│  ▸ Auth         ▸ Tasks         ▸ Teams             │
│  ▸ AI Agents    ▸ Dashboard     ▸ Notifications     │
│  ▸ Billing      ▸ Admin         ▸ Integrations      │
│  ▸ Gamification ▸ Reports       ▸ Quiz              │
│  ▸ Autopilot    ▸ Explore       ▸ Review Ops        │
└──────────────────┬──────────────────────────────────┘
                   │ asyncpg / Redis / Celery
                   ▼
┌─────────────────────────────────────────────────────┐
│           PostgreSQL 16 + Redis + Celery             │
│  Users / Teams / Tasks / API Keys / Gamification     │
└─────────────────────────────────────────────────────┘
```

The backend uses a **layered middleware** stack: CORS, SecurityHeaders,
Metrics, Logging, ResponseWrapper (unified `{success, data}` envelope),
RateLimit (Redis-backed), BodySizeLimit, and Auth (JWT verification + API key
acceptance with a public-path allowlist), plus Brotli/GZip compression.

---

## Project Structure

```text
onramp/
├── backend/
│   ├── app/
│   │   ├── agents/          # 17 AI agents (HealthScorer, IssueResolutionAgent, …)
│   │   ├── api/v1/          # 43 route modules (auth, tasks, autopilot, explore, …)
│   │   ├── database/        # SQLAlchemy models (36), config
│   │   ├── middleware/      # Auth, RateLimit, Logging, ResponseWrapper, Metrics, …
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic (autopilot, github, task, ramp, …)
│   │   ├── tasks/           # Celery tasks + beat schedule
│   │   └── slack_bot/       # Slack integration
│   ├── alembic/             # Database migrations (28 versions)
│   ├── tests/               # 240+ pytest test files (dual memory+postgres storage)
│   └── scripts/             # Dev utilities (e2e flows, secrets)
├── web/
│   ├── src/
│   │   ├── components/      # Reusable UI (Sidebar, ConsolePanel, dashboard panels)
│   │   ├── context/         # AuthContext, ThemeContext, ToastContext
│   │   ├── lib/             # API client, utils, types
│   │   ├── pages/           # 68 page components (role-gated)
│   │   └── test/            # Vitest tests
│   ├── e2e/                 # Playwright tests (auth, dashboard, review, a11y, perf)
│   └── public/
├── sdk/                     # TypeScript SDK (@onramp/sdk)
├── scripts/                 # Repo-level scripts (repo_autopilot.py, seed_dev_user.py, …)
├── docs/                    # API, architecture, routing, deployment guides
├── kubernetes/              # K8s manifests (optional)
├── docker-compose.yml       # Local dev environment
├── docker-compose.prod.yml  # Production (Prometheus + Grafana)
├── render.yaml              # Render blueprint (API + workers + Redis)
└── nginx.conf               # Reverse proxy config
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| ---------- | ---------- | ------------- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (generate with `secrets.token_urlsafe(32)`) |
| `API_KEY_HMAC_SECRET` | ✅ | HMAC secret for hashing API keys |
| `PII_ENCRYPTION_KEY` | ✅ | Fernet key for field-level PII encryption |
| `GEMINI_API_KEY` | ⬜ | Google Gemini key (or set via Admin Console) |
| `OPENROUTER_API_KEY` | ⬜ | OpenRouter key (or set via Admin Console) |
| `GROQ_API_KEY` | ⬜ | Groq key (fast structured output, free tier) |
| `NVIDIA_API_KEY` | ⬜ | NVIDIA NIM key |
| `ANTHROPIC_API_KEY` | ⬜ | Claude key (code agents) |
| `OPENAI_API_KEY` | ⬜ | OpenAI key |
| `DEEPSEEK_API_KEY` / `QWEN_API_KEY` / `ZHIPU_API_KEY` / `MOONSHOT_API_KEY` | ⬜ | Cheap OpenAI-compatible providers (DeepSeek, Alibaba, Zhipu, Moonshot) |
| `MISTRAL_API_KEY` / `HUGGINGFACE_API_KEY` | ⬜ | Additional OpenAI-compatible fallbacks |
| `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` / `PERPLEXITY_API_KEY` | ⬜ | More OpenAI-compatible vendors (Together, Fireworks, Perplexity) |
| `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` | ⬜ | Azure OpenAI (requires endpoint) |
| `CUSTOM_OPENAI_API_KEY` + `CUSTOM_OPENAI_BASE_URL` (+ `CUSTOM_OPENAI_MODEL`) | ⬜ | Generic OpenAI-compatible endpoint — any provider (Anyscale, self-hosted, etc.) |
| `OLLAMA_BASE_URL` (+ `OLLAMA_MODEL`, `OLLAMA_API_KEY`) | ⬜ | Local Ollama endpoint (no API key) |
| `GITHUB_TOKEN` | ⬜ | GitHub PAT — PR solving, labels, auto-close issues |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | ⬜ | Fernet key for stored GitHub tokens |
| `GITHUB_WEBHOOK_SECRET` | ⬜ | HMAC secret for GitHub webhooks |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | ⬜ | Razorpay billing (INR) |
| `RAZORPAY_PLAN_*` | ⬜ | Razorpay plan IDs per tier |
| `SENDGRID_API_KEY` | ⬜ | Transactional email |
| `REDIS_URL` | ⬜ | Distributed rate limiting + LLM cache + Celery broker |
| `SENTRY_DSN` | ⬜ | Error monitoring |
| `LOG_FORMAT` / `LOG_LEVEL` | ⬜ | JSON logging / verbosity |
| `LLM_CACHE_TTL` | ⬜ | Redis LLM cache TTL (default 1h) |
| `LLM_SEMANTIC_CACHE` / `LLM_SEMANTIC_THRESHOLD` | ⬜ | Semantic cache tuning |
| `ENABLE_API_DOCS` | ⬜ | Expose `/docs` in production |

### Frontend (`web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ⬜ | API base URL (default: `http://localhost:8000/api/v1`) |

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributors

- Kunj Shah (@KunjShah95)
- Varad Vekariya (@varadvekariya6)

---

*Built with ❤️ for developers who want to ship faster.*
