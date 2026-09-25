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

### OpenRouter Model Benchmark (Sept 2026)

Real tasks from this repo (T1: per-key `daily_credit_cap` enforcement, T2:
Playwright CI wiring, T3: audit/cache regression tests) were solved by
`junior1@foundation.dev` via three OpenRouter models and scored on latency,
output size, and cost. Method: same prompt per task (root cause + patch with
file refs + test, ≤400 words), `max_tokens=1000`, `temperature=0.2`.

| Task | Model | Result | Latency | Chars | Cost |
| ------ | ------- | -------- | --------- | ------- | ------ |
| T1 daily cap | `deepseek/deepseek-chat-v3.1` | OK | 7.48s | 1613 | $0.000783 |
| T1 daily cap | `openai/gpt-4o-mini` | OK | 7.54s | 2602 | $0.000367 |
| T1 daily cap | `openai/gpt-oss-20b` | OK | 13.86s | 3280 | $0.000094 |
| T2 CI specs | `deepseek/deepseek-chat-v3.1` | OK | 5.82s | 1343 | $0.000668 |
| T2 CI specs | `openai/gpt-4o-mini` | OK | 5.33s | 2485 | $0.000378 |
| T2 CI specs | `openai/gpt-oss-20b` | OK | 8.04s | 1067 | $0.000145 |
| T3 regression | `deepseek/deepseek-chat-v3.1` | OK | 15.16s | 1489 | $0.000417 |
| T3 regression | `openai/gpt-4o-mini` | OK | 7.47s | 2479 | $0.000352 |
| T3 regression | `openai/gpt-oss-20b` | OK | 8.62s | 2351 | $0.000094 |

**Totals (3 tasks):** 9/9 OK. `gpt-oss-20b` cheapest ($0.00033 total, ~5.6×
cheaper than DeepSeek $0.00187); `gpt-4o-mini` fastest (6.78s avg) and most
verbose (~2522 chars avg). All three fixes shipped as PRs #15–#17 with
51 passing tests across the touched suites.

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

### Responsive, Compat & SEO

- Mobile-first layouts (320px → desktop): responsive type scales, stacked grids,
  horizontal-scroll table primitive, `100dvh` fallbacks, 44px tap targets
  (`.hit-slop`), `overflow-x: clip` guards against decorative overflows
- Per-route SEO snapshots: `npm run build` runs `web/scripts/seo-assets.mjs`,
  baking title/description/canonical/OG tags into `dist/seo/*.html` for all
  public routes (20 pages incl. blog) + rewriting `sitemap.xml`/`robots.txt`
  to the canonical host — served via explicit Vercel rewrites
- Security + cache headers in `web/vercel.json` (nosniff, DENY framing,
  immutable `/assets/*` caching)
- Audit scripts: `web/scripts/mobile-audit.mjs` (overflow sweep),
  `cwv-audit.mjs` (throttled-mobile CWV), `audit-a11y.mjs`,
  `audit-responsive.mjs`, `audit-orphans.mjs`

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
- Alembic database migrations (30+ versions)
- CORS allowlist + Vercel regex, production env validation on boot
- GitHub webhook HMAC-SHA256 signature verification

### Billing & API Gateway

- Razorpay subscription management (free / pro / enterprise, INR)
- API key management with usage tracking, per-key credit budgets, expiry + rotation
- Tier rate limits with **daily request caps** (free 100/day → enterprise 100k/day)
- Cost / Balanced / Intelligence routing-mode dial per team (gateway + in-app chat)
- OpenAI-compatible `/v1` gateway (chat, streaming, embeddings, models)
- Rate limiting (Redis-backed) + usage quotas with endpoint-level breakdown
- Per-team provider keys (BYOK) stored Fernet-encrypted, with multi-key round-robin pools

### Notifications & Integrations

- In-app notification center (read/unread, preferences, quiet hours, digest)
- 14 notification event types with distinct icons and colors
- Notification bell with real-time badge count and dropdown preview
- Mark all read, pagination, type-filtered views
- Webhooks (create, test, rotate secrets, delivery logs)
- GitHub integration (token validation, scope checking, PR-merge auto-complete)
- Slack integration (channel config, event-driven standups)
- Email via SendGrid (digest, alerts)

### n8n Workflow Automation (Two-Way)

**Self-hosted n8n** for faculty-grade automation between Onramp and external tools (Telegram, Slack, Email, HTTP, custom APIs).

#### Outbound: Onramp → n8n

Onramp events fan out to configured n8n Webhook URLs with HMAC-signed payloads:

