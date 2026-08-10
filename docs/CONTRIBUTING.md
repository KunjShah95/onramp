# Onramp 2.0 — Contributing Guide

Welcome! This guide covers how to contribute to Onramp.

## Development Setup

Fastest path — use the setup scripts from the repo root:

```bash
# macOS/Linux/Git Bash
./setup-local.sh
# Windows Command Prompt
setup-local.bat
```

Manual setup:

```bash
git clone https://github.com/your-org/onramp.git
cd onramp

# Backend
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows (source .venv/bin/activate on mac/Linux)
pip install -r requirements.txt
cp .env.example .env
# needs PostgreSQL (docker compose up -d postgres) + optionally Redis
alembic upgrade head
python -m pytest  # 822 passed / 199 skipped

# Frontend, second terminal
cd web
npm install
npm run dev
```

## Code Style

### Python (Backend)
- **Linter:** `ruff` — run `ruff check .` before committing
- **Types:** `mypy` — run `mypy .` to check types
- **Format:** `ruff format .` for auto-formatting
- Follow existing patterns in the codebase

### TypeScript/React (Frontend)
- **Linter:** ESLint — run `npx eslint .`
- **TypeScript:** Strict mode enabled — no `any` in new code
- **Styling:** TailwindCSS utility classes, no CSS modules
- Follow existing component patterns

## Running Tests

```bash
# Backend (822 passed / 199 skipped)
cd backend && python -m pytest

# Run specific test file
cd backend && python -m pytest tests/test_billing.py -v

# Frontend unit tests + typecheck + build
cd web && npm run test && npx tsc --noEmit && npm run build

# Frontend E2E (Playwright) — needs the dev servers running, see web/e2e
cd web && npx playwright test
```

## Git Conventions

Use Conventional Commits:

| Prefix | Example |
|--------|---------|
| `feat:` | `feat: add Razorpay checkout flow` |
| `fix:` | `fix: guard null subscription id in webhook` |
| `docs:` | `docs: add API reference` |
| `chore:` | `chore: pin GitHub Actions to commit SHAs` |
| `refactor:` | `refactor: extract encryption helpers` |
| `test:` | `test: add webhook handler tests` |

## PR Workflow

1. Branch from `main`: `git checkout -b feat/your-feature`
2. Make focused, atomic commits
3. Open a PR with a clear description of what and why
4. Request review from a maintainer
5. Address review feedback
6. Squash merge to `main`

## Project Structure

```
backend/              FastAPI monolith (39 routers, 16 agents, 52 services)
  app/api/v1/         Route handlers (auth, explore, tasks, billing, admin, ...)
  app/agents/         LLM-backed agents (BaseAgent subclasses)
  app/services/       Shared services (github, llm, embeddings, oauth, ...)
  app/database/       SQLAlchemy 2.0 models + config
  app/middleware/     Auth, rate limit, logging, security headers
  alembic/            Migrations (head: 022_backfill_encrypt_pii)
web/                  React 19 + Vite + Tailwind frontend (67 pages)
  src/pages/          Route pages (code-split)
  src/lib/            API client, types, auth helpers
  e2e/                Playwright E2E specs + mocks
sdk/                  TypeScript SDK for third-party integrations
docs/                 Documentation
grafana/ prometheus/  Observability dashboards
kubernetes/           K8s manifests (deployment, config, hpa)
```
