# 🗺️ Onramp 2.0 — Product Roadmap

**Last updated:** July 2026  
**Status:** v1.3 Complete  
**Next:** v1.4 — Platform & Scale

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
- [x] **Onboarding Hub** — Central portal for new developers with guided paths

### Task Management & Workflow

- [x] **Full task lifecycle** (create → assign → start → submit → review → approve → complete)
- [x] **AI-assisted code review** with inline issue detection, scoring, and recommendations
- [x] **Review queue** with status badges (under_review, needs_changes, approved, product_review)
- [x] **Product sign-off gate** with review feedback
- [x] **Dedicated review queue page** with filtering and batch actions
- [x] **Direct approve / route-to-product** from submitted state (no mandatory under_review)

### CTO / Leadership Dashboard

- [x] Task distribution & completion rates
- [x] Member progress table with per-user metrics
- [x] Pending reviews & recent activity timeline
- [x] Require-attention action items
- [x] Activity trend charts (AreaChart, BarChart, PieChart via Recharts)
- [x] **Executive Dashboard** dedicated to C-suite (CEO/CTO)
- [x] **Senior Developer Space** for team leads

### Billing & API Gateway

- [x] Stripe subscription management (create, update, cancel, webhooks)
- [x] Tiered pricing (free → pro → enterprise)
- [x] API key management with per-key usage tracking
- [x] Rate limiting (200 req/min per IP, Redis-backed)
- [x] Usage quotas and credit tracking

### v1.1 Additions — Complete

#### Authentication & Security

- [x] **OAuth2 social login** — Google & GitHub (server-side flow with CSRF state tokens)
- [x] **OAuth callback handling** — AuthCallback page for seamless provider redirects
- [x] **Password reset flow** — Short-lived JWT token via email reset link
- [x] **Forgot / Reset password pages** — Full UI with success/error states
- [x] **Role expansion** — Added `ceo`, `cto`, `senior_dev`, `tester` roles with route guards

#### Onboarding Plans (30-60-90 Day)

- [x] **Onboarding Plan CRUD** — Create structured plans with milestones per team member
- [x] **Milestone tracking** — Individual milestones with status, due dates, completion
- [x] **Pulse check-ins** — Weekly pulse surveys with trend tracking
- [x] **Plan review workflow** — Reviewer sign-off gates

#### Playbooks

- [x] **Full CRUD** — Create, read, update, delete playbook templates
- [x] **Tag system** — Categorize playbooks by technology and role
- [x] **Usage tracking** — Per-playbook use counters
- [x] **Rich card UI** — Grid view with filtering by category

#### Wiki

- [x] **AI-generated onboarding wikis** — Generate from any public repo URL
- [x] **Semantic sections** — Architecture, setup, conventions, deployment, testing
- [x] **Markdown output** — Downloadable onboarding wiki documents

#### Quiz System

- [x] **Module-level quiz generation** — Multiple choice, code review, matching
- [x] **Quiz grading notifications** — `quiz_graded` event with score display
- [x] **Notification integration** — Bell icon, badge count, quiz_graded icon/color

#### HR Dashboard

- [x] **HR analytics** — Team health metrics, onboarding progress
- [x] **People management** — HR People page with team member overview
- [x] **Role-scoped views** — HR-specific dashboard alongside senior dashboard

#### Notifications & Integrations

- [x] **In-app notification center** — Read/unread, preferences, quiet hours
- [x] **Notification Bell** — Polling-based badge count, dropdown preview
- [x] **Rich notification types** — 14 event types with distinct icons & colors
- [x] **Pagination support** — Page clamping, type-filtered views
- [x] **Mark all read** — Bulk read status updates
- [x] **Webhook management** — Create, test, rotate secrets, delivery logs
- [x] **GitHub integration** — Token validation, scope checking
- [x] **Slack integration** — Channel config, event-driven notifications
- [x] **Email via SendGrid** — Digest, alerts

#### UX & Polish

- [x] **Custom CSS design system** — 50+ design tokens (bg/text/accent colors, spacing, shadows, transitions)
- [x] **Per-page skeleton loading** — 15+ page-specific skeleton components
- [x] **Keyboard shortcuts** — Global nav shortcuts (g+d dashboard, g+e explore, etc.)
- [x] **Global background effects** — Ambient gradient backgrounds
- [x] **Transition context** — Page transition animations
- [x] **Error boundaries** — Per-route error isolation
- [x] **Changelog page** — Public changelog for release notes
- [x] **Pricing page** — Public pricing with plan comparison
- [x] **Privacy & Terms pages** — Legal compliance

#### Drill-Down Views