| Event Category | Events |
| ---------------- | -------- |
| **Onboarding** | `onboarding.plan_created`, `.plan_updated`, `.plan_generated`, `.milestone_completed`, `.preboarding_completed`, `.pulse_submitted` |
| **Task Lifecycle** | `task.assigned`, `.started`, `.submitted`, `.reviewed`, `.approved`, `.completed`, `.needs_changes`, `.cancelled` |
| **Ramp & PR** | `ramp.stuck`, `pr.merged` |
| **Test** | `test.ping` |

**Config priority:** Per-user integration → Per-team integration → Env vars (`N8N_WEBHOOK_URL`, `N8N_ONBOARDING_WEBHOOK_URL`)

#### Inbound: n8n → Onramp

n8n workflows call `POST /api/v1/webhooks/n8n` with `X-N8N-Signature` header (HMAC-SHA256 of raw body using `N8N_INBOUND_SECRET`).

Supported actions:

- `create_task` — seed tasks nightly or on external triggers
- `log_event` — audit log from n8n workflows

#### Pre-built Workflows (Import via n8n UI: ⋯ → Import from File)

| Workflow | File | Purpose |
|----------|------|---------|
| **Complete Automation Bus** | `n8n/workflows/onramp-complete-bus.json` | Routes all Onramp events → Telegram/Slack with severity-based formatting |
| **Nightly Task Seeding** | `n8n/workflows/onramp-inbound-task-seeding.json` | Cron (8am daily) → creates tasks in Onramp via signed webhook |

#### Local Development

```bash
# Start n8n with Docker Compose profile
docker compose --profile n8n up -d

# n8n UI: http://localhost:5678
# Webhook base (from backend): http://n8n:5678/webhook/...
# Webhook base (from host): http://localhost:5678/webhook/...
```

> **Runbook for this device** (daily start commands, verified one-time setup, smoke test,
> and Git Bash / n8n CLI gotchas): [`docs/n8n-local-setup.md`](./docs/n8n-local-setup.md)

#### Production Deployment (Render)

Add n8n as a 4th service in `render.yaml` with persistent disk for `/home/node/.n8n` (see `render.yaml` and `Dockerfile.n8n`; deployment steps in `RENDER_DEPLOYMENT.md` and [`n8n/workflows/README.md`](./n8n/workflows/README.md)).

---

### Razorpay Billing (INR Subscriptions + Credit Wallet)

**Production-ready** Razorpay integration with subscription lifecycle, webhook handling, and prepaid credit top-ups.

#### Features

- **Tiered Subscriptions**: Free / Startup (₹999/mo) / Professional (₹2999/mo) / Usage-Based (₹499/mo)
- **Monthly & Annual Billing** with Razorpay Plans
- **Credit Wallet**: Prepaid top-ups via Razorpay Orders + Checkout.js
- **Webhook-Driven**: Idempotent, signature-verified handling of 10+ event types
- **GST-Compliant Invoices** generated automatically by Razorpay

#### Subscription Flow

```
User selects tier → POST /billing/checkout → Razorpay Checkout → Payment
    → Webhook: subscription.activated → Local subscription created (active)
    → Webhook: subscription.charged (renewals) → Period extended
    → Webhook: subscription.cancelled → Status → canceled
```

#### Credit Wallet Flow

```
User enters amount → POST /billing/credits/order → Razorpay Order created
    → Checkout.js modal opens → Payment
    → POST /billing/credits/order/verify → Signature verified
    → Webhook: payment.captured → Credits credited to wallet (idempotent)
```

#### Webhook Events Handled

| Event | Action |
| ------- | -------- |
| `subscription.activated` | Create/activate local subscription, link Razorpay IDs |
| `subscription.charged` | Extend period, update tier if changed |
| `subscription.cancelled/completed/pending/halted/paused/resumed` | Sync status via `SUBSCRIPTION_STATUS_MAP` |
| `payment.captured` (topup) | Credit wallet, record in ledger |
| `payment.failed` | Log for audit |

#### Idempotency & Safety

- **Event-level deduplication** via `onramp_webhook_idempotency` collection (PK on event ID)
- **HMAC-SHA256 verification** (primary) + Razorpay SDK verification (fallback)
- **Amount validation** on credit top-ups (payment amount vs stored order amount)
- **Fail-closed** in production when `RAZORPAY_WEBHOOK_SECRET` missing

#### Required Environment Variables

```bash
# Razorpay credentials (test: rzp_test_... | live: rzp_live_...)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx

# Plan IDs (create in Razorpay Dashboard → Products → Plans)
RAZORPAY_PLAN_STARTUP=plan_xxxxxxxxxxxxx
RAZORPAY_PLAN_PROFESSIONAL=plan_xxxxxxxxxxxxx
RAZORPAY_PLAN_USAGE_BASED=plan_xxxxxxxxxxxxx

# Webhook secret (generate: openssl rand -base64 32)
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Dev only: allow unverified webhooks
ALLOW_UNVERIFIED_RAZORPAY=true
```

