# CodeFlow 2.0 — Contributing Guide

Welcome! This guide covers how to contribute to CodeFlow.

## Development Setup

```bash
git clone https://github.com/your-org/codeflow.git
cd codeflow

# Backend
cd backend
pip install -r requirements.txt
python -m pytest  # Verify 222 tests pass

# Frontend
cd ../web
npm install
npm run build    # Verify builds successfully
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
# Backend (222 tests)
cd backend && python -m pytest

# Run specific test file
cd backend && python -m pytest tests/test_billing.py -v

# Frontend build verification
cd web && npm run build
```

## Git Conventions

Use Conventional Commits:

| Prefix | Example |
|--------|---------|
| `feat:` | `feat: add Stripe checkout flow` |
| `fix:` | `fix: guard null subscription id in webhook` |
| `docs:` | `docs: add API reference` |
| `chore:` | `chore: add Dockerfile for ai-tutor` |
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
backend/              FastAPI monolith (21 routers, 7 agents, 26 services)
web/                  React 19 frontend (24 pages, code-split)
services/             Microservices (auth, analysis, tutor, etc.)
  gateway/            Node.js API Gateway (Express)
  user-service/       User management (FastAPI)
  repo-analysis/      GitHub repo analysis (FastAPI)
  learning-path/      Learning path generation (FastAPI)
  ai-tutor/           Multi-provider AI (FastAPI)
  team-analytics/     Team metrics (FastAPI)
  notification/       Notification delivery (FastAPI)
docs/                 Documentation
sdks/                 TypeScript SDK for third-party integrations
```