- [x] **Per-developer detail** (`/member/:userId`) — Member profile, tasks, progress, module access
- [x] **Module health** (`/module/:moduleName`) — Per-module status and health metrics
- [x] **Dev Space** — Developer workspace with tool launcher
- [x] **Senior Space** — Team lead command center

#### Admin & Infrastructure

- [x] **Admin dashboard** — View all API keys, usage across teams, audit events
- [x] **Audit log** — CRUD events with actor/target/metadata
- [x] **User deactivation** — GDPR right-to-erasure
- [x] **Webhook delivery inspection and retry**
- [x] **Database: 8 Alembic migrations** — Schema evolution from initial to dynamic document tables
- [x] **Database: Dynamic document table migration** — 21 collections migrated from JSONB to real tables

### Security

- [x] JWT-based auth (HS256, 7-day expiry)
- [x] bcrypt password hashing (all production users)
- [x] Fernet field-level encryption (PII: email, name)
- [x] Alembic database migrations (8 versions)
- [x] RBAC middleware with route-level access guards
- [x] CORS with allowlist + Vercel regex
- [x] Production env validation on boot (fail-fast)

### Tech Stack

- [x] **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, asyncpg, Alembic
- [x] **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 3, Framer Motion, Recharts, TanStack React Query, Phosphor Icons
- [x] **Database:** PostgreSQL 16 (local/Railway), Redis (caching/rate-limit)
- [x] **AI:** OpenRouter, Gemini, Groq, OpenAI, Anthropic (multi-provider with failover)
- [x] **Infra:** Docker Compose, Railway, Vercel, Nginx, Sentry
- [x] **CI/CD:** GitHub Actions (backend + frontend pipelines)

---

## ✅ v1.2 — Production Launch & Polish (Month 1)

**Theme:** Foundation — ship to production, close UX gaps, set up for scale  
**Est. effort:** 2–3 weeks  
**Focus:** Production readiness, real-time, mobile, accessibility, performance

### Production Readiness

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **DevOps** | Deploy backend to Railway/Render with Docker | 🔴 Critical | 2 days | ✅ Done |
| **DevOps** | Deploy frontend to Vercel with custom domain + HTTPS | 🔴 Critical | 1 day | ✅ Done |
| **DevOps** | Production PostgreSQL (managed) + automated backups | 🔴 Critical | 1 day | ✅ Done |
| **DevOps** | Production Redis for rate limiting + caching | 🔴 Critical | 0.5 day | ✅ Done |
| **DevOps** | Wire CI/CD — auto-deploy on `main` push | 🔴 Critical | 1 day | ✅ Done |
| **DevOps** | SSL/TLS, env vars, sanity checks | 🔴 Critical | 1 day | ✅ Done |

### UX & Polish

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **Notifications** | Real-time WebSocket push for task updates | 🔴 Critical | 3 days | ✅ Done (backend WS + frontend 5-min polling) |
| **Visualization** | Interactive repo graph — search, filter, drill-down, tooltips | 🟢 High | 2 days | ✅ Done |
| **Trainee** | Milestone tracking with roadmap timeline view | 🟢 High | 2 days | ✅ Done |
| **Auth** | Session refresh & remember-me (persist across browser closes) | 🟢 High | 1 day | ✅ Done |
| **DevEx** | Mobile-responsive views — wave 1: core 10 pages | 🟢 High | 3 days | ✅ Done |
| **DevEx** | Mobile-responsive — wave 2: remaining 34 pages | 🟢 High | 3 days | ✅ Done |
| **A11y** | WCAG 2.1 AA audit — keyboard nav, ARIA labels, focus indicators, axe-core scans | 🟢 High | 2 days | ✅ Done |
| **Load More** | Pagination on TasksPage + NotificationsPage (reuse existing Pagination) | 🟢 Medium | 1 day | ✅ Done |
| **CI/CD Tests** | Frontend E2E — login → dashboard → explore → team → billing → a11y | 🟢 High | 2 days | ✅ Done (65+ tests) |
| **CI/CD Tests** | API contract tests + OpenAPI 3.1 spec | 🟢 Medium | 2 days | ✅ Done (31 tests) |
| **DevEx** | Keyboard shortcuts — visual feedback, expanded coverage to all pages | 🟢 Medium | 0.5 day | ✅ Done |
| **Notifications** | Backend WebSocket endpoint + connection manager | 🟢 Medium | 2 days | ✅ Done |
| **Notifications** | Notification bell z-index fix (fixed positioning above all layers) | 🟢 Medium | 0.5 day | ✅ Done |
| **Notifications** | Polling interval configurable via VITE_NOTIFICATION_POLL_INTERVAL | 🟢 Low | 0.5 day | ✅ Done |
| **Integrations** | Jira / Linear ticket synchronization (bi-directional) | 🟢 Medium | 4 days | ✅ Done |
| **Integrations** | Feature flag management UI | 🟢 Medium | 1 day | ✅ Done |

