# 🗺️ Onramp 2.0 — Product Roadmap

**Last updated:** July 2026  
**Status:** MVP Launch (v1.0.0)

---

## Vision

Onramp is an AI-powered developer onboarding & team-acceleration platform. It helps engineering organizations onboard new developers faster, track skill progression, automate code reviews, and provide CTO/leadership visibility into team health — all powered by multi-provider AI agents.

---

## ✅ MVP (v1.0.0) — Complete

### Authentication & Teams
- [x] Email/password registration & login with JWT
- [x] Role-based access control (new_dev, developer, senior_dev, tester, cto, ceo, owner, member)
- [x] Team creation, invites, and membership management
- [x] Self-serve team switching and role sync
- [x] PostgreSQL-backed session management (no third-party auth dependency)

### AI-Powered Developer Tools
- [x] **Code Architecture Explorer** — Visualize repo structure as an interactive force-directed graph
- [x] **First PR Accelerator** — Find beginner-friendly issues and generate step-by-step contribution guides
- [x] **Learning Path Generator** — Generate personalized learning paths from any codebase
- [x] **Repo Q&A (Ask)** — Chat with your codebase; streaming SSE responses
- [x] **PR Description Generator** — Auto-generate PR titles, descriptions, and changelogs
- [x] **Code Health Scorer** — Analyze repos for complexity, maintainability, and test coverage
- [x] **Pattern Recognition** — Find similar code patterns and alternative approaches across repos
- [x] **Silent Pair Programming** — AI-guided walkthroughs for solving issues
- [x] **Quiz Generator** — Module-level quizzes with multiple choice, code review, and matching questions
- [x] **Regression Test Generator** — Generate test checklists and edge-case coverage from PR diffs

### Onboarding & Learning
- [x] **Onboarding Report Generator** — Auto-generated HTML/Markdown onboarding docs for any repo
- [x] **Trainee Dashboard** — Track progress, unlocked modules, streak, XP, and badges
- [x] **Gamification Engine** — XP points, leveling, badges, streaks, leaderboards
- [x] **Module-Level Access Control** — Grant/revoke module access per user per team
- [x] **Learning Paths** — Persisted, reusable path milestones

### Task Management & Workflow
- [x] **Full task lifecycle** (create → assign → start → submit → review → approve → complete)
- [x] **AI-assisted code review** with inline issue detection, scoring, and recommendations
- [x] **Review queue** with status badges (under_review, needs_changes, approved)
- [x] **Product sign-off gate** with review feedback

### CTO / Leadership Dashboard
- [x] Task distribution & completion rates
- [x] Member progress table with per-user metrics
- [x] Pending reviews & recent activity timeline
- [x] Require-attention action items
- [x] Activity trend charts (AreaChart, BarChart, PieChart via Recharts)

### Billing & API Gateway
- [x] Stripe subscription management (create, update, cancel, webhooks)
- [x] Tiered pricing (free → pro → enterprise)
- [x] API key management with per-key usage tracking
- [x] Rate limiting (200 req/min per IP, Redis-backed)
- [x] Usage quotas and credit tracking

### Notifications & Integrations
- [x] In-app notification center (read/unread, preferences, quiet hours)
- [x] Webhook management (create, test, rotate secrets, delivery logs)
- [x] GitHub integration (token validation, scope checking)
- [x] Slack integration (channel config, event-driven notifications)
- [x] Email via SendGrid (digest, alerts)

### Admin & Audit
- [x] Admin panel — view all API keys, usage across teams, audit events
- [x] Audit log (CRUD events with actor/target/metadata)
- [x] User deactivation (GDPR right-to-erasure)
- [x] Webhook delivery inspection and retry

### Security
- [x] JWT-based auth (HS256, 7-day expiry)
- [x] bcrypt password hashing (all production users)
- [x] Fernet field-level encryption (PII: email, name)
- [x] Alembic database migrations (5 versions)
- [x] RBAC middleware with route-level access guards
- [x] CORS with allowlist + Vercel regex
- [x] Production env validation on boot (fail-fast)

### Tech Stack
- [x] **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, asyncpg, Alembic
- [x] **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts
- [x] **Database:** PostgreSQL 16 (local/Railway), Redis (caching/rate-limit)
- [x] **AI:** OpenRouter, Gemini, Groq, OpenAI, Anthropic (multi-provider with failover)
- [x] **Infra:** Docker Compose, Railway, Vercel, Nginx, Sentry

---

## 🎯 Next Up (v1.1 — Post-MVP)

### Short-term (next 2–4 weeks)

| Area | Feature | Priority | Effort |
|------|---------|----------|--------|
| **Auth** | OAuth2 social login (Google, GitHub) | High | Medium | ✅ DONE |
| **Auth** | Password reset flow (via email) | High | Small | ✅ DONE |
| **Trainee** | Milestone tracking with roadmap view | Medium | Medium |
| **Dashboard** | Per-developer detail drill-down | Medium | Small |
| **AI** | Support for local models (Ollama) | Medium | Medium |
| **AI** | PR review — auto-apply suggestions | Low | Medium |
| **DevEx** | Landing page with live demo | High | Small |

### Medium-term (1–2 months)

| Area | Feature |
|------|---------|
| **Notifications** | Real-time WebSocket push for task updates |
| **Integrations** | GitLab & Bitbucket support |
| **Integrations** | Jira linear ticket sync |
| **CI/CD** | GitHub Actions — auto PR review on push |
| **Analytics** | Team velocity trends & DORA metrics |
| **Billing** | Usage-based pricing tier |
| **Admin** | Team-level feature flag management |
| **DevEx** | Mobile-responsive views for key pages |

### Long-term (3–6 months)

| Area | Feature |
|------|---------|
| **AI** | Autonomous coding agent (sandboxed) |
| **AI** | Architecture drift detection |
| **Platform** | Multi-org support with SAML/SSO |
| **Platform** | Self-hosted deployment option (Helm chart) |
| **Integrations** | VS Code extension |
| **Integrations** | GitHub Actions marketplace app |
| **Marketplace** | Plugin system for custom AI agents |
| **Scale** | Read replicas, connection pooling, CDN |

---

## 🧪 Testing & Reliability

- [x] **Backend tests:** 177 passing (pytest, async fixtures)
- [x] **Frontend tests:** 49 passing (Vitest, React Testing Library)
- [x] **E2E tests:** Playwright suite (auth, dashboard, review-queue)
- [x] **TypeScript:** strict mode, zero errors
- [ ] **API contract tests** (planned for v1.1)
- [ ] **Load testing** (planned for v1.1)
- [ ] **A11y audit** (planned for v1.2)

---

## 📊 Key Metrics

| Metric | Current |
|--------|---------|
| Backend API endpoints | 100+ |
| Frontend pages | 35+ |
| AI agents | 10 |
| Database migrations | 5 |
| Test coverage (backend) | ~70% |
| Test count | 226 total |

---

*This roadmap is a living document. Items are re-prioritized based on user feedback and business needs.*