#### Webhook Configuration

**Razorpay Dashboard → Settings → Webhooks → Add Webhook**

- **URL**: `https://your-api.onrender.com/api/v1/billing/webhook`
- **Events**: Select all `subscription.*`, `payment.*`, `order.*`
- **Secret**: Same as `RAZORPAY_WEBHOOK_SECRET`

#### Test Cards (Razorpay Test Mode)

| Card | Purpose |
| ------ | --------- |
| `4111 1111 1111 1111` | Success (any future expiry, any CVV) |
| `4000 0000 0000 0002` | Failed payment |
| `4000 0000 0000 0069` | Expired card |
| `4000 0000 0000 0127` | Insufficient funds |

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
| **Observability** | Dependency-free `/metrics` (Prometheus text format) + Sentry |
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
| **Workflow Automation** | n8n (self-hosted, Docker/Render) |
| **Containerization** | Docker Compose (hardened: non-root, healthchecks) |
| **Reverse Proxy** | Nginx (non-root, port 8080) |
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

Start the **full stack** (PostgreSQL + Redis + Backend API + Frontend UI + n8n) with
one command:

```bash
# 1. Copy the environment template (edit if needed)
cp .env.example .env

# 2. Set at least one AI provider API key in .env (GEMINI_API_KEY, OPENROUTER_API_KEY, etc.)

# 3. Start all services (add --profile n8n for workflow automation)
docker compose up -d                    # Core stack only
docker compose --profile n8n up -d      # Core + n8n

# 4. View logs
docker compose logs -f

# 5. Open the app
#    Frontend: http://localhost:8080
#    Backend API: http://localhost:8001
#    API Docs: http://localhost:8001/docs
#    n8n UI: http://localhost:5678 (with --profile n8n)

# 6. Stop all services
docker compose down
```

> **Note:** The first build will take a few minutes (installing Python & Node.js dependencies).

### Docker Service Ports

| Service | URL | Description |
| --------- | ----- | ------------- |
| **Frontend** | <http://localhost:8080> | React app (Nginx, proxies `/api` → backend) |
| **Frontend (dev)** | <http://localhost:5173> | React app (Vite dev server, `npm run dev`) |
| **Backend API** | <http://localhost:8001> | FastAPI backend |
| **API Docs** | <http://localhost:8001/docs> | Swagger UI (interactive) |
| **n8n** | <http://localhost:5678> | Workflow automation (with `--profile n8n`) |
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

## Deploying to Render (API + Celery Workers + Redis + n8n)

The backend runs on Render as four services sharing one Redis (Key Value)
instance. A [`render.yaml`](./render.yaml) blueprint defines the whole stack.

### Blueprint (recommended)

1. Dashboard → **New → Blueprint** → connect this repo (pick the branch that
   contains `render.yaml`).
2. Render creates: `onramp-redis` (Key Value), `onramp-api` (web service),
   `onramp-worker` + `onramp-beat` (background workers), and `onramp-n8n` (web service).
3. During creation you're prompted for the `sync: false` secrets.

| Resource | Render type | What it runs |
| --- | --- | --- |
| `onramp-redis` | Key Value (Redis) | Celery broker + result store — auto-wired as `REDIS_URL` |
| `onramp-api` | Web service | `alembic upgrade head` + uvicorn (production Dockerfile stage), health check `/health` |
| `onramp-worker` | Background worker | `celery -A app.tasks.celery_app worker -Q agent-tasks,analytics-tasks,notification-tasks,default` |
| `onramp-beat` | Background worker | `celery -A app.tasks.celery_app beat` (digests, nightly sweeps, repo indexes) |
| `onramp-n8n` | Web service | n8n (Dockerfile.n8n), persistent disk at `/home/node/.n8n`, health check `/healthz` |

> **Why background workers?** A Web Service must bind a port and passes a
> deploy-time port scan. A Celery process binds none — creating it as a Web
> Service times out the deploy with *"No open ports detected… create a
> background worker instead"*.
>
> **Why n8n as Web Service?** n8n binds port 5678 and serves its UI + webhooks,
> so it must be a Web Service (not a Background Worker).

