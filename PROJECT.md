# Onramp 2.0 — AI-Native Developer Onboarding Platform

> Turn any GitHub repository into a live onboarding program: graph it, index it, generate learning paths → issues → tasks → PRs → senior review, with leadership visibility into ramp cost and stuck devs.

## The Vision

Karpathy's LLM Wiki pattern — compile once, maintain persistently, query efficiently — applied to onboarding. Unlike on-demand wikis, Onramp builds a persistent repo context index (AST + dependency graph + embeddings) that evolves with the codebase, and wires it into a real task lifecycle so new devs ship their first PR in days, not weeks.

**Core loop:** `Repo Autopilot` ingests a repo once → builds `entities.json` / `graph.json` / `relationships.json` → caches as a Redis-backed repo index → routes every AI call through a free-first multi-provider LLM router → generates issues → creates tasks (load-balanced by role) → `AutonomousCodingAgent` opens PRs → validates + senior reviews → auto-completes on merge.

## Key Differentiators

| Feature | Typical Wiki / Onboarding Bot | Onramp 2.0 |
|---------|-------------------------------|------------|
| Wiki pattern | Regenerate on demand | **Parse once, 24h Redis index, Celery rebuild, GitHub webhook eviction** |
| Intent layer | None | **Entity graph (calls / inheritance / contains / serves) + evolution block** |
| Multi-agent | Single prompt | **16 agents (ArchitectureExplorer, IssueResolutionAgent, AutonomousCodingAgent, etc.)** |
| Ramp visibility | None | **Track · Quantify · Intercept — senior-time cost, stuck detectors, alerts** |
| Review ops | Manual assignment | **Load board, next-reviewer suggestion, consistency scoring** |
| Cost story | Token burn | **Free-first router + Redis semantic cache + token-efficiency benchmark** |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React 19 + Vite)                    │
│  44+ routes (lazy) · Workbench panels · Recharts · Framer Motion     │
│  AuthContext · ThemeContext (slate/ember/aurora/paper)                │
├──────────────────────────────────────────────────────────────────────┤
│                        API GATEWAY (FastAPI, :8000)                   │
│  CORS → SecurityHeaders → Metrics → Logging → ResponseWrapper →      │
│  RateLimit (Redis) → BodySizeLimit → Auth (JWT / cf_ / JWKS)        │
│  42+ routers · OpenAI-compatible /v1 gateway · /health /ready /metrics│
├──────────────────────────────────────────────────────────────────────┤
│                         AI & INDEX LAYER                              │
│  LLMRouter (QueryType: code/reasoning/structured/…) + fallback chain │
│  EmbeddingRouter (OpenAI/Cohere/Voyage/pgvector/none)                 │
│  Repo Context Index (ParserService + tree-sitter, 20+ langs)         │
│  Redis LLM cache (exact + semantic, X-LLM-Cache headers)             │
├──────────────────────────────────────────────────────────────────────┤
│                        SERVICES & AGENTS                              │
│  16 agents · 60+ services (ramp, review-ops, agent_benchmark, hr,    │
│  dora, billing, notifications, webhooks, GitHub/Slack/Jira/Linear)   │
│  Celery worker + beat (digests, sweeps, repo index, stuck checks)    │
├──────────────────────────────────────────────────────────────────────┤
│                        DATA & INFRA                                   │
│  PostgreSQL 16 (asyncpg/SQLAlchemy 2.0/pgvector, 34 tables, 28 migs) │
│  Redis (cache/broker/rate-limit) · Nginx :8080 · Docker · Sentry│
└──────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/KunjShah95/onramp.git
cd onramp

# 2. Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL, JWT_SECRET, one LLM key
python -m alembic upgrade head
uvicorn app.main:app --port 8000 --reload   # http://localhost:8000/docs

# 3. Frontend
cd ../web
npm install
cp .env.example .env   # VITE_API_URL (default http://localhost:8000/api/v1)
npm run dev            # http://localhost:5173

