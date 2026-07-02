# CodeFlow 2.0 — Quick Start Guide

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

1. Create `backend/venv` if needed.
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
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
cp .env.example .env     # Windows cmd: copy .env.example .env
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
| Database | `codeflow` |
| User | `codeflow` |
| Password | `postgres_password` |
| Backend URL | `postgresql+asyncpg://codeflow:postgres_password@localhost:5432/codeflow` |

For local Docker/PostgreSQL, `DB_SSL_MODE=disable` is expected. Production deployments should set a provider-specific `DATABASE_URL` and usually `DB_SSL_MODE=require` or stronger.

## Environment variables

### Required for database startup

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Async SQLAlchemy PostgreSQL URL. The local default is already in `backend/.env.example`. |
| `DB_SSL_MODE` | `disable` for local Docker Postgres; `require`/`verify-full` for production. |

### Optional services

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Optional distributed cache/rate limit URL. If unset, the app falls back where supported. |
| `GITHUB_TOKEN` | Optional GitHub token for higher repo-analysis rate limits. |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Configure any one or more AI providers. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional billing integration. |

## Common issues

| Problem | Solution |
|---------|----------|
| PostgreSQL connection refused | Run `docker compose up -d postgres` and wait for the health check. |
| Password authentication failed | Ensure `backend/.env` uses `codeflow:postgres_password`, or set `DB_PASSWORD` before creating the container volume. |
| Tables missing | Run `cd backend && alembic upgrade head`. |
| Redis connection refused | Start Redis with `docker compose up -d redis`, or leave `REDIS_URL` unset for local fallback behavior. |
| AI responses empty | Add at least one AI provider key to `backend/.env` and restart the backend. |
| CORS errors | Ensure the frontend points to `http://localhost:8000/api/v1` and the backend allows `http://localhost:5173`. |