### Platform Expansion — Carried Forward to v1.4

| Area | Feature | Priority | Original Est. | Status |
| ------ | --------- | ---------- | --------------- | -------- |
| **Integrations** | GitLab & Bitbucket repository support | 🟢 Medium | 3 days | ⏳ Carried to v1.4 |
| **AI** | Ollama local model support (air-gapped/self-hosted) | 🟢 Medium | 3 days | ⏳ Carried to v1.4 |
| **AI** | PR review — auto-apply suggestions (inline fix commits) | 🟢 Medium | 3 days | ⏳ Carried to v1.4 |

---

## ✅ v1.3 — Enterprise + AI Acceleration (Month 2)

**Theme:** Enterprise foundation + AI differentiation  
**Est. effort:** 3–4 weeks  
**Focus:** SSO, audit, DORA metrics, PR automation, community marketplace

### Enterprise Foundation

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **Auth** | SSO/SAML — Okta + Azure AD / Entra ID federation | 🔴 Critical | 3 weeks | ✅ Done |
| **Auth** | Domain-based routing (auto-detect IdP from email) | 🟢 High | 3 days | ✅ Done |
| **Admin** | Real-time audit log UI with SIEM-exportable events | 🟢 High | 3 days | ✅ Done |
| **Security** | HMAC-SHA256 for API key hashing (replace unsalted SHA-256) | 🟢 High | 1 day | ✅ Done |
| **Security** | Rate limit documentation + developer portal | 🟢 Medium | 1 day | ✅ Done |

### AI Differentiation

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **Analytics** | Team velocity trends — cycle time, throughput, DORA metrics | 🟢 High | 3 days | ✅ Done |
| **Tasks** | CI/CD auto PR review on push (GitHub Actions integration) | 🟢 High | 3 days | ✅ Done |
| **Integration** | Jira / Linear ticket sync (bi-directional) | 🟢 Medium | 4 days | ✅ Done (moved from v1.2) |
| **AI** | Architecture drift detection — alert when code diverges from docs | 🟢 Medium | 4 days | ✅ Done (`DriftDetector` agent + `POST /api/v1/drift/detect`) |

### Community & Content

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **Marketplace** | Community playbook marketplace — publish, search, import, rate | 🟢 Medium | 4 days | ✅ Done (`/api/v1/marketplace/*` + Marketplace page) | | **Billing** | Usage-based pricing tier (per-query / per-seat hybrid) | 🟢 Medium | 3 days | ✅ Done |
 ✅ Done (prepaid credit wallet + metered drawdown) |
| **Admin** | Team-level feature flag management | 🟢 Medium | 2 days | ✅ Done |
| **Viral** | "Senior Dev Roast" mode — toggle sarcastic AI persona | 🟢 Low | 1 day | ✅ Done |

---

## 🎯 v1.4 — Platform & Scale (Month 3)

**Theme:** Open the platform, ship AI SDK, scale infrastructure  
**Est. effort:** 3–4 weeks  
**Focus:** Public API, autonomous agents, VS Code extension, performance  
**Includes carried-forward:** Mobile wave 2, A11y audit, CI/CD tests, GitLab/Bitbucket, Ollama, PR auto-apply, rate limit docs, drift detection, marketplace, usage-based billing

### Remaining v1.2 Carried Items

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **CI/CD Tests** | API contract tests + OpenAPI 3.1 spec | 🟢 Medium | 2 days |
| **Integrations** | GitLab & Bitbucket repository support | 🟢 Medium | 3 days | ✅ Done |

### Remaining v1.3 Carried Items

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **AI** | Architecture drift detection — alert when code diverges from docs | 🟢 Medium | 4 days | ✅ Done |
| **Marketplace** | Community playbook marketplace — publish, search, import, rate | 🟢 Medium | 4 days | ✅ Done | | **Billing** | Usage-based pricing tier (per-query / per-seat hybrid) | 🟢 Medium | 3 days | ✅ Done |
 ✅ Done |

