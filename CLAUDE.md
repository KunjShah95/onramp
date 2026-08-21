# Onramp 2.0 - AI-Powered Developer Onboarding

## Project Overview

Onramp 2.0 is an AI-powered developer onboarding platform. FastAPI monolith + PostgreSQL 16 (asyncpg/SQLAlchemy 2.0 + pgvector) + Redis + Celery, React 19 SPA. Auth is first-party JWT (HS256, 7-day expiry, refresh tokens) with Neon Auth JWKS verification as an optional path, plus Google/GitHub OAuth with account linking.

## Tech Stack

- **Backend**: Python 3.12+ (3.13 local), FastAPI, SQLAlchemy 2.0, asyncpg, pgvector, Alembic (28 migrations)
- **Frontend**: React 19, TypeScript (strict), Vite 6, Tailwind CSS 3, Framer Motion, GSAP, Recharts, Phosphor Icons
- **Database**: PostgreSQL 16 (primary), Redis (required in prod: rate-limit, LLM cache, Celery broker, OAuth state)
- **Auth**: JWT (bcrypt + Fernet field encryption, `cf_` API keys with HMAC-SHA256) + Google/GitHub OAuth + optional Neon Auth JWKS
- **AI**: Multi-provider LLM router (`backend/app/llm.py`) — OpenRouter/Gemini/Groq/NVIDIA free-first, DeepSeek/Qwen/Zhipu/Moonshot/Mistral/OpenAI/Anthropic/HuggingFace/Ollama fallbacks; embeddings via `EmbeddingRouter`
- **Infra**: Docker Compose (hardened, non-root), Nginx (port 8080), Celery worker + beat, Prometheus/Grafana (prod), Sentry

## File Structure

```
backend/app/
├── main.py              # FastAPI app (port 8000), 8 middleware layers, 42+ routers
├── llm.py               # Multi-provider LLM router with fallback + QueryType
├── embeddings.py        # EmbeddingRouter (pluggable providers)
├── api/v1/              # 42+ routers (explore, learn, ask, billing, ramp, review-ops, autopilot, etc.)
├── agents/              # 16 AI agent modules + base_agent
├── database/            # 34 SQLAlchemy models + DB config (34 tables incl. DynamicDocument)
├── middleware/          # Auth, RateLimit, Logging, ResponseWrapper, Metrics, SecurityHeaders, CORS, BodySize
└── services/            # 60+ service modules (ramp, review-ops, agent_benchmark, etc.)

web/src/
├── pages/               # 58+ page components (44+ routes, lazy-loaded)
├── components/          # UI components + layouts + Workbench panels
├── context/             # Auth, Theme, Toast contexts
├── lib/                 # API client (114 typed fns), types, utils, neon-auth
├── hooks/               # useWebSocket, etc.
└── test/                # Vitest setup + test utils

docs/                    # Architecture, LLM routing, deployment, validation interview script
sdk/                     # @onramp/sdk TypeScript SDK (OpenAI-compatible gateway)
```

## API (port 8000)

- `POST /api/v1/auth/register` / `POST /api/v1/auth/login` — email/password + JWT; OAuth at `/api/v1/auth/oauth/{google,github}/login`
- Most routes under `/api/v1` require Bearer token (`Authorization: Bearer <jwt>` or `cf_` API key)
- Public routes: `/`, `/health`, `/ready`, `/metrics`, `/docs` (dev/staging), `/api/v1/billing/webhook`, `/api/v1/webhooks/github`, `/api/v1/auth/*` public paths
- OpenAI-compatible gateway at `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` (auth enforced in-endpoint)
- Full list: `backend/app/api/v1/` (42 modules) + `backend/app/main.py:350` public-path allowlist

## Running

```bash
# Backend (requires Python 3.12+, PostgreSQL 16, Redis)
cd backend
pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, at least one LLM key
python -m alembic upgrade head
uvicorn app.main:app --port 8000 --reload

# Frontend
cd web
npm install
cp .env.example .env          # VITE_API_URL (default http://localhost:8000/api/v1)
npm run dev                   # http://localhost:5173

# Full stack (Docker)
docker compose up -d          # Frontend :8080 (Nginx) + Backend :8001 + PG :5433 + Redis :6379
```

## Environment

Copy `.env.example` → `.env` in both `backend/` and `web/`. Required: `DATABASE_URL`, `JWT_SECRET`, `PII_ENCRYPTION_KEY`, `API_KEY_HMAC_SECRET`, one LLM API key. See `backend/.env.example` for all options (LLM providers, Razorpay, GitHub OAuth, Redis, Sentry, etc.). In `ENV=production`, boot fail-fast validates required vars (`backend/app/main.py:100`).
