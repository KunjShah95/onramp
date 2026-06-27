# CodeFlow — AI-Native Developer Onboarding Platform

> Transform any GitHub repository into an interactive knowledge wiki. Not just documentation—compile once, maintain persistently, query efficiently.

---

## Table of Contents

- [The Problem](#the-problem)
- [Our Solution](#our-solution)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [System Components](#system-components)
- [API Reference](#api-reference)
- [Data Layer](#data-layer)
- [LLM Strategy](#llm-strategy)
- [Deployment](#deployment)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)

---

## The Problem

Developer onboarding is broken:

- **New hires take 3-6 months** to become productive
- **Documentation is always stale** — written once, never maintained
- **Knowledge is siloed** in senior developers' heads
- **No structured learning paths** exist for complex codebases
- **First PR takes weeks** because beginners don't know where to start

**The result:** Teams lose 40%+ of engineering time to onboarding inefficiency.

---

## Our Solution

CodeFlow is an **AI-powered developer onboarding platform** that:

1. **Analyzes any GitHub repo** — Architecture, dependencies, learning paths
2. **Generates personalized learning paths** — Based on developer experience level
3. **Accelerates first PRs** — Beginner-friendly issues with step-by-step guides
4. **Enables Q&A** — Ask questions about codebase, get answers from AI agents
5. **Tracks progress** — Per-developer onboarding metrics and dashboards
6. **Captures institutional knowledge** — Playbooks and team-specific guides

**The result:** Reduce onboarding time from months to weeks.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                        │
├───────────┬──────────────┬──────────────┬──────────────┬────────────────────┤
│  Web UI   │  TypeScript  │  GitHub      │  IDE         │  Slack Bot        │
│  (React)  │  SDK         │  Actions     │  Extensions  │  (Slash Commands) │
└─────┬─────┴──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────────┘
      │            │              │              │                │
      └────────────┼──────────────┼──────────────┼────────────────┘
                   │   HTTPS      │              │
          ┌────────▼──────────────▼──────────────▼──────────┐
          │              API GATEWAY & ROUTERS              │
          │         FastAPI (uvicorn, async)                │
          ├─────────────────────────────────────────────────┤
          │  Middleware Stack:                               │
          │  ┌─────────┐ ┌──────────┐ ┌──────────┐        │
          │  │  CORS   │ │   Auth   │ │  Rate    │        │
          │  │         │ │ (Firebase│ │  Limit   │        │
          │  │         │ │   JWT)   │ │ 200/min  │        │
          │  └─────────┘ └──────────┘ └──────────┘        │
          │  ┌─────────┐ ┌──────────┐ ┌──────────┐        │
          │  │Response │ │ Logging  │ │Access    │        │
          │  │Wrapper  │ │ (Sentry) │ │Guard     │        │
          │  └─────────┘ └──────────┘ └──────────┘        │
          └────────────────────┬──────────────────────────┘
                               │
          ┌────────────────────▼──────────────────────────┐
          │            21 API ROUTERS (v1)                │
          ├───────────────────────────────────────────────┤
          │ explore  learn   first-pr  ask     reports    │
          │ dashboard teams  playbooks billing  ai-gateway│
          │ slack    pr-review  tasks  auth    invites    │
          │ audit    notifications  integrations  health  │
          └────────────────────┬──────────────────────────┘
                               │
          ┌────────────────────▼──────────────────────────┐
          │          11 AI AGENTS                          │
          ├───────────────────────────────────────────────┤
          │  ┌──────────────┐  ┌──────────────────┐      │
          │  │Architecture  │  │LearningPath      │      │
          │  │Explorer      │  │Generator         │      │
          │  ├──────────────┤  ├──────────────────┤      │
          │  │FirstPR       │  │RepoQA            │      │
          │  │Accelerator   │  │(Index + Query)    │      │
          │  ├──────────────┤  ├──────────────────┤      │
          │  │SilentPair    │  │PatternRecognition│      │
          │  │Programming   │  │                  │      │
          │  ├──────────────┤  ├──────────────────┤      │
          │  │RegTest       │  │OnboardingReport  │      │
          │  │Generator     │  │Generator         │      │
          │  ├──────────────┤  ├──────────────────┤      │
          │  │HealthScorer  │  │PR Review         │      │
          │  │              │  │Agent             │      │
          │  └──────────────┘  └──────────────────┘      │
          └────────────────────┬──────────────────────────┘
                               │
          ┌────────────────────▼──────────────────────────┐
          │           28 SERVICE LAYER                    │
          ├───────────────────────────────────────────────┤
          │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
          │  │ GitHub   │ │ Parser   │ │ Embeddings   │ │
          │  │ Service  │ │ Service  │ │ Service      │ │
          │  ├──────────┤ ├──────────┤ ├──────────────┤ │
          │  │ Cache    │ │ Task     │ │ Billing      │ │
          │  │ Service  │ │ Service  │ │ Service      │ │
          │  ├──────────┤ ├──────────┤ ├──────────────┤ │
          │  │ Team     │ │ Playbook │ │ API Key      │ │
          │  │ Service  │ │ Service  │ │ Service      │ │
          │  ├──────────┤ ├──────────┤ ├──────────────┤ │
          │  │ Audit    │ │ Invite   │ │ Contributor  │ │
          │  │ Service  │ │ Service  │ │ Tracker      │ │
          │  └──────────┘ └──────────┘ └──────────────┘ │
          └────────────────────┬──────────────────────────┘
                               │
          ┌────────────────────▼──────────────────────────┐
          │              DATA LAYER                       │
          ├───────────────────────────────────────────────┤
          │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
          │  │PostgreSQL│ │  Redis   │ │   Firebase   │ │
          │  │(Alembic) │ │ (Cache)  │ │ (Auth+Store) │ │
          │  ├──────────┤ ├──────────┤ ├──────────────┤ │
          │  │ GitHub   │ │   LLM    │ │   Sentry     │ │
          │  │ (REST)   │ │  (6 API) │ │  (Error)     │ │
          │  └──────────┘ └──────────┘ └──────────────┘ │
          └──────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | **FastAPI** (Python 3.11+) | Async HTTP server |
| ASGI | **uvicorn** | Production WSGI/ASGI |
| ORM | **SQLAlchemy 2.0** + **asyncpg** | Database access |
| Migrations | **Alembic** | Schema versioning |
| Graph Engine | **NetworkX 3.1** | Dependency graph analysis |
| Cache | **Redis 7** | Session + rate limiting |
| Task Queue | **Celery** | Background async jobs |
| Auth | **Firebase Admin SDK** | JWT validation |
| AI SDKs | **openai**, **anthropic**, **google-genai**, **groq** | Multi-provider LLM |
| Payments | **Stripe** | Subscription billing |
| Email | **SendGrid** | Transactional email |

### Frontend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | **React 19** | UI components |
| Language | **TypeScript 5.7** | Type safety |
| Build | **Vite 6** | Dev server + bundler |
| Routing | **react-router-dom 7** | SPA routing |
| Styling | **Tailwind CSS 3.4** + **clsx** | Utility-first CSS |
| Animation | **Framer Motion 11** | Page transitions |
| Visualization | **d3-force** | Force-directed graphs |
| Auth | **Firebase 11** | Client-side auth |
| Video | **react-youtube**, **hls.js** | Media playback |

### Infrastructure

| Component | Technology |
|-----------|-----------|
| Container | Docker, Docker Compose |
| Orchestration | Kubernetes (8 manifests) |
| IaC | Terraform (GCP) |
| CI/CD | GitHub Actions |
| Reverse Proxy | Nginx (dev + prod) |
| Cloud | Vercel (frontend) / Render (backend) / Firebase |

---

## System Components

### 11 AI Agents

All agents inherit from `BaseAgent` (abstract class with `execute(**kwargs)` method, shared LLM client access).

| Agent | Input | Output | Key Services Used |
|-------|-------|--------|-------------------|
| **ArchitectureExplorer** | `repo_url`, `branch` | Entities, services, dependency graph, Mermaid diagram | GitHubService, ParserService, GraphBuilder, LLMClient |
| **LearningPathGenerator** | `repo_structure`, `user_level` | 5-8 learning modules with files, time estimates, objectives | LLMClient, ParserService |
| **FirstPRAccelerator** | `repo_url`, `user_level` | Scored issues, step-by-step PR guides | GitHubService, IssueService, ParserService, LLMClient |
| **RepoQA** | `repo_path` (index) or `question` (ask) | Index ID or answer with file references | ParserService, EmbeddingsService, LLMClient |
| **SilentPairProgramming** | `issue_id`, `repo_structure` | Narrated walkthrough transcript | LLMClient |
| **PatternRecognition** | `pattern_name`, `repo_structure` | 3 similar implementations with rationale | ParserService, GitHubService, LLMClient |
| **RegressionTestGenerator** | `pr_diff`, `repo_structure` | Test checklist, edge cases, code templates | ParserService, LLMClient |
| **OnboardingReportGenerator** | `repo_url`, `user_level` | Professional PDF/HTML onboarding report | GitHubService, ParserService, ReportGenerator, LLMClient |
| **HealthScorer** | `repo_structure` | Coverage, complexity, docs, maintainability scores | ParserService |
| **PR Review Agent** | `pr_diff`, `repo_structure` | Code review comments, suggestions | LLMClient, ParserService |
| **Task QA Agent** | `task_id`, code context | Automated review of onboarding tasks | LLMClient, TaskService |

### 28 Backend Services

| Service | Responsibility |
|---------|---------------|
| **GitHubService** | Clone repos, fetch issues/PRs, auth with tokens |
| **ParserService** | AST parsing (Python, JS, TS, Go, Rust, Java) — extract classes, functions, imports, deps |
| **EmbeddingsService** | Keyword-based document indexing + search (upgradeable to vector DB) |
| **CacheService** | In-memory LRU cache with TTL (repo analyses, 1h) |
| **TaskService** | Full task state machine (10 states: pending → in_progress → review → completed, etc.) |
| **UserService** | User CRUD, profile, preferences |
| **TeamService** | Team CRUD, member management, tier assignment |
| **PlaybookService** | Playbook CRUD, versioning, archiving |
| **BillingService** | Stripe subscription lifecycle, tier changes |
| **APIKeyService** | Create/validate/revoke API keys, tier limits, credit costs |
| **UsageTracker** | Per-org credit tracking, quota enforcement |
| **InviteService** | Team invite creation, token-based acceptance |
| **AuditService** | Activity logging, compliance trails |
| **NotificationService** | User notifications, polling endpoints |
| **AccessControlService** | Role-based access checks |
| **ConversationService** | Chat history persistence |
| **ContributorTracker** | GitHub webhook → milestone tracking |
| **SlackService** | Slack digest + slash command handler |
| **ReportGenerator** | HTML/PDF onboarding report generation |
| **EmailService** | Transactional email (invites, notifications) |
| **WebhookService** | Stripe webhook processing |
| **QuotaService** | LLM token quota management |
| **Cache** (PostgreSQL helper) | SQLAlchemy-level caching |
| **PostgresDB** | Connection pool, session management |
| **FirestoreDB** | Firebase Firestore operations |
| **Parser** (standalone) | Language detection + file analysis |
| **GraphBuilder** | NetworkX dependency graph construction |

### 6 Middleware Components

| Middleware | Function |
|-----------|----------|
| **CORSMiddleware** | Whitelist origins from `CORS_ALLOWED_ORIGINS` env |
| **AuthMiddleware** | Firebase JWT validation, public path exemptions |
| **RateLimitMiddleware** | Token bucket (200 req/min default, Redis-backed) |
| **ResponseWrapperMiddleware** | Standardize `{success, data, error}` response format |
| **LoggingMiddleware** | Structured request/response logging to Sentry |
| **AccessGuard** | Permission checks per endpoint |

---

## Frontend Architecture

### 24 Pages (Route-Level Code Splitting)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | LandingPage | Marketing + feature showcase |
| `/pricing` | PricingPage | Pricing tiers + comparison |
| `/changelog` | ChangelogPage | Release notes |
| `/docs` | DocsPage | Documentation |
| `/login` | Login | Firebase auth login |
| `/register` | Register | New user registration |
| `/forgot-password` | ForgotPassword | Password reset |
| `/join` | JoinPage | Accept team invite |
| `/explore` | ExplorePage | Repo architecture analysis + force-directed graph |
| `/learn` | LearnPage | AI learning paths + timeline |
| `/first-issue` | FirstIssuePage | Beginner-friendly issue finder + PR guides |
| `/ask` | AskPage | Repo Q&A with chat interface |
| `/reports` | OnboardingReportPage | Generate onboarding reports |
| `/dashboard` | DashboardPage | CTO metrics + team analytics |
| `/team` | TeamPage | Team member management |
| `/playbooks` | PlaybooksPage | Onboarding playbooks library |
| `/billing` | BillingPage | Subscription + payment management |
| `/api-keys` | ApiKeysPage | API key management |
| `/settings` | Settings | User preferences |
| `/profile` | Profile | User profile |
| `/pr-describe` | PRDescriptionPage | AI PR description generator |
| `/tasks` | TasksPage | Onboarding task kanban + list view |
| `/my-progress` | TraineeDashboard | Personal onboarding progress |
| `/notifications` | NotificationsPage | Notification center |

### Component Architecture

```
src/
├── App.tsx                 # Router + provider hierarchy
├── main.tsx                # Entry point
├── index.css               # Tailwind + custom styles
├── pages/                  # 24 route-level lazy-loaded pages
├── components/
│   ├── auth/               # ProtectedRoute, login form
│   ├── layout/             # Sidebar, header, main layout shell
│   ├── ui/                 # Button, Card, Input, Modal, TracingBeam, etc.
│   ├── dashboard/          # CTO dashboard widgets
│   ├── landing/            # Landing page sections
│   ├── ArchitectureDiagram.tsx  # Mermaid architecture visualization
│   ├── ChatInterface.tsx   # AI chat component
│   ├── ForceGraph.tsx      # d3-force interactive graph
│   ├── HistorySidebar.tsx  # Chat history panel
│   ├── IssueCard.tsx       # GitHub issue card
│   └── LearningPathTimeline.tsx  # Learning path visualization
├── context/
│   ├── AuthContext.tsx      # Firebase auth state
│   ├── ThemeContext.tsx     # Dark/light theme
│   └── TransitionContext.tsx # Page transitions
└── lib/
    ├── api.ts              # Axios HTTP client
    ├── firebase.ts         # Firebase initialization
    ├── types.ts            # Shared TypeScript interfaces
    ├── utils.ts            # Utility functions
    └── motion.ts           # Framer Motion variants
```

**Key design decisions:**
- Route-level code splitting via `React.lazy` for minimal initial bundle
- `ProtectedRoute` wrapper enforces auth gate for all internal routes
- `TransitionProvider` wraps page transitions with Framer Motion
- `GlobalNatureBackground` provides ambient background layer
- `d3-force` renders interactive dependency graphs on the Explore page

---

## API Reference

### Core Features (12 endpoints)

```
POST /api/v1/explore/analyze    — Clone repo, parse AST, build graph, analyze with LLM
POST /api/v1/learn/path         — Generate personalized learning path
POST /api/v1/first-pr/issues    — Find beginner-friendly issues with complexity scores
POST /api/v1/first-pr/guide     — Generate step-by-step PR guide for an issue
POST /api/v1/ask/index          — Index a repository for Q&A
POST /api/v1/ask/query          — Ask a question about an indexed repo
POST /api/v1/ask/history        — Get Q&A history
POST /api/v1/reports/generate   — Generate onboarding report (PDF)
POST /api/v1/reports/generate-html — Generate onboarding report (HTML)
POST /api/v1/repos/{owner}/{repo}/health — Health score analysis
POST /api/v1/slack/digest       — Send Slack digest
POST /api/v1/slack/command      — Handle Slack slash command
```

### Differentiators (3 endpoints)

```
POST /api/v1/pair/walkthrough          — Generate narrated pair programming walkthrough
POST /api/v1/patterns/find-similar     — Find similar patterns across repositories
POST /api/v1/test-checklist/generate   — Generate test checklist from PR diff
```

### AIaaS (8 endpoints)

```
POST   /api/v1/ai/keys                 — Create API key
GET    /api/v1/ai/keys                 — List API keys
DELETE /api/v1/ai/keys/{id}            — Revoke API key
GET    /api/v1/ai/keys/validate/{key}   — Validate API key
GET    /api/v1/ai/usage/{org}          — Get usage stats
GET    /api/v1/ai/usage/{org}/summary  — Usage summary
GET    /api/v1/ai/usage/{org}/quota    — Check quota
GET    /api/v1/ai/tiers                — List tiers & pricing
```

### SaaS (19 endpoints)

```
POST   /api/v1/teams                           — Create team
GET    /api/v1/teams                           — List teams
GET    /api/v1/teams/{id}                      — Get team
POST   /api/v1/teams/{id}/members              — Add member
DELETE /api/v1/teams/{id}/members/{user}       — Remove member
POST   /api/v1/teams/{id}/invites              — Create invite
GET    /api/v1/teams/{id}/invites              — List invites
POST   /api/v1/teams/{id}/tier                 — Change tier
GET    /api/v1/teams/{id}/subscription         — Get subscription

POST   /api/v1/playbooks                       — Create playbook
GET    /api/v1/playbooks                       — List playbooks
GET    /api/v1/playbooks/{id}                  — Get playbook
PATCH  /api/v1/playbooks/{id}                  — Update playbook
DELETE /api/v1/playbooks/{id}                  — Archive playbook

POST   /api/v1/billing/subscriptions            — Create subscription
GET    /api/v1/billing/subscriptions/{team}     — Get subscription
PATCH  /api/v1/billing/subscriptions/{team}     — Update subscription
DELETE /api/v1/billing/subscriptions/{team}     — Cancel subscription
POST   /api/v1/billing/subscriptions/{team}/stripe — Attach Stripe
GET    /api/v1/billing/pricing                 — Get pricing
```

### Dashboard & Tasks (6 endpoints)

```
GET    /api/v1/repos                   — List user repos
GET    /api/v1/dashboard/cto           — CTO dashboard metrics
GET    /api/v1/dashboard/team          — Team analytics
GET    /api/v1/roadmap                 — Project roadmap
GET    /api/v1/tasks                   — List onboarding tasks
POST   /api/v1/tasks/{id}/submit-ai-review — Submit AI review for task
```

### Team Collaboration (5 endpoints)

```
POST   /api/v1/invites/accept/{token}  — Accept team invite
GET    /api/v1/notifications            — List notifications
POST   /api/v1/notifications/read       — Mark notifications as read
POST   /api/v1/notifications/clear      — Clear all notifications
GET    /api/v1/audit/logs               — Audit log
```

### Auth & System (4 endpoints)

```
POST   /api/v1/auth/refresh-token       — Refresh Firebase token
POST   /api/v1/auth/update-profile      — Update user profile
GET    /api/v1/auth/users               — List users
GET    /health                          — Health check
```

**Total: 55+ API endpoints across 21 routers**

---

## Data Layer

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA PERSISTENCE LAYER                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                     PostgreSQL (Primary)                    │    │
│  │  Tables: users, teams, team_members, playbooks,            │    │
│  │           subscriptions, api_keys, usage_records, tasks,    │    │
│  │           notifications, audit_logs, invites, integrations  │    │
│  │  ORM: SQLAlchemy 2.0  |  Migrations: Alembic               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐   │
│  │      Redis (Cache)       │  │     Firebase (Auth + Store)  │   │
│  │  • Rate limiting state   │  │  • JWT authentication        │   │
│  │  • Session cache         │  │  • User identity             │   │
│  │  • LLM response cache    │  │  • Real-time sync            │   │
│  │  • Celery broker         │  │                              │   │
│  └──────────────────────────┘  └──────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐   │
│  │   In-Memory (Ephemeral)  │  │     GitHub (External API)    │   │
│  │  • Repo analysis cache   │  │  • Repository cloning        │   │
│  │  • Embeddings index      │  │  • Issues, PRs, commits      │   │
│  │  • Temp cloned repos     │  │  • Rate: 5k/hr per token    │   │
│  └──────────────────────────┘  └──────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Alembic Migrations
Database migrations managed via Alembic. Migrations in `backend/alembic/`.

### Task State Machine (10 States)

```
pending → assigned → in_progress → submitted → in_review
→ changes_requested (→ in_progress loop)
→ approved (→ completed) → verified
  → cancelled (any state)
```

---

## LLM Strategy

### Multi-Provider Fallback Chain

Free providers first, paid fallback:

| Priority | Provider | Model | Cost | SDK |
|----------|----------|-------|------|-----|
| 1 | **OpenRouter** | `gemini-2.5-flash:free` | Free | openai |
| 2 | **Gemini** | `gemini-2.5-flash` | Free | google-genai |
| 3 | **Groq** | `llama-3.3-70b-versatile` | Free | openai |
| 4 | **NVIDIA** | `llama-3.3-70b-instruct` | Free | openai |
| 5 | **OpenAI** | `gpt-4o-mini` | Paid | openai |
| 6 | **Anthropic** | `claude-3-5-sonnet` | Paid | anthropic |

**Features:**
- Automatic fallback on provider failure (transient errors, rate limits, outages)
- Streaming support for all 6 providers
- JSON mode for structured agent responses
- Provider config via environment variables only
- Lazy SDK imports (missing SDK disables only that provider)

**Estimated monthly cost:** $15-30 (DeepSeek + Gemini + Groq for volume, GPT-4o-mini for complex tasks)

---

## Deployment

### Local Development

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env    # Add your keys
uvicorn app.main:app --reload --port 8000

# Frontend
cd web
npm install
cp .env.example .env.local
npm run dev             # http://localhost:5173
```

### Docker (Dev)

```bash
docker-compose up -d
# Backend: http://localhost:8000
# Redis: localhost:6379
# PostgreSQL: localhost:5432
# Celery Worker: docker-compose --profile worker up -d
```

### Docker (Production)

```bash
docker-compose -f docker-compose.prod.yml up -d --scale backend=4
# Nginx reverse proxy on :80 / :443
# Backend cluster behind internal network
```

### Kubernetes

```bash
kubectl apply -f kubernetes/
# 8 manifests: deployment, service, hpa, ingress, redis, frontend, config, advanced-scaling
```

### Cloud

- **Frontend:** Vercel (`npm run build` → `dist/` → CDN)
- **Backend:** Render (Python 3.11 + FastAPI, port 3007)
- **Database:** Firebase (Auth + Firestore), PostgreSQL (via Render/AWS RDS)

### CI/CD

GitHub Actions with automated test suite, Docker build, and deployment to staging/production.

---

## Infrastructure

### Docker Compose Layout

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Dev: backend + redis + postgres + celery |
| `docker-compose.prod.yml` | Prod: backend(×2) + redis + nginx |
| `docker-compose.microservices.yml` | 8 microservices + frontend |

### Kubernetes (8 Manifests)

| Manifest | Purpose |
|----------|---------|
| `deployment.yaml` | Backend deployment (2 replicas) |
| `service.yaml` | Backend ClusterIP service |
| `hpa.yaml` | Horizontal Pod Autoscaler |
| `ingress.yaml` | Nginx ingress controller |
| `redis.yaml` | Redis deployment + service |
| `frontend.yaml` | Frontend static file serving |
| `config.yaml` | Environment config map |
| `advanced-scaling.yaml` | Custom scaling policies |

### Terraform (GCP)

Infrastructure-as-code for Google Cloud Platform resources in `infrastructure/terraform/`.

### Cloud Run

Serverless deployment config in `infrastructure/cloudrun/`.

### Nginx

- `nginx.conf` — Dev reverse proxy
- `nginx.prod.conf` — Prod reverse proxy with SSL termination, caching, load balancing

---

## Testing

**222 tests, all passing.**

| Suite | Tests | Coverage |
|-------|-------|----------|
| ArchitectureExplorer | 15 | Parse, graph, topology, cycles, Mermaid, full explorer |
| FirstPRAccelerator | 1 | Issue scoring |
| LearningPathGenerator | 6 | LLM + fallback paths |
| LLM Router | 2 | Provider fallback chain |
| Phase 2 | 12 | HealthScorer, Reports, Slack, Contributor |
| Phase 3 | 9 | SilentPair, Patterns, RegTest |
| Phase 4 | 12 | API Keys, Usage, Quota |
| Phase 5 | 16 | Teams, Playbooks, Billing |
| RepoQA | 10 | Index + Query |
| Task Service | 44 | Task state machine, AI review |
| Access Control | 26 | Permission checks |
| Task Submit AI Review | 16 | AI review submission |
| Access Guard | 14 | Role-based access |
| Invite Service | 9 | Token management |
| Audit Service | 6 | Activity logging |
| Trainee Dashboard | 6 | Progress metrics |
| Notifications + other | ~18 | All systems |

**Run:** `cd backend && python -m pytest tests/ -v`

---

## Roadmap

### Completed (MVP)

- [x] Multi-language AST parsing (Python, JS, TS, Go, Rust, Java)
- [x] Entity graph construction
- [x] LLM Wiki pattern implementation
- [x] Multi-agent system (Security, Refactoring, Architecture, Docs)
- [x] Architecture drift detection
- [x] Tech debt financial model
- [x] Intent layer (WHY, ASSUMPTIONS, TRADEOFFS)
- [x] LLM integration (OpenAI, Azure, Ollama, Anthropic)
- [x] Task management system
- [x] Notification system
- [x] PR description generator
- [x] CTO dashboard
- [x] Trainee dashboard
- [x] Theme system (4 themes)
- [x] Integration system
- [x] Role-based access control
- [x] Email invitations
- [x] Responsive design

### In Progress (Post-MVP)

- [ ] React Query integration (performance optimization)
- [ ] Integration tests (full onboarding flow)
- [ ] Production deployment (Vercel + Render)

### Planned (Q3 2026)

- [ ] **Interactive Repo Visualization** — Force-directed graph with search, filter, drill-down
- [ ] **"Senior Dev Roast" Mode** — Sarcastic codebase critique for Q&A agent
- [ ] **Knowledge Quizzes** — AI-generated multiple-choice questions from codebase
- [ ] **Gamification System** — XP points, badges, streaks for onboarding progress
- [ ] **Weekly Digest** — Auto-generated team learning summary email

### Future (Q4 2026+)

- [ ] SSO/SAML (Okta, Azure AD)
- [ ] SOC 2 compliance reporting
- [ ] Custom onboarding templates
- [ ] Playbook marketplace (community-contributed templates)
- [ ] Certified training programs
- [ ] Industry-specific solutions (FinTech, HealthTech)
- [ ] Mobile companion app
- [ ] VS Code extension
- [ ] Cross-repo intelligence
- [ ] Team knowledge mapping

---

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/KunjShah95/codeflow.git
cd codeflow

# 2. Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: add GEMINI_API_KEY or OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd web
npm install
cp .env.example .env.local
npm run dev

# 4. Open
# Frontend: http://localhost:5173
# API: http://localhost:8000
# Docs: http://localhost:8000/docs

# 5. Run tests
cd backend && python -m pytest tests/ -v
```

---

## Environment Variables

### Backend (`backend/.env`)

```bash
# LLM Providers (at least one required)
OPENROUTER_API_KEY=sk-or-...       # Free tier (recommended)
GEMINI_API_KEY=...                  # Free tier
GROQ_API_KEY=...                    # Free tier
NVIDIA_API_KEY=...                  # Free tier
OPENAI_API_KEY=sk-...               # Paid fallback
ANTHROPIC_API_KEY=sk-ant-...        # Paid fallback

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/codeflow
REDIS_URL=redis://localhost:6379/0  # Optional

# Auth
FIREBASE_PROJECT_ID=...
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
JWT_SECRET_KEY=...
AUTH_DEV_BYPASS=true

# GitHub
GITHUB_TOKEN=ghp_...

# Infrastructure
ENVIRONMENT=development
LOG_LEVEL=DEBUG
WORKERS=4
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Payments (optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (optional)
SENDGRID_API_KEY=...
```

### Frontend (`web/.env`)

```bash
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## License

MIT — see [LICENSE](LICENSE)

---

## Project Stats

```
Line Counts:
  Backend agents/     ~1,200 lines (11 agents)
  Backend services/   ~1,000 lines (28 services)
  Backend api/v1/     ~500 lines  (21 routers, 55+ endpoints)
  Backend middleware/  ~150 lines  (6 middleware)
  Backend core        ~600 lines  (main, llm, graph, db)
  Backend tests/      ~1,500 lines (222 tests)
  Total Backend:      ~4,950 lines

  Frontend pages/     ~1,500 lines (24 pages)
  Frontend components/~1,200 lines (20+ components)
  Frontend lib/       ~350 lines
  Total Frontend:     ~3,150 lines

  SDK:                ~200 lines (TypeScript)
  Infrastructure:     ~1,500 lines (Docker, K8s, Terraform, CI/CD)
  Documentation:      ~4,500 lines

  Grand Total:        ~14,300 lines
  Tests:              222/222 passing
  Completion:         85% (All 5 phases + post-MVP features)
```
