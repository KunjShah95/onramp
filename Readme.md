# Onramp 2.0

**AI-powered developer onboarding & team acceleration platform.**

Onramp helps engineering teams onboard new developers faster, automate code reviews, track skill progression, and give leadership visibility into team health — all powered by multi-provider AI agents.

[![Backend CI](https://github.com/KunjShah95/onramp/actions/workflows/backend.yml/badge.svg)](https://github.com/KunjShah95/onramp/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/KunjShah95/onramp/actions/workflows/frontend.yml/badge.svg)](https://github.com/KunjShah95/onramp/actions/workflows/frontend.yml)

---

## ✨ Features

### 🧠 AI-Powered Developer Tools
| Tool | Description |
|------|-------------|
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

### 👥 Onboarding & Learning
- **Trainee Dashboard** — Track progress, unlocked modules, streak, XP
- **Gamification** — XP points, leveling, badges, streaks, leaderboards
- **Module-Level Access** — Grant/revoke module access per user per team
- **Onboarding Reports** — Auto-generated HTML/Markdown docs for any repo
- **Learning Paths** — Persisted milestones with completion tracking

### 📋 Task Management
- Full task lifecycle: create → assign → start → submit → review → approve → complete
- AI-assisted code review with inline issue detection
- Review queue with status badges (under_review, needs_changes, approved)
- Product sign-off gate with structured feedback

### 📊 CTO / Leadership Dashboard
- Task distribution & completion rate charts
- Per-member progress with completion bars
- Pending reviews & recent activity timeline
- Action items requiring attention
- Activity trend analysis (7-day velocity)

### 🔐 Enterprise-Grade Security
- JWT-based auth (HS256, 7-day expiry)
- bcrypt password hashing
- Fernet field-level encryption for PII
- RBAC with 9 roles (new_dev → ceo)
- Alembic database migrations
- CORS allowlist + Vercel regex
- Production env validation on boot

### 💳 Billing & API Gateway
- Stripe subscription management (free / pro / enterprise)
- API key management with usage tracking
- Rate limiting (200 req/min, Redis-backed)
- Usage quotas with endpoint-level breakdown

### 🔔 Notifications & Integrations
- In-app notification center (preferences, quiet hours, digest)
- Webhooks (create, test, rotate secrets, delivery logs)
- GitHub integration (token validation, scope checking)
- Slack integration (channel config, event-driven)
- Email via SendGrid

---

## 🏗 Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| **Framework** | Python 3.12, FastAPI |
| **Database** | PostgreSQL 16 (asyncpg, SQLAlchemy 2.0) |
| **Migrations** | Alembic |
| **Cache** | Redis (distributed rate limiting, caching) |
| **AI** | Multi-provider: OpenRouter, Gemini, Groq, OpenAI, Anthropic |
| **Auth** | Custom JWT (bcrypt + Fernet encryption) |
| **Billing** | Stripe |
| **Monitoring** | Sentry |
| **Email** | SendGrid |

### Frontend
| Component | Technology |
|-----------|-----------|
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
|-----------|-----------|
| **Backend Hosting** | Railway |
| **Frontend Hosting** | Vercel |
| **Containerization** | Docker Compose |
| **Reverse Proxy** | Nginx |
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
|---------|-----|-------------|
| **Frontend** | http://localhost:8080 | React app (Nginx, proxies `/api` → backend) |
| **Frontend (dev)** | http://localhost:5173 | React app (Vite dev server, `npm run dev`) |
| **Backend API** | http://localhost:8001 | FastAPI backend |
| **API Docs** | http://localhost:8001/docs | Swagger UI (interactive) |
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

## 🔑 Test Credentials

The following test accounts can be used for testing (register via the UI or seed script):

| Email | Password | Role | Description |
|-------|----------|------|-------------|
| `dev@onramp.ai` | `dev123` | Developer | Dev user (seed via `python scripts/seed_dev_user.py`) |
| `kunj@shah.com` | `hacker2005` | Senior Developer | Senior developer |
| `varadvekariya6@gmail.com` | `varadvekariya` | New Developer | New developer / trainee |

> **Note:** You can also register a new account at [http://localhost:5173/register](http://localhost:5173/register) or use OAuth (Google/GitHub) if configured.

---

## 🧪 Running Tests

```bash
# Backend (177 tests)
cd backend && .venv/Scripts/python -m pytest tests/ -q

# Frontend (49 tests)
cd web && npx vitest run

# E2E tests (Playwright)
cd web && npx playwright test

# TypeScript check
cd web && npx tsc --noEmit
```

---

## 🗺 Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full product roadmap and upcoming milestones.

### What's next (v1.1)
- OAuth2 social login (Google, GitHub)
- Password reset flow
- Real-time WebSocket notifications
- Per-developer drill-down dashboard
- Local AI model support (Ollama)
- GitLab & Bitbucket integration

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

```
onramp/
├── backend/
│   ├── app/
│   │   ├── agents/          # 10 AI agents (HealthScorer, etc.)
│   │   ├── api/v1/          # 25+ route modules
│   │   ├── database/        # SQLAlchemy models, config
│   │   ├── middleware/       # Auth, RateLimit, Logging, ResponseWrapper
│   │   └── services/        # Business logic (billing, github, etc.)
│   ├── alembic/             # Database migrations (5 versions)
│   ├── tests/               # 177 pytest tests
│   └── scripts/             # Dev utilities
├── web/
│   ├── src/
│   │   ├── components/      # Reusable UI (Sidebar, Cards, etc.)
│   │   ├── context/         # AuthContext, ThemeContext, ToastContext
│   │   ├── lib/             # API client, utils, types
│   │   ├── pages/           # 35+ page components
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
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (generate with `secrets.token_urlsafe(32)`) |
| `ENV` | ✅ | `development` or `production` |
| `OPENROUTER_API_KEY` | ⚠️ | At least one AI provider key required |
| `GEMINI_API_KEY` | ⚠️ | Google Gemini key |
| `STRIPE_SECRET_KEY` | ⬜ | For billing |
| `STRIPE_WEBHOOK_SECRET` | ⬜ | Stripe webhook signature verification |
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
