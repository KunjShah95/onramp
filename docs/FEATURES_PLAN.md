# Onramp 2.0 — Features Implementation Plan

> **Detailed task breakdown aligned with the phased convergence strategy.**
> Maps every feature to its roadmap phase (v1.2 → v2.0) with implementation details,
> file changes, and acceptance criteria.

**Last updated:** July 2026
**Roadmap:** [ROADMAP.md](../ROADMAP.md)

---

## Table of Contents

- [Legend](#legend)
- [Phase Map: FEATURES_PLAN → ROADMAP](#phase-map-features_plan--roadmap)
- [v1.2: Production Launch & Polish (Month 1)](#v12-production-launch--polish-month-1)
- [v1.3: Enterprise + AI Acceleration (Month 2)](#v13-enterprise--ai-acceleration-month-2)
- [v1.4: Platform & Scale (Month 3)](#v14-platform--scale-month-3)
- [v2.0: Enterprise GA (Month 4+)](#v20-enterprise-ga-month-4)
- [Stretch / Viral Features](#stretch--viral-features)
- [Feature Dependency Map](#feature-dependency-map)
- [Effort Summary](#effort-summary)
- [Appendix: Previously Completed Inventory](#appendix-previously-completed-inventory)

---

## Legend

| Mark | Meaning |
| ------ | --------- |
| ✅ | Completed |
| 🟢 | Not started — ready to build |
| 🟡 | Partially built — needs completion |
| 🔴 | Blocked — requires dependency first |

---

## Phase Map: FEATURES_PLAN → ROADMAP

| FEATURES_PLAN ID | Feature | Old Priority | Old Status | New Phase | New Status |
| --- | --- | --- | --- | --- | --- |
| #1 | Real Razorpay Billing Webhook | P0 | ✅ Done | — | ✅ Done |
| #2 | Production Deployment | P0 | 🟡 Partial | **v1.2** | 🟢 Ready |
| #3 | E2E / Integration Tests (Frontend) | P0 | 🟡 Partial | **v1.2** | 🟢 Ready |
| #4 | Interactive Repo Visualization | P1 | 🟡 Partial | **v1.2** | 🟢 Ready |
| #5 | Knowledge Quizzes | P1 | 🟢 Not started | — | ✅ Done (v1.1) |
| #6 | Gamification System | P1 | 🟢 Not started | — | ✅ Done (v1.1) |
| #7 | Weekly Digest Email | P1 | 🟢 Not started | **deferred** | 🟢 Ready |
| #8 | SSO/SAML Authentication | P2 | 🟢 Not started | **v1.3** | 🟢 Ready |
| #9 | React Query Integration | P2 | ✅ Done | — | ✅ Done |
| #10 | Performance Optimization | P2 | 🟢 Not started | **v1.4** | 🟢 Ready |
| #11 | VS Code Extension | P2 | 🟢 Not started | **v1.4** | 🟢 Ready |
| #12 | Module-Level RBAC Refinement | P2 | 🟡 Partial | **deferred** | ✅ Done (basic) |
| #13 | Playbook Marketplace | P3 | 🟢 Not started | **v1.3** | 🟢 Ready |
| #14 | SOC 2 Compliance Reporting | P3 | 🟢 Not started | **v2.0** | 🟢 Ready |
| #15 | Mobile Companion App | P3 | 🟢 Not started | **v1.4** | 🟢 Ready |
| #16 | AIaaS API Gateway | P4 | 🟡 Partial | **v1.4** | 🟡 Partial |
| #17 | TypeScript SDK Expansion | P4 | 🟢 Not started | **v1.4** | 🟢 Ready |
| #18 | "Senior Dev Roast" Mode | P5 | 🟢 Not started | **v1.3** | 🟢 Ready |
| #19 | DevScore Leaderboard | P5 | 🟢 Not started | **v2.0** | 🟢 Ready |
| #20 | Codebase Trailer | P5 | 🟢 Not started | **stretch** | 🟢 Ready |
| #21 | "Hot Take" PR Review | P5 | 🟢 Not started | **stretch** | 🟢 Ready |
| #22 | Loading Skeletons | Polish | ✅ Done | — | ✅ Done |
| #23 | Toast Notification System | Polish | ✅ Done | — | ✅ Done |
| #24 | Accessibility Audit | Polish | 🟢 Not started | — | ✅ Done (v1.2) |
| #25 | Dark Mode Consistency | Polish | 🟢 Not started | **stretch** | 🟢 Ready |
| #26 | Billing Idempotency | Quick Win | ✅ Done | — | ✅ Done |
| #27 | Waitlist CORS Fix | Quick Win | ✅ Done | — | ✅ Done |
| #28 | Load More / Infinite Scroll | Quick Win | 🟢 Not started | **v1.2** | 🟢 Ready |

### New items added by phased roadmap (not in original FEATURES_PLAN)

| New Item | Phase | Priority |
| ---------- | ------- | ---------- |
| Real-time WebSocket notifications | v1.2 | Critical |
| Milestone tracking with roadmap view | v1.2 | High |
| Session refresh & remember-me | v1.2 | High |
| Mobile-responsive views (2 waves) | v1.2 | High |
| GitLab & Bitbucket repo support | v1.2 | Medium |
| Ollama local model support | v1.2 | Medium |
| PR review auto-apply suggestions | v1.2 | Medium |
| API contract tests | v1.2 | ✅ Done |
| Load testing | v1.2 | ✅ Done |
| Frontend E2E tests | v1.2 | High |
| CI/CD auto PR review on push | v1.3 | High |
| Team velocity & DORA metrics | v1.3 | High |
| Jira / Linear ticket sync | v1.3 | Medium |
| Architecture drift detection | v1.3 | Medium |
| Domain-based SSO routing | v1.3 | High |
| Real-time audit log UI | v1.3 | High |
| HMAC-SHA256 API key hashing | v1.3 | High |
| Usage-based pricing tier | v1.3 | Medium |
| Team-level feature flags | v1.3 | Medium |
| Autonomous coding agent (sandboxed) | v1.4 | High |
| Usage-based billing metering | v1.4 | High |
| PWA mobile app | v1.4 | Medium |
| Performance / Lighthouse optimization | v1.4 | High |
| PostgreSQL read replicas | v1.4 | High |
| Redis caching layer | v1.4 | High |
| SOC 2 Type II readiness | v2.0 | Critical |
| Third-party penetration test | v2.0 | Critical |
| Secrets vault integration | v2.0 | High |
| Immutable audit trail | v2.0 | High |
| SCIM provisioning | v2.0 | High |
| Hard tenant isolation (RLS) | v2.0 | Critical |
| Data residency controls | v2.0 | High |
| Self-hosted Helm chart | v2.0 | High |
| Multi-org namespace isolation | v2.0 | High |
| Plugin system for custom agents | v2.0 | Medium |
| Agent MCP support | v2.0 | Medium |
| Custom enterprise roles | v2.0 | Medium |
| Prometheus/Grafana monitoring | v2.0 | Medium |
| Structured JSON logging | v2.0 | Medium |

---

## v1.2: Production Launch & Polish (Month 1)

**Theme:** Foundation — ship to production, close UX gaps, set up for scale
**Est. effort:** 2–3 weeks

---

### 1. Production Deployment

**Status:** 🟢 Ready — blockers documented in `PRODUCTION_AUDIT.md`
**Effort:** 2 days (devops)

**What's done:**

- Docker Compose (dev + prod), Nginx, K8s manifests, CI/CD configs all exist
- `DEPLOYMENT.md` documents Railway + Vercel path
- `PRODUCTION_AUDIT.md` identifies all blockers

**What remains:**

**P0 — Boot blockers (fixed):**

- [x] Add `PII_ENCRYPTION_KEY` to `docker-compose.prod.yml` backend env block
- [x] Add `GITHUB_TOKEN_ENCRYPTION_KEY` to `docker-compose.prod.yml`
- [x] Add `GITHUB_TOKEN` to `docker-compose.prod.yml`
- [x] Fix `JWT_SECRET` vs `JWT_SECRET_KEY` naming mismatch — standardized on `JWT_SECRET` across docker-compose, K8s, .env.example, and docs
- [x] Construct `REDIS_URL` from Redis vars in `docker-compose.prod.yml`
- [x] Add `TRUST_PROXY=true` to `docker-compose.prod.yml` (Railway requirement)
- [x] Extend `_validate_production_env()` in `main.py` to check `JWT_SECRET` + `PII_ENCRYPTION_KEY`
- [x] Add pre-deploy env validation + smoke test to CD pipeline
- ➡️ Set up `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` in GitHub secrets (manual)
- ➡️ Set up `RENDER_DEPLOY_HOOK_URL` in GitHub secrets (manual)

**P1 — Pending:**

- [ ] Update `allow_origin_regex` in `main.py` to include custom domain patterns
- [ ] Add Nginx security headers (CSP, HSTS, X-Frame-Options) to `nginx.conf`
- [ ] Update Dockerfile from `python:3.11` to `python:3.12`

**Files modified:**

- `docker-compose.prod.yml` — Added `PII_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `GITHUB_TOKEN`, `TRUST_PROXY=true`, `REDIS_URL` construction
- `.env.example` (root) — Added all missing env vars with defaults
- `backend/app/main.py` — Extended `_validate_production_env()` with `JWT_SECRET`, `PII_ENCRYPTION_KEY`, plus insecure-default detection
- `.github/workflows/cd.yml` — Added pre-deploy env validation + post-deploy smoke tests

---

### 2. Frontend E2E Tests

**Status:** 🟢 Ready
**Effort:** 2 days (frontend E2E)

**Description:**
Cover key user journeys with Playwright. Existing `web/e2e/` has auth, dashboard, and review-queue specs with mocks.

**Needed:**

- [ ] Login → Dashboard loads → stats visible
- [ ] Navigate to Explore → enter repo URL → submit → results displayed
- [ ] Team management: create team → invite member → verify invite created
- [ ] Billing flow: select tier → checkout redirect → webhook → subscription active
- [ ] Settings: update profile name → verify save confirmation toast
- [ ] Run in CI pipeline (`frontend.yml`)

**Files to modify:**

- `web/e2e/` — New spec files for each flow
- `web/e2e/mocks.ts` — Add mock data for billing, team, settings
- `.github/workflows/frontend.yml` — Add Playwright step

---

### 3. Real-time WebSocket Notifications

**Status:** 🟢 Ready
**Effort:** 3 days (backend 2d + frontend 1d)

**Description:**
Push task updates (assigned, reviewed, approved) to connected clients via WebSocket. Fall back to polling when WebSocket disconnects.

**Implementation Details:**

- Backend: Add WebSocket endpoint `/api/v1/ws/notifications` using FastAPI's WebSocket support
  - Authenticate via token query param
  - Maintain connection registry per user
  - On task state change, push notification to connected clients
- Frontend: Add WebSocket hook `useWebSocket.ts`
  - Connect on app mount (when authed)
  - Reconnect on disconnect with exponential backoff
  - Feed notifications into existing `NotificationBell` component
- Fallback: Keep existing polling as backup

**Files to create/modify:**

- `backend/app/api/v1/websocket.py` — WebSocket handler
- `backend/app/services/notification_service.py` — Add broadcast method
- `web/src/hooks/useWebSocket.ts` — WebSocket connection hook
- `web/src/components/ui/NotificationBell.tsx` — Accept push updates

**Acceptance Criteria:**

- [ ] WebSocket connects on login, disconnects on logout
- [ ] Task assignment triggers push notification within 1s
- [ ] Reconnect on disconnect works automatically
- [ ] Fallback polling works if WebSocket unavailable

---

### 4. Interactive Repo Visualization

**Status:** 🟢 Ready (ForceGraph exists, needs enhancement)
**Effort:** 2 days (frontend)

**Description:**
Upgrade the existing ForceGraph component with search, filter, drill-down, and tooltip interactions.

**Implementation Details:**

- [ ] Add search bar above graph to filter nodes by name (real-time)
- [ ] Add filter controls (show/hide by file type, module, dependency count)
- [ ] Add click-to-drill-down: clicking a node expands its dependency subgraph
- [ ] Add hover tooltips: module name, file count, dependency count
- [ ] Add smooth zoom/pan with D3 zoom behavior
- [ ] Add node color coding: file type (blue=Python, green=JS, orange=TS)

**Files to modify:**

- `web/src/components/ForceGraph.tsx` — All enhancements
- `web/src/pages/ExplorePage.tsx` — Wiring and layout

**Acceptance Criteria:**

- [ ] Search filters graph in real-time as user types
- [ ] Clicking a node shows details panel with file list
- [ ] Filter toggles show/hide node categories
- [ ] Zoom/pan works smoothly on all screen sizes

---

### 5. Milestone Tracking with Roadmap View

**Status:** 🟢 Ready
**Effort:** 2 days (frontend 1d + backend 1d)

**Description:**
A visual roadmap timeline showing onboarding milestones, their status, and dependencies. Trainees see their path ahead; seniors see team-wide progress.

**Implementation Details:**

- Backend: Extend `onboarding_plan_service.py` with milestone dependency graph
  - `GET /api/v1/onboarding-plans/{id}/roadmap` — Returns milestone DAG with status
- Frontend: Timeline component on `OnboardingPlanPage.tsx` + `TraineeDashboard.tsx`
  - Horizontal timeline with milestone nodes
  - Status: locked, available, in_progress, completed
  - Click a milestone to see required tasks

**Files to create/modify:**

- `backend/app/api/v1/onboarding_plans.py` — Add roadmap endpoint
- `backend/app/services/onboarding_plan_service.py` — Roadmap DAG logic
- `web/src/components/ui/RoadmapTimeline.tsx` — New timeline component
- `web/src/pages/OnboardingPlanPage.tsx` — Integrate timeline
- `web/src/pages/TraineeDashboard.tsx` — Integrate timeline

---

### 6. Session Refresh & Remember Me

**Status:** 🟢 Ready
**Effort:** 1 day (backend 0.5d + frontend 0.5d)

**Description:**
Persist login across browser closes. Currently JWT expires at 7 days with no refresh mechanism.

**Implementation Details:**

- Backend: Add refresh token endpoint `POST /api/v1/auth/refresh`
  - Short-lived access token (15 min) + long-lived refresh token (30 days, stored in DB)
  - Refresh token rotation (old token invalidated on each refresh)
- Frontend: Store refresh token in `localStorage`, access token in memory
  - Intercept 401 responses → attempt refresh → retry original request

**Files to create/modify:**

- `backend/app/api/v1/auth.py` — Add refresh token logic
- `backend/app/services/user_service.py` — Refresh token storage
- `web/src/context/AuthContext.tsx` — Token refresh interceptor
- `web/src/lib/api.ts` — HTTP interceptor for auto-refresh

---

### 7. Mobile-Responsive Views

**Status:** 🟢 Ready
**Effort:** 3 days (wave 1) + 3 days (wave 2)

**Description:**
Make all 44 page components usable on mobile. Tailwind responsive classes are partially used; many pages lack mobile breakpoints.

**Implementation Details:**

- **Wave 1 (core 10 pages):** Dashboard, Tasks, Explore, Team, Notifications, Settings, Profile, Login, Register, Landing
- **Wave 2 (remaining 34):** All other pages
- Per-page: Add `sm:` and `md:` breakpoint overrides
- Fix table overflow (horizontal scroll on data tables)
- Stack sidebar content vertically
- Ensure touch targets ≥ 44px

**Files to modify:**

- All 44 page components — responsive CSS classes
- `web/src/components/ui/Sidebar.tsx` — Collapsible on mobile
- `web/src/components/layout/Layout.tsx` — Mobile layout structure

---

### 8. GitLab & Bitbucket Repository Support

**Status:** 🟢 Ready
**Effort:** 3 days (backend)

**Description:**
Expand repo analysis beyond GitHub to support GitLab and Bitbucket. Uses existing architecture explorer infrastructure.

**Implementation Details:**

- Extend `github_service.py` → `git_service.py` (multi-provider)
- For GitLab: Use GitLab API (personal access token, project ID)
- For Bitbucket: Use Bitbucket Cloud API (app password)
- For all: Git clone via HTTPS (works for any public repo)

**Files to create/modify:**

- `backend/app/services/git_service.py` — Unified git service
- `backend/app/services/github_service.py` — Refactor as GitHub provider
- `backend/app/services/gitlab_service.py` — New GitLab provider
- `backend/app/services/bitbucket_service.py` — New Bitbucket provider

---

### 9. Ollama Local Model Support

**Status:** 🟢 Ready
**Effort:** 3 days (backend)

**Description:**
Allow users to run AI features using local Ollama models — critical for air-gapped/self-hosted deployments and cost reduction.

**Implementation Details:**

- Add `OLLAMA` provider to `llm.py` fallback chain
  - Reads `OLLAMA_BASE_URL` env var (default: `http://localhost:11434`)
  - Uses OpenAI-compatible API (Ollama serves OpenAI-compatible endpoints)
  - Model: configurable via `OLLAMA_MODEL` (default: `llama3`)
  - Priority: below NVIDIA (free), above OpenAI (paid)
- No dependencies to install — uses existing `AsyncOpenAI` client

**Files to modify:**

- `backend/app/llm.py` — Add `OLLAMA` provider to `ModelProvider` enum and config
- `backend/.env.example` — Add `OLLAMA_BASE_URL` and `OLLAMA_MODEL`

---

### 10. PR Review — Auto-Apply Suggestions

**Status:** 🟢 Ready
**Effort:** 3 days (backend 2d + frontend 1d)

**Description:**
AI reviews come with actionable fix suggestions. Users can auto-apply them as commit suggestions on the PR.

**Implementation Details:**

- Backend: Extend `PRReviewAgent` to generate `fix_suggestions`
  - Each suggestion: `{ file, line_start, line_end, original, suggested, explanation }`
  - Return in existing review response
- Frontend: Display suggestions inline on `PRDescriptionPage`
  - Each suggestion has an "Apply" button
  - "Apply All" bulk action

**Files to modify:**

- `backend/app/agents/pr_review.py` — Add fix suggestion generation
- `web/src/pages/PRDescriptionPage.tsx` — Display + apply suggestions

---

### 11. Load More Pagination (Quick Win)

**Status:** 🟢 Ready
**Effort:** 0.5 days (frontend)

**Description:**
Add pagination to TasksPage and NotificationsPage using existing Pagination component.

**Files to modify:**

- `web/src/pages/TasksPage.tsx` — Add Pagination component
- `web/src/pages/NotificationsPage.tsx` — Already has pagination via API, wire UI

---

### 12. CI/CD Test Expansion

**Status:** ✅ Contract + load tests now running in CI
**Effort:** ✅ Complete (backend)

**Description:**
Contract tests (35 tests) and load tests (13 tests) now run in dedicated named steps on every PR.

**What was done:**

- `backend.yml` split into 3 named steps: unit/integration, API contract, load/performance
- Contract tests get 30s timeout; load tests get 120s timeout (concurrent benchmarks)
- Contract + load tests excluded from main test run to avoid duplication

**Also done:**

- ✅ `pytest-cov` coverage reporting now configured across all 4 test steps (unit, contract, load, postgres) using `--cov-append` for aggregate coverage.xml output

**Remaining:**

- [ ] Add Playwright E2E + a11y tests to `frontend.yml` (separate task)

---

## v1.3: Enterprise + AI Acceleration (Month 2)

**Theme:** Enterprise foundation + AI differentiation
**Est. effort:** 3–4 weeks

---

### 13. SSO/SAML Authentication

**Status:** 🟢 Ready
**Effort:** 3 weeks (backend 1.5w + frontend 1.5w)

**Description:**
Single Sign-On via SAML/SSO for enterprise customers. Support Okta, Azure AD (Entra ID), and Google Workspace.

**Implementation Details:**

- Integrate `python3-saml` or use WorkOS for faster implementation
- New API endpoints:
  - `POST /api/v1/auth/sso/configure` — Save IdP config
  - `GET /api/v1/auth/sso/login/{team_id}` — Initiate SSO login
  - `POST /api/v1/auth/sso/callback` — IdP callback handler
- Frontend: SSO configuration page in Team Settings
  - Upload metadata XML or enter fields manually
  - Test connection button
  - Enable/disable SSO for team
- Domain-based routing: auto-detect IdP from email domain

**Files to create:**

- `backend/app/services/sso_service.py`
- `web/src/pages/Settings.tsx` — SSO config section

---

### 14. Team Velocity & DORA Metrics

**Status:** 🟢 Ready
**Effort:** 3 days (backend 2d + frontend 1d)

**Description:**
Add engineering team analytics — cycle time, deployment frequency, mean time to recovery (MTTR), change failure rate.

**Implementation Details:**

- New dashboard endpoint: `GET /api/v1/dashboard/dora/{team_id}`
- Compute from existing task + PR data
- Frontend: New analytics tab on DashboardPage with trend charts

---

### 15. CI/CD Auto PR Review on Push

**Status:** 🟢 Ready
**Effort:** 3 days (devops + backend)

**Description:**
GitHub Action that triggers an Onramp PR review when a PR is opened/updated.

**Implementation Details:**

- New GitHub Action: `.github/actions/onramp-review/action.yml`
- On `pull_request` event → call Onramp API with PR diff
- Post review as PR comment via GitHub API

---

### 16. Architecture Drift Detection

**Status:** 🟢 Ready
**Effort:** 4 days (backend 3d + frontend 1d)

**Description:**
Monitor repos for divergence from documented architecture. Alert on drift.

**Implementation Details:**

- Compare current repo structure against last architecture analysis
- Flag: new modules, removed modules, dependency changes, circular deps
- Alert via notification when drift > threshold

---

### 17. Community Playbook Marketplace

**Status:** 🟢 Ready
**Effort:** 4 days (backend 2d + frontend 2d)

**Description:**
Marketplace for sharing onboarding playbooks. Search, import, rate, publish.

**Implementation Details:** — see original FEATURES_PLAN #13

---

### 18. Senior Dev Roast Mode

**Status:** 🟢 Ready
**Effort:** 1 day (frontend + backend)

**Description:**
Toggle in Q&A chat that makes AI respond with sarcastic but accurate code criticism.

**Implementation Details:** — see original FEATURES_PLAN #18

---

### 19. Jira / Linear Ticket Sync

**Status:** 🟢 Ready
**Effort:** 4 days (backend 3d + frontend 1d)

**Description:**
Bi-directional sync between Onramp tasks and Jira/Linear tickets.

**Implementation Details:**

- New integrations: `backend/app/services/jira_service.py`, `linear_service.py`
- Webhook handlers for Jira/Linear events → update Onramp task status
- Outbound sync: Onramp task state changes → update Jira/Linear ticket
- Frontend: Integration config page in Settings with OAuth flow

---

### 20. Real-Time Audit Log UI + HMAC-SHA256 Keys

**Status:** 🟢 Ready
**Effort:** 4 days (backend 3d + frontend 1d)

**Description:**
SIEM-exportable audit event viewer + upgrade API key hashing from unsalted SHA-256 to HMAC-SHA256.

---

## v1.4: Platform & Scale (Month 3)

**Theme:** Open the platform, ship AI SDK, scale infrastructure
**Est. effort:** 3–4 weeks

---

### 21. Autonomous Coding Agent (Sandboxed)

**Status:** 🟢 Ready
**Effort:** 4 weeks (backend 3w + frontend 1w)

**Description:**
Assign a GitHub Issue → AI implements the fix → opens a PR with the solution. Sandboxed execution for safety.

**Implementation Details:**

- New agent: `backend/app/agents/autonomous_agent.py`
- Pipeline: Understand issue → plan → implement → test → open PR
- Sandbox: Docker container with limited network/filesystem
- PR contains: implementation, tests, documentation update

---

### 22. AIaaS Public API Gateway + TypeScript SDK

**Status:** 🟡 Partial (API key infra exists, endpoints need decoupling)
**Effort:** 5 days

**Description:**
Package AI agents as first-class public APIs. Publish `@onramp/sdk` to npm.

**Implementation Details:** — see original FEATURES_PLAN #16 and #17

---

### 23. VS Code Extension

**Status:** 🟢 Ready
**Effort:** 3 days

**Description:**
Bring Onramp features into VS Code — inline explanations, PR reviews, learning paths.

**Implementation Details:** — see original FEATURES_PLAN #11

---

### 24. PWA Mobile App

**Status:** 🟢 Ready
**Effort:** 2 weeks

**Description:**
Progressive Web App for on-the-go access — push notifications, quick Q&A, progress.

**Implementation Details:** — see original FEATURES_PLAN #15 (Option A)

---

### 25. Performance Optimization & Scaling

**Status:** 🟢 Ready
**Effort:** 3 days (backend 1.5d + frontend 1.5d)

**Description:**
Profile and optimize hot paths: API response times, DB queries, frontend bundle size, infrastructure scaling.

**Implementation Details:**

- PostgreSQL read replicas + connection pooling (pgBouncer)
- Redis caching layer for frequent endpoints (repo analysis results)
- Response compression (gzip/brotli) at Nginx level
- CDN for static assets (via Vercel Edge Network)
- Lighthouse audit → p95 API < 500ms, bundle < 200KB gzipped
- Load testing CI gate — run `test_load_performance.py` in CI, fail on regression
- Backend: Profile with cProfile/py-spy, optimize N+1 queries, add DB indexes
- Frontend: Lazy load heavy components, image optimization, bundle analysis

---

## v2.0: Enterprise GA (Month 4+)

**Theme:** Enterprise-grade compliance, horizontal scaling, ecosystem
**Est. effort:** 6–8 weeks

---

### 26. SOC 2 Type II Readiness

**Status:** 🟢 Ready
**Effort:** Ongoing

**Key activities:**

- Evidence collection for all 5 trust service criteria
- Access review process documentation
- Change management procedures
- Vendor risk questionnaire automation

---

### 27. Hard Tenant Isolation (RLS)

**Status:** 🟢 Ready
**Effort:** 2 weeks

**Description:**
PostgreSQL Row-Level Security or per-tenant database to create a hard security boundary between customers.

---

### 28. Enterprise Compliance Package

**Items:** SCIM provisioning, immutable audit trail, data residency controls, secrets vault integration, third-party penetration test, Helm chart for self-hosted deployment, multi-org namespace isolation

**Status:** 🟢 All items ready
**Effort:** Combined ~12 weeks

---

### 29. Ecosystem Items

**Items:** Plugin system for custom AI agents, Agent MCP support, custom enterprise roles, Prometheus/Grafana monitoring, structured JSON logging

**Status:** 🟢 All items ready
**Effort:** Combined ~8 weeks

---

## Stretch / Viral Features

Quick wins that can be slotted into any release:

| Feature | Effort | Dependencies |
| --------- | -------- | ------------- |
| Codebase trailer — auto-generated movie trailer for any repo | 1 day | ArchitectureExplorer |
| Hot Take PR review — personality-driven one-liner summary | 0.5 day | PRReviewAgent |
| DevScore leaderboard — weekly XP rankings | 1 day | Gamification engine |
| Dark mode consistency audit across all 4 themes | 0.5 day | None |

---

## Feature Dependency Map

```
v1.2 ─────────────────────────────────────────────────────────────
│
├── 🔴 Production Deployment (blocked by 7 P0 items)
├── 🟢 Real-time WebSocket notifications
├── 🟢 Interactive repo visualization
├── 🟢 Milestone roadmap view
├── 🟢 Session refresh & remember-me
├── 🟢 Mobile-responsive (wave 1: 10 pages)
├── 🟢 GitLab & Bitbucket support
├── 🟢 Ollama local model support
├── 🟢 PR review auto-apply
├── 🟢 E2E tests + CI test expansion
├── 🟢 Load more pagination
├── ✅ API contract tests (35 tests)
├── ✅ Load testing (13 tests)
└── ✅ A11y audit (13 axe-core tests)

v1.3 ─────────────────────────────────────────────────────────────
│
├── 🟢 SSO/SAML (Okta + Azure AD)
├── 🟢 Domain-based routing
├── 🟢 Real-time audit log UI
├── 🟢 HMAC-SHA256 API key hashing
├── 🟢 Team velocity & DORA metrics
├── 🟢 CI/CD auto PR review on push
├── 🟢 Jira / Linear ticket sync
├── 🟢 Architecture drift detection
├── 🟢 Community playbook marketplace
├── 🟢 Usage-based pricing tier
├── 🟢 Team-level feature flags
└── 🟢 Senior Dev Roast mode

v1.4 ─────────────────────────────────────────────────────────────
│
├── 🟢 Autonomous coding agent (4 weeks)
├── 🟢 AIaaS API gateway
├── 🟢 TypeScript SDK → npm
├── 🟢 Usage-based billing metering
├── 🟢 VS Code extension
├── 🟢 PWA mobile app
├── 🟢 Performance optimization
├── 🟢 PostgreSQL read replicas
├── 🟢 Redis caching layer
├── 🟢 Lighthouse audit + bundle optimization
└── 🟢 CDN + load testing CI gate

v2.0 ─────────────────────────────────────────────────────────────
│
├── 🔴 SOC 2 Type II readiness (ongoing)
├── 🔴 Hard tenant isolation (RLS)
├── 🟢 Immutable audit trail
├── 🟢 SCIM provisioning
├── 🟢 Data residency controls
├── 🟢 Secrets vault integration
├── 🟢 Self-hosted Helm chart
├── 🟢 Plugin system for custom agents
├── 🟢 Agent MCP support
├── 🟢 Custom enterprise roles
├── 🟢 Prometheus/Grafana monitoring
└── 🟢 Structured JSON logging

Stretch ──────────────────────────────────────────────────────────
├── 🟢 Codebase trailer
├── 🟢 Hot Take PR review
├── 🟢 DevScore leaderboard
└── 🟢 Dark mode consistency
```

---

## Effort Summary (Remaining)

| Phase | Features | Total Effort |
| ------- | ---------- | ------------- |
| **v1.2** | 12 features (6 P0, 6 other) | ~2–3 weeks |
| **v1.3** | 9 features | ~3–4 weeks |
| **v1.4** | 7 features | ~3–4 weeks |
| **v2.0** | 12 features | ~6–8 weeks |
| **Stretch** | 4 features | ~3 days |
| **Total remaining** | **~40 items** | **~14–19 weeks** |

---

## Appendix: Previously Completed Inventory

### ✅ Done (original FEATURES_PLAN)

| ID | Feature | Shipped In |
| ---- | --------- | ----------- |
| #1 | Real Razorpay Billing Webhook | v1.0 |
| #5 | Knowledge Quizzes (QuizGenerator agent) | v1.1 |
| #6 | Gamification System (XP, badges, streaks) | v1.1 |
| #9 | React Query Integration | v1.1 |
| #22 | Loading Skeletons for All Pages | v1.1 |
| #23 | Toast Notification System | v1.1 |
| #24 | Accessibility Audit (axe-core tests) | v1.2 |
| #26 | Billing API Idempotency | v1.1 |
| #27 | Waitlist CORS Fix | v1.1 |

### ✅ Done (new — created during v1.2 prep)

| Feature | Tests | Status |
| --------- | ------- | -------- |
| API contract tests | 35 tests in `test_api_contract.py` | ✅ Done |
| Load / performance tests | 13 tests in `test_load_performance.py` | ✅ Done |
| A11y audit tests | 13 tests in `web/e2e/a11y.spec.ts` using `@axe-core/playwright` | ✅ Done |
| Production audit | `docs/PRODUCTION_AUDIT.md` with 14 blockers identified | ✅ Done |

---

_This plan is aligned with ROADMAP.md (July 2026). Features may be re-prioritized based on user feedback and business needs._
