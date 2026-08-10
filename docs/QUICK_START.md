# Onramp 2.0 — Quick Start Guide

Get the platform running locally with PostgreSQL, Redis, the FastAPI backend, and the Vite frontend. For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Desktop with Docker Compose
- Git

## One-command local setup

From the repository root:

```bash
# macOS/Linux/Git Bash
./setup-local.sh

# Windows Command Prompt
setup-local.bat
```

The setup scripts will:

1. Create `backend/.venv` if needed.
2. Install backend dependencies from `backend/requirements.txt`.
3. Copy `backend/.env.example` to `backend/.env` if missing.
4. Start local PostgreSQL and Redis with Docker Compose.
5. Run `alembic upgrade head` to create/update the PostgreSQL schema.
6. Install frontend dependencies and create `web/.env.local` if missing.

## Manual local setup

```bash
# 1) Start data services
docker compose up -d postgres redis

# 2) Backend
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env     # Windows cmd: copy .env.example .env
# If you use your own local PostgreSQL server, DATABASE_URL must match the
# actual username/password configured on that server.
# The Docker Compose defaults are onramp / postgres_password.
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3) Frontend, in a second terminal
cd web
npm install
npm run dev
```

Open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Local database defaults

Docker Compose creates this PostgreSQL database:

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `onramp` |
| User | `onramp` |
| Password | `postgres_password` |
| Backend URL | `postgresql+asyncpg://onramp:postgres_password@localhost:5432/onramp` |

For local Docker/PostgreSQL, `DB_SSL_MODE=disable` is expected. Production deployments should set a provider-specific `DATABASE_URL` and usually `DB_SSL_MODE=require` or stronger.

## Environment variables

The authoritative list lives in `backend/.env.example`. Highlights:

### Core (required for startup)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Async SQLAlchemy PostgreSQL URL. The local default is already in `backend/.env.example`. |
| `DB_SSL_MODE` | `disable` for local Docker Postgres; `require`/`verify-full` for production. |
| `JWT_SECRET` | HS256 signing secret (min 32 chars). **Required in production** — the boot validator refuses to start on the dev default. |
| `PII_ENCRYPTION_KEY` | Fernet key for PII at rest (`email`, `name`). **Required in production.** Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |

### Production-only requirements

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | **Boot-required in production** (`_validate_production_env`). Optional in dev — the app falls back to in-memory where supported. |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Fernet key for encrypting stored GitHub tokens. Required in production. |
| `API_KEY_HMAC_SECRET` | HMAC-SHA256 pepper for API key hashing. Required in production. |
| `API_KEY_ALLOW_LEGACY_PEPPER` | Default `true` — keeps pre-rotation API keys authenticating. Set `false` after all legacy keys are regenerated. |
| `ENV` | Set to `production` to enable production validation, disable `/docs` and the seed router. |
| `ENABLE_API_DOCS` | `true` re-enables Swagger `/docs` under production (off by default). |
| `ENABLE_SEED_ROUTER` | `true` re-enables the `POST /seed/*` demo-data router under production (off by default). |

### Optional services

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | Optional GitHub token for higher repo-analysis rate limits. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth App credentials — required for GitHub login & account linking. Callback: `{BACKEND_URL}/api/v1/auth/oauth/github/callback`. |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for GitHub push webhook HMAC verification. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth credentials — required for Google login. |
| `BACKEND_URL`, `FRONTEND_URL` | Public URLs used to build OAuth redirect targets. |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Configure any one or more AI providers. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Optional billing integration (INR). |
| `COHERE_API_KEY`, `VOYAGE_API_KEY` | Optional embedding providers (with `EMBEDDINGS_PROVIDER`). |

## Common issues

| Problem | Solution |
|---------|----------|
| PostgreSQL connection refused | Run `docker compose up -d postgres` and wait for the health check. |
| Password authentication failed | Ensure `backend/.env` matches the credentials for your actual PostgreSQL server. The Docker Compose local stack uses `onramp:postgres_password`. |
| Tables missing | Run `cd backend && alembic upgrade head`. |
| Redis connection refused | Start Redis with `docker compose up -d redis`. In development `REDIS_URL` may be left unset; **production refuses to boot without it**. |
| AI responses empty | Add at least one AI provider key to `backend/.env` and restart the backend. |
| CORS errors | Ensure the frontend points to `http://localhost:8000/api/v1` and the backend allows `http://localhost:5173`. |
| `/docs` 404 in production | By design — set `ENABLE_API_DOCS=true` to expose Swagger. |
| Backend won't start in production | Check the boot log: the production validator requires `JWT_SECRET`, `PII_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `API_KEY_HMAC_SECRET`, and `REDIS_URL`. |