# 4. Full stack (Docker)
docker compose up -d   # Frontend :8080 · Backend :8001 · PG :5433 · Redis :6379
```

Seed realistic demo data (9 users, teams, tasks across 39+ tables, password `demo123`):

```bash
python scripts/seed_dev_user.py            # from backend/ or repo root
python scripts/seed_dev_user.py --quick    # users + teams only
```

Run the Repo Autopilot pipeline:

```bash
python scripts/repo_autopilot.py --repo https://github.com/owner/repo
python scripts/repo_autopilot.py --repo https://github.com/owner/repo --solve --max-issues 5 --github-token ghp_...
```

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql+asyncpg://onramp:postgres_password@localhost:5432/onramp
JWT_SECRET=...                          # secrets.token_urlsafe(32)
PII_ENCRYPTION_KEY=...                  # Fernet.generate_key()
API_KEY_HMAC_SECRET=...

# At least one LLM key (free-first routing)
GEMINI_API_KEY=...  # or OPENROUTER_API_KEY / GROQ_API_KEY / NVIDIA_API_KEY / ...

# Prod (required when ENV=production)
REDIS_URL=redis://:redis_password@localhost:6379/0
GITHUB_TOKEN_ENCRYPTION_KEY=...

# Optional
GITHUB_TOKEN=...  GITHUB_CLIENT_ID=...  GOOGLE_CLIENT_ID=...
RAZORPAY_KEY_ID=...  SENDGRID_API_KEY=...  SENTRY_DSN=...
OLLAMA_BASE_URL=http://localhost:11434
```

See `backend/.env.example` for the full list.

## Key API Endpoints

### Repo Index (token-saving: parse once, reuse everywhere)

```bash
POST /api/v1/repos/index                         # clone + parse + cache (24h TTL, async_build)
GET  /api/v1/repos/index/{index_id}/context?requirement=...&max_tokens=4000  # requirement-scored slice
```

### Autopilot (repo URL → PRs → review)

```bash
POST /api/v1/autopilot/analyze   # analysis only
POST /api/v1/autopilot/run       # analyze → solve → validate → senior review
```

### Ramp & Review Ops (wedge)

```bash
GET  /api/v1/ramp/summary        # per-trainee ramp + senior-time cost
GET  /api/v1/ramp/stuck          # stuck detectors
POST /api/v1/ramp/check          # fire alerts (also Celery every 6h)
GET  /api/v1/ramp/health         # org health score
GET  /api/v1/review-ops/load     # reviewer load board
GET  /api/v1/review-ops/suggest  # next reviewer
```

### OpenAI-Compatible Gateway

```bash
POST /v1/chat/completions   GET /v1/models   POST /v1/embeddings
```

Full list: `backend/app/api/v1/` (42 modules) and `Readme.md`.

## Tech Stack

- **Backend**: Python 3.12+, FastAPI, SQLAlchemy 2.0, asyncpg, pgvector, Alembic, Celery, tree-sitter (20+ languages)
- **Frontend**: React 19, TypeScript (strict), Vite 6, Tailwind CSS 3, Framer Motion, GSAP, Recharts, Phosphor Icons, TanStack Query
- **Database**: PostgreSQL 16 · Redis (cache/broker/rate-limit) · pgvector (embeddings)
- **AI**: LLMRouter + EmbeddingRouter — OpenRouter/Gemini/Groq/NVIDIA free-first, DeepSeek/Qwen/Zhipu/Moonshot/Mistral/OpenAI/Anthropic/HuggingFace/Ollama fallback
- **Auth**: JWT HS256 + Fernet PII encryption + HMAC-SHA256 `cf_` keys + Google/GitHub OAuth + optional Neon Auth JWKS
- **Infra**: Docker Compose (hardened, non-root), Nginx, Sentry, Render/Railway (`/metrics` via backend)

## Target Users

1. **New devs / trainees** — guided ramp, learning paths, first PR in days.
2. **Senior devs** — fewer repeats, review load-balancing, self-serve routing for juniors.
3. **CTOs / EMs** — ramp cost, stuck alerts, health score, DORA metrics.
4. **HR / Talent** — cohort retention, headcount flows, onboarding health.

## References

- [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Software 3.0](https://www.latent.space/p/s3)
- [LLM Routing](./docs/LLM_ROUTING.md) · [Architecture](./docs/ARCHITECTURE.md) · [Validation Script](./docs/validation-interview-script.md)

## License

MIT