### AI Platform

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **AI** | Autonomous coding agent (sandboxed) — assign issue -> AI implements -> opens PR | 🟢 High | 4 weeks | ✅ Done |
| **AI** | Ollama local model support (air-gapped/self-hosted) | 🟢 Medium | 3 days | ✅ Done |
| **AI** | PR review — auto-apply suggestions (inline fix commits) | 🟢 Medium | 3 days | ✅ Done |
| **API** | AIaaS public API gateway — package agents as REST APIs with key auth | 🟢 High | 3 days | ✅ Done |
| **API** | TypeScript SDK -> `@onramp/sdk` (typed client: chat, stream, embeddings, agents, usage) | 🟢 High | 2 days | ✅ Done (`sdk/` — tsc build + 6 unit tests) |
| **API** | Usage-based billing: per-query metering + credit system | 🟢 High | 3 days | ✅ Done (`CreditService` wallet + `/api/v1/billing/credits*`) | ### Developer Experience

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **IDE** | VS Code extension — inline explanations, PR review, learning paths | 🟢 High | 3 days |
| **CI/CD** | GitHub Actions marketplace app — auto onboarding report on push | 🟢 Medium | 3 days |
| **Mobile** | PWA — service worker, offline app-shell fallback, manifest + icons | 🟢 Medium | 2 weeks | ✅ Done (`web/public/sw.js` + manifest + registerPwa) |
| **Mobile** | Quick Q&A from mobile | 🟢 Medium | 3 days | ### Performance & Scale

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **Scale** | PostgreSQL read replicas + connection pooling (pgBouncer) | 🟢 High | 2 days |
| **Scale** | Redis caching layer for frequent endpoints | 🟢 High | 1 day | ✅ Done |
| **Scale** | Response compression (gzip/brotli) | 🟢 Medium | 0.5 day | ✅ Done (ASGI GZip + optional Brotli middleware) |
| **Scale** | Lighthouse audit -> p95 API < 500ms, bundle < 200KB gzipped | 🟢 High | 2 days | ✅ Done (Perf + bundle CI gates) |
| **Scale** | CDN for static assets (Vercel edge + Nginx Cache-Control) | 🟢 Medium | 1 day | ✅ Done |
| **Scale** | Load testing (k6 or Locust) + CI gate | 🟢 Medium | 2 days | ✅ Done (12 backend tests + k6 script) |

### Observability & Ops (Production Hardening)

| Area | Feature | Priority | Est. Effort | Status |
| ------ | --------- | ---------- | ------------- | -------- |
| **Monitoring** | Prometheus `/metrics` — HTTP, LLM, cache, embeddings, WS (dependency-free registry) | 🔴 Critical | 1 day | ✅ Done |
| **Monitoring** | Grafana stack — auto-provisioned datasource + API dashboard | 🟢 High | 0.5 day | ✅ Done (`grafana/` + compose service) |
| **Monitoring** | Structured JSON logging (`LOG_FORMAT=json`) — Loki/Datadog-ready | 🔴 Critical | 0.5 day | ✅ Done |
| **Monitoring** | Request correlation IDs (`X-Request-ID` echo + log field) | 🔴 Critical | 0.5 day | ✅ Done |
| **Ops** | Liveness `/health` + readiness `/ready` (DB + Redis probes) | 🔴 Critical | 0.5 day | ✅ Done |
| **Security** | Hardened security headers (HSTS, nosniff, frame-deny, Permissions-Policy, CSP opt-in) | 🟢 High | 0.5 day | ✅ Done |
| **Security** | OpenAPI security scheme (BearerAuth) for typed client generation | 🟢 Medium | 0.5 day | ✅ Done |
| **Infra** | Docker: non-root users, HEALTHCHECKs, Python 3.12, nginx on 8080 | 🔴 Critical | 1 day | ✅ Done |

---

## 🎯 v2.0 — Enterprise GA (Month 4+)

**Theme:** Enterprise-grade compliance, horizontal scaling, ecosystem  
**Est. effort:** 6–8 weeks  
**Focus:** SOC 2, tenant isolation, Helm, agent plugins

### Enterprise Compliance

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **Security** | SOC 2 Type II readiness — evidence collection, access reviews, change management | 🔴 Critical | ongoing |
| **Security** | Third-party penetration test | 🔴 Critical | 4 weeks (ext.) |
| **Security** | Secrets vault integration (HashiCorp Vault / Azure Key Vault) | 🟢 High | 1 week |
| **Security** | Immutable audit trail with tamper-evident logging | 🟢 High | 1 week |
| **Security** | SCIM provisioning — user lifecycle managed from IdP | 🟢 High | 2 weeks |