Secrets prompted on first apply (`sync: false`): `DATABASE_URL`, `JWT_SECRET`,
`PII_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `API_KEY_HMAC_SECRET`,
`CORS_ALLOWED_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`, plus optional
LLM/OAuth/billing/n8n keys. All services share them via the `onramp-shared`
environment group.

### n8n Production Setup

After deploying the blueprint:

1. **Get n8n URL**: `https://onramp-n8n.onrender.com`
2. **Access n8n UI**: Login with basic auth (set via `N8N_BASIC_AUTH_USER`/`PASSWORD`)
3. **Import workflows**: Workflows → ⋯ → Import from File → select `n8n/workflows/*.json`
4. **Configure credentials** on Telegram/Slack nodes
5. **Activate workflows** (toggle top-right)
6. **Copy production webhook URL**: `https://onramp-n8n.onrender.com/webhook/onramp`
7. **Configure in Onramp**: Settings → Integrations → n8n → paste webhook URL → Test → Connect

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

5. **New → Web Service (n8n)** → root dir `.`, Dockerfile `Dockerfile.n8n`,
   health check path `/healthz`, add persistent disk (10GB) at `/home/node/.n8n`.

6. Set the **same env vars on every service** — use an Environment Group.

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
# Backend tests (76 test files covering services, APIs, and DB migrations;
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

- GitLab & Bitbucket integration (GitHub only today)
- PR review auto-apply suggestions
- Custom per-key daily credit caps (today: tier daily request caps + per-key
  monthly credit budgets)
- Sitemap `lastmod` automation from git history (currently stamped at build)

### Recently shipped

- **Razorpay billing integration** (subscriptions, webhooks, credit wallet) — Sept 2026
- **n8n two-way workflow automation** (outbound events, inbound webhooks, pre-built workflows) — Sept 2026
- Mobile-responsive hardening across all pages (Sept 2026)
- Per-route SEO snapshots + canonical-host rewrite at build (Sept 2026)
- Developer Portal: BYOK provider pools, routing-mode dial, credit budgets
- Community playbook marketplace, Ollama local-provider support,
  real-time notification bell

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
│   │   ├── agents/          # 16 AI agents + base (HealthScorer, IssueResolutionAgent, …)
│   │   ├── api/v1/          # 46 route modules (auth, tasks, autopilot, explore, …)
│   │   ├── database/        # SQLAlchemy models (40), config
│   │   ├── middleware/      # Auth, RateLimit, Logging, ResponseWrapper, Metrics, …
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic (autopilot, github, task, ramp, …)
│   │   ├── tasks/           # Celery tasks + beat schedule
│   │   └── slack_bot/       # Slack integration
│   ├── alembic/             # Database migrations (30+ versions)
│   ├── tests/               # 76 pytest test files (dual memory+postgres storage)
│   └── scripts/             # Dev utilities (e2e flows, secrets)
├── web/
│   ├── src/
│   │   ├── components/      # Reusable UI (Sidebar, ConsolePanel, dashboard panels)
│   │   ├── context/         # AuthContext, ThemeContext, ToastContext
│   │   ├── lib/             # API client, utils, types
│   │   ├── pages/           # 60+ page components (role-gated)
│   │   └── test/            # Vitest tests
│   ├── e2e/                 # Playwright tests (auth, dashboard, review, a11y, perf)
│   └── public/
├── sdk/                     # TypeScript SDK (@onramp/sdk)
├── scripts/                 # Repo-level scripts (repo_autopilot.py, seed_dev_user.py, …)
├── docs/                    # API, architecture, routing, deployment guides
├── docker-compose.yml       # Local dev environment
├── docker-compose.prod.yml  # Production (API + workers + Redis)
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

#### n8n Integration

| Variable | Required | Description |
| ---------- | ---------- | ------------- |
| `N8N_WEBHOOK_URL` | ⬜ | Default outbound webhook URL (e.g., `https://n8n.example.com/webhook/onramp`) |
| `N8N_ONBOARDING_WEBHOOK_URL` | ⬜ | Optional override for onboarding events |
| `N8N_HMAC_SECRET` | ⬜ | HMAC secret for signing outbound payloads (generate: `openssl rand -base64 32`) |
| `N8N_INBOUND_SECRET` | ⬜ | HMAC secret for verifying inbound n8n → Onramp calls (generate: `openssl rand -base64 32`) |
| `N8N_TIMEOUT_SECONDS` | ⬜ | HTTP timeout for n8n calls (default: 5) |
| `N8N_BASE_URL` | ⬜ | n8n host for API calls (e.g., `https://n8n.example.com`) |
| `N8N_API_KEY` | ⬜ | n8n REST API key (for workflow listing) |

### Frontend (`web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ⬜ | API base URL (default: `http://localhost:8000/api/v1`) |
| `VITE_APP_URL` | ⬜ | Canonical site URL — OG tags, canonicals, sitemap/robots rewrite (default: `http://localhost:5173`; set to prod domain in production) |

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contributors

- Kunj Shah (@KunjShah95)
- Varad Vekariya (@varadvekariya6)

---

*Built with ❤️ for developers who want to ship faster.*