### Multi-Tenant Architecture

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **Platform** | Hard tenant isolation — PostgreSQL RLS or per-tenant database | 🔴 Critical | 2 weeks |
| **Platform** | Data residency controls — EU/US/APAC region pinning | 🟢 High | 2 weeks |
| **Platform** | Self-hosted deployment — Helm chart for Kubernetes | 🟢 High | 2 weeks |
| **Platform** | Multi-org support with namespace isolation | 🟢 High | 3 weeks |
| **Platform** | GitLab & Bitbucket repository support | 🟢 Medium | 3 days |

### Ecosystem & Plugins

| Area | Feature | Priority | Est. Effort |
| ------ | --------- | ---------- | ------------- |
| **Platform** | Plugin system for custom AI agents — write your own agent | 🟢 Medium | 3 weeks |
| **Platform** | Agent MCP (Model Context Protocol) support | 🟢 Medium | 2 weeks |
| **Platform** | Custom enterprise roles (beyond owner/ceo/member) | 🟢 Medium | 1 week |
| **Monitoring** | Prometheus/Grafana observability stack | 🟢 Medium | 1 week |
| **Monitoring** | Structured JSON logging for production | 🟢 Medium | 1 day |

---

## 🎯 Stretch / Viral Features

Quick wins that drive engagement and social sharing, can be slotted into any release:

| Area | Feature | Effort |
| ------ | --------- | -------- |
| **Viral** | Codebase trailer — "In a world..." auto-generated movie trailer for any repo | 1 day |
| **Viral** | Hot Take PR review — personality-driven one-liner summary | 0.5 day |
| **Viral** | DevScore leaderboard — weekly XP rankings with crown badges | 1 day |
| **Viral** | Dark mode consistency audit across all 4 themes | 0.5 day |

---

## 🧪 Testing & Reliability

- [x] **Backend tests:** 737+ passing (pytest, async fixtures, dual memory+postgres storage)
- [x] **Backend observability tests:** 25 (metrics registry + exposition, /health + /ready probes, security headers, JSON logging, request IDs)
- [x] **Frontend tests:** 58+ passing (Vitest, React Testing Library)
- [x] **SDK tests:** 6 passing (typed client against mocked gateway)
- [x] **E2E tests:** Playwright suite (auth, dashboard, review-queue, explore, team, billing, a11y) — **65+ tests**
- [x] **TypeScript:** strict mode, zero errors (web + sdk)
- [x] **Backend CI:** GitHub Actions (compileall + alembic upgrade + pytest w/ service Postgres)
- [x] **Frontend CI:** GitHub Actions (tsc + vitest + build)
- [x] **Database migration tests:** Regression test for migration 003 ordering
- [x] **RBAC access guard tests:** Parametrized role-based auth matrix
- [x] **Field encryption tests:** Fernet encrypt/decrypt round-trip
- [x] **Production env validation tests:** Fail-fast on missing env vars
- [x] **API contract tests** — 35 tests covering response envelopes, validation errors, auth guards, OpenAPI schema, and content-type contracts
- [x] **Load testing** — 13 tests covering endpoint latency, average latency over 20 samples, concurrent load (10 users x 5 requests), mixed endpoint stress, and error rate under 100-request stress
- [x] **A11y audit** — 13 Playwright + axe-core tests covering WCAG 2.1 AA compliance across 10 public pages, form labels, keyboard navigation, image alt text, landmark structure, and color contrast

---

## 📊 Key Metrics

| Metric | Current |
| -------- | --------- |
| Backend API endpoints | 115+ |
| Frontend page components | 44 |
| AI agents | 10 |
| Database tables | 39+ |
| Database migrations | 8 |
| Test count (backend + frontend + sdk) | 800+ |
| Prometheus metrics | 10 families (HTTP, LLM, cache, embeddings, WS) |
| TypeScript SDK | `@onramp/sdk` (chat, stream, embeddings, agents, usage) |
| API contract tests | 31 (response schemas, validation, OpenAPI) |
| Load/performance tests | 12 (latency, concurrent, stress) |
| Lighthouse-style perf tests | 8 (FCP, DCL, DOM, console errors) |
| Bundle size analysis | 5 budgets (JS, CSS, HTML, max chunk) |
| E2E Playwright tests | 65+ (auth, dashboard, review-queue, explore, team, billing, a11y) |
| k6 load test script | 1 (public + auth endpoints) |
| CI/CD pipelines | 3 (backend + frontend + PR review) |
| Auth providers | 4 (email, Google OAuth, GitHub OAuth, SSO/SAML) |
| Notification event types | 14 |
| Integration services | 7 (Slack, GitHub, Webhooks, Jira, Linear, GitLab, Bitbucket) |
| Design tokens (CSS vars) | 50+ |

---

*This roadmap is a living document. Items are re-prioritized based on user feedback and business needs.*
