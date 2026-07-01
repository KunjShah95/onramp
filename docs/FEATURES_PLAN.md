# CodeFlow 2.0 — Features Implementation Plan

> **What needs to be built next.** This document catalogs all features that are planned but not yet implemented, organized by priority and category. Updated to reflect completed work from recent implementation sessions.

**Date:** 2026-06-30 (Refreshed)
**Current Completion:** ~90%

---

## Table of Contents

- [Understanding This Plan](#understanding-this-plan)
- [P0: Immediate (Production Launch Blockers)](#p0-immediate-production-launch-blockers)
- [P1: Engagement Features](#p1-engagement-features)
- [P2: Enterprise & Scale](#p2-enterprise--scale)
- [P3: Platform & Ecosystem](#p3-platform--ecosystem)
- [P4: AIaaS API Expansion](#p4-aiaas-api-expansion)
- [P5: Viral/Demo Features](#p5-viraldemo-features)
- [Infrastructure & Polish](#infrastructure--polish)
- [Quick Wins (New)](#quick-wins-new)
- [Feature Dependency Map](#feature-dependency-map)
- [Appendix: Complete Built vs Unbuilt Inventory](#appendix-complete-built-vs-unbuilt-inventory)

---

## Understanding This Plan

### Legend

| Mark | Meaning |
|------|---------|
| ✅ | Completed — ready for production |
| 🟢 | Not started — ready to build |
| 🟡 | Partially built — needs completion |
| 🔴 | Blocked — requires dependency first |
| ⚪ | Research needed before starting |

### How to Read Each Entry

Each feature is documented as:

```
## Feature Name
Priority: P0 | P1 | P2 | P3 | P4 | P5 | Polish
Status: 🟢 Not Started | 🟡 Partial | ✅ Done
Dependencies: [feature names it depends on]
Effort: X days (backend) + Y days (frontend)

Description:
What this feature does and why it matters.

Implementation Details:
- Specific code changes
- Files to modify or create
- API endpoints to add
- Data model changes

Acceptance Criteria:
- [ ] Specific, testable outcomes
```

---

## P0: Immediate (Production Launch Blockers)

These must be completed before the platform can be considered production-ready.

---

### 1. Real Stripe Billing Webhook

**Priority:** P0 — **Critical**
**Status:** ✅ Done
**Dependencies:** None
**Effort:** 2 days (backend)

**What was built:**

- Idempotency support via `Idempotency-Key` header — duplicate event prevention
- Event audit log (`codeflow_webhook_events` collection) with query API
- Async-safe `stripe.Webhook.construct_event` wrapped in `asyncio.to_thread`
- Sentry error reporting for webhook failures
- Additional event types: `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.trial_will_end`, `setup_intent.created`
- Comprehensive test suite: 20 tests covering all event types, idempotency, audit log, edge cases

---

### 2. Production Deployment

**Priority:** P0 — **Critical**
**Status:** 🟡 Partial — Docker configs exist, Kubernetes manifests exist, not deployed
**Dependencies:** Stripe webhook ✅
**Effort:** 2 days (devops)

**Description:**
The platform has all infrastructure configs (Docker Compose, Dockerfile, Nginx, K8s, Terraform) but has not been deployed to production. This blocks all real-world usage.

**Implementation Details:**

- **Frontend:** Deploy to Vercel with `VITE_API_URL` pointing to production backend
  - Configure custom domain, HTTPS
  - Set up environment variables in Vercel dashboard
  - Connect GitHub repo for auto-deploy on `main` push
- **Backend:** Deploy to Render or Railway
  - Set up Dockerized FastAPI service
  - Configure all env vars: `DATABASE_URL`, `SECRET_KEY`, `SENTRY_DSN`, `STRIPE_*`, `OPENAI_API_KEY`, etc.
  - Apply Alembic migrations on deploy
- **Database:** PostgreSQL instance (via Render, Railway, or AWS RDS)
  - Apply initial schema via `alembic upgrade head`
  - Configure automated backups
  - Set up connection pooling (pgBouncer optional)
- **Redis:** For distributed rate limiting and caching (via Redis Cloud or built-in on Railway)
- **Firebase:** Production project with authentication enabled
  - Configure authorized domains
  - Set up service account for production
- **CI/CD:** Wire GitHub Actions
  - Backend: Build Docker → push to registry → deploy
  - Frontend: Vercel auto-deploys on push
  - `deploy.sh` / `deploy.ps1` scripts ready

**Files to use:**

- `docker-compose.prod.yml` — Production Docker stack
- `nginx.prod.conf` — Production Nginx config
- `kubernetes/` — K8s manifests (if using K8s)
- `infrastructure/terraform/` — If using GCP
- `deploy.sh` — Deploy script
- `scripts/deploy-prod.sh` — Production deploy script

**Acceptance Criteria:**

- [ ] Frontend accessible at custom domain via HTTPS
- [ ] Backend API responds at `/health` with 200
- [ ] Wallet onboarding flow works end-to-end
- [ ] CI/CD pipeline deploys on git push to main

---

### 3. E2E / Integration Tests (Frontend)

**Priority:** P0 — **Critical**
**Status:** 🟡 Partial — backend integration tests for full onboarding flow exist, frontend E2E pending
**Dependencies:** None
**Effort:** 2 days (frontend E2E)

**Description:**
The project has **222 unit tests + 2 integration tests** passing. The backend full onboarding flow is covered (manager creates team → invites → user joins → creates tasks → completes → modules unlock → report generated). Frontend E2E coverage across key user journeys is still missing.

**What was built:**

- `backend/tests/integration/test_full_onboarding_flow.py` — comprehensive flow:
  - Create team → create playbook → invite user → accept invite
  - Generate learning path → create 2 tasks → complete both
  - Verify modules auto-unlocked → generate report → verify playbook usage count
  - Simplified variant: create tasks without full path generation

**Still needed:**

- **Frontend E2E with Playwright:**
  - Login → Dashboard loads → stats visible
  - Navigate to Explore → enter repo URL → submit → results displayed
  - Team management: create team → invite member via email → verify invite created
  - Billing flow: select tier → checkout redirect → webhook fires → subscription active
  - Settings: update profile name → verify save confirmation toast
- **Test structure:**
  - `web/e2e/` directory with Playwright config
  - Page Object Model for reusable selectors
  - Auth setup via Firebase custom token for test users

**Acceptance Criteria:**

- [ ] Login → Dashboard navigation flow passes
- [ ] Explore → Analyze repo → view results flow passes
- [ ] Team create → invite → member joins flow passes
- [ ] Settings save → toast appears flow passes
- [ ] Runs in CI pipeline in < 5 minutes

---

## P1: Engagement Features

High-impact features that drive user engagement and retention.

---

### 4. Interactive Repo Visualization

**Priority:** P1 — **High**
**Status:** 🟡 Partial — ForceGraph component exists, d3-force is installed
**Dependencies:** None
**Effort:** 2 days (frontend)

**Description:**
The Explore page has a basic forced-directed graph from `d3-force`, but it lacks search, filter, drill-down, and tooltip interactions. Users need to be able to search for a module, filter by type, click a node to see details, and zoom/pan naturally.

**Implementation Details:**

- Add search bar above the graph to filter nodes by name
- Add filter controls (show/hide by file type, module, dependency count)
- Add click-to-drill-down: clicking a node expands its dependency subgraph
- Add hover tooltips showing module name, file count, dependency count
- Add smooth zoom/pan with D3 zoom behavior
- Add node color coding by: file type (blue=Python, green=JS, orange=TS), module (color by community), dependency count (gradient)

**Files to modify:**

- `web/src/components/ForceGraph.tsx`
- `web/src/pages/ExplorePage.tsx`

**Acceptance Criteria:**

- [ ] Search filters graph in real-time as user types
- [ ] Clicking a node shows details panel with file list
- [ ] Filter toggles show/hide node categories
- [ ] Zoom/pan works smoothly on all screen sizes

---

### 5. Knowledge Quizzes

**Priority:** P1 — **High**
**Status:** 🟢 Not started
**Dependencies:** None (uses existing LLM infrastructure)
**Effort:** 2 days (backend 1d + frontend 1d)

**Description:**
AI-generated multiple-choice quizzes from the codebase. After completing a learning module, the trainee takes a quiz about the code they studied. Quizzes test understanding and identify knowledge gaps.

**Implementation Details:**

- New agent: `QuizGenerator` in `backend/app/agents/quiz_generator.py`
  - Takes repo structure + module name as input
  - Generates 5-10 multiple-choice questions with LLM
  - Each question: question text, 4 options, correct answer, explanation
  - Cached per module to avoid regenerating
- New API endpoint: `POST /api/v1/learn/quiz`
  - Input: `{ "path_id": "...", "module_index": 2 }`
  - Output: `{ "questions": [...], "quiz_id": "..." }`
  - Follow existing agent pattern from `learning_path_generator.py`
- New API endpoint: `POST /api/v1/learn/quiz/submit`
  - Input: `{ "quiz_id": "...", "answers": [0, 2, 1, ...] }`
  - Output: `{ "score": 8, "total": 10, "passed": true, "wrong": [...] }`
- Store quiz results in existing `codeflow_subscriptions` collection or new `codeflow_quiz_results` collection
- Frontend: Quiz modal on LearnPage after module completion
  - Question carousel with progress dots
  - Show correct/incorrect after each answer
  - Summary screen with score and review

**Acceptance Criteria:**

- [ ] Quiz generates 5-10 questions from codebase content
- [ ] Questions are unique per generation attempt
- [ ] Quiz submission returns score with correct/incorrect breakdown
- [ ] Passing threshold (70%) configurable
- [ ] Frontend shows quiz as step after module completion

---

### 6. Gamification System

**Priority:** P1 — **High**
**Status:** 🟢 Not started
**Dependencies:** Knowledge Quizzes (quiz scores feed XP)
**Effort:** 3 days (backend 1.5d + frontend 1.5d)

**Description:**
XP points, badges, and streaks to make onboarding addictive. Each learning activity earns XP. Milestones unlock badges. Daily streaks encourage consistent progress.

**XP Sources:**

| Activity | XP | Limit |
|----------|----|-------|
| Learning module completed | +50 | Per module |
| Quiz passed (70%+) | +10 | Per quiz |
| Quiz perfect score (100%) | +25 | Per quiz |
| First PR merged | +200 | Once |
| Task completed | +30 | Per task |
| Question asked in Q&A | +5 | Per day |
| Playbook created | +100 | Per playbook |
| Daily login streak (day 1) | +5 | Once/day |
| Daily login streak (day 7) | +25 | Once/day |
| Daily login streak (day 30) | +100 | Once/day |

**Badges:**

| Badge | Requirement | XP Bonus |
|-------|-------------|----------|
| 🗺️ Explorer | Analyze 3 repos | +50 |
| 📚 Scholar | Complete 5 learning modules | +100 |
| 🐛 Squasher | Merge first PR | +200 |
| 🔥 Streak Master | 7-day login streak | +100 |
| ⚡ Speed Runner | Complete onboarding in < 2 weeks | +500 |
| 🏆 Code Champion | 1000+ XP | +1000 |

**Implementation Details:**

- New service: `backend/app/services/gamification_service.py`
  - `award_xp(user_id, source, amount)` — Award XP with daily caps
  - `check_badges(user_id)` — Check and award new badges
  - `get_leaderboard(team_id, period)` — Weekly/monthly/all-time
  - `get_streak(user_id)` — Current streak and next milestone
- New API endpoints:
  - `GET /api/v1/gamification/xp/{user_id}` — XP total and breakdown
  - `GET /api/v1/gamification/badges/{user_id}` — Earned badges
  - `GET /api/v1/gamification/leaderboard/{team_id}` — Team leaderboard
  - `GET /api/v1/gamification/streak/{user_id}` — Streak info
- Frontend: Gamification tab on TraineeDashboard
  - XP progress bar with next milestone
  - Badge showcase with locked/unlocked states
  - Weekly leaderboard for the team
  - Streak indicator with fire emoji 🔥

**Acceptance Criteria:**

- [ ] XP awarded correctly for all activity types with daily caps
- [ ] Badges auto-award when conditions met
- [ ] Leaderboard sorts by XP and resets weekly
- [ ] Streak tracks consecutive daily logins
- [ ] Frontend shows gamification UI on TraineeDashboard

---

### 7. Weekly Digest Email

**Priority:** P1 — **High**
**Status:** 🟢 Not started
**Dependencies:** SendGrid integration (exists in requirements.txt)
**Effort:** 1.5 days (backend)

**Description:**
Auto-generated weekly email summarizing team learning progress. Sent to managers and optionally to trainees. Includes completion stats, top performers, pending reviews, and recent activity.

**Implementation Details:**

- New service: `backend/app/services/digest_service.py`
  - `generate_team_digest(team_id)` — Compile weekly stats
  - `generate_trainee_digest(user_id)` — Personal weekly recap
  - `send_digests()` — Batch send to all subscribed users
- Digest content:
  - **Manager digest:** Team completion % change, pending reviews count, top trainee by XP, modules completed this week, tasks overdue
  - **Trainee digest:** Personal progress % change, modules completed, XP earned, badges earned, tasks for next week
- Cron job: Send every Monday at 9 AM (use APScheduler or Celery Beat)
- Preference toggle: UI in Settings page to opt in/out (Settings.tsx already has notification prefs)

**Files to create:**

- `backend/app/services/digest_service.py`
- Backend cron config or Celery schedule

**Acceptance Criteria:**

- [ ] Manager digest sent every Monday with team stats
- [ ] Trainee digest sent with personal progress
- [ ] Digest preferences configurable in Settings
- [ ] Empty digests handled gracefully (no email if no activity)

---

## P2: Enterprise & Scale

Features needed for enterprise customers and production scale.

---

### 8. SSO/SAML Authentication

**Priority:** P2 — **Medium**
**Status:** 🟢 Not started
**Dependencies:** None
**Effort:** 3 days (backend 1.5d + frontend 1.5d)

**Description:**
Single Sign-On via SAML/SSO for enterprise customers. Support Okta, Azure AD, and Google Workspace as identity providers.

**Implementation Details:**

- Integrate SAML library (`python3-saml` or similar)
- New flow:
  - Enterprise admin configures IdP in Settings → SSO
  - Users click "Sign in with Company SSO"
  - Redirect to IdP → callback → Firebase custom token minted
  - User authenticated with their corporate identity
- New storage collection: `sso_configs` (team_id, provider, metadata_url, entity_id, x509_cert)
- New API endpoints:
  - `POST /api/v1/auth/sso/configure` — Save IdP config
  - `GET /api/v1/auth/sso/login/{team_id}` — Initiate SSO login
  - `POST /api/v1/auth/sso/callback` — IdP callback handler
- Frontend: SSO configuration page in Team Settings
  - Upload metadata XML or enter fields manually
  - Test connection button
  - Enable/disable SSO for team

**Acceptance Criteria:**

- [ ] SSO login flow works with Okta
- [ ] SSO login flow works with Azure AD
- [ ] Multiple IdPs configurable per team
- [ ] Fallback to password login if SSO fails
- [ ] Session timeout respects IdP session

---

### 9. React Query Integration

**Priority:** P2 — **Medium**
**Status:** ✅ Done
**Dependencies:** None
**Effort:** 2 days (frontend)

**What was built:**

- Installed `@tanstack/react-query` in `web/package.json`
- Wrapped `App` with `QueryClientProvider` in `web/src/main.tsx` (staleTime: 30s, retries: 2)
- **TraineeDashboard.tsx** — replaced `useEffect` + `setInterval(30s)` with `useQuery({ refetchInterval: 30000 })`
- **DashboardPage.tsx** — replaced sequential fetches with 3 `useQuery` calls (dashboard, repos, health score with `enabled` flag)
- **NotificationsPage.tsx** — replaced `useEffect` + polling with `useQuery` + `useMutation` for mark read, delete, clear read + `queryClient.invalidateQueries()`
- TypeScript typecheck: ✅ zero errors

---

### 10. Performance Optimization

**Priority:** P2 — **Medium**
**Status:** 🟢 Not started
**Dependencies:** None
**Effort:** 2 days (backend 1d + frontend 1d)

**Description:**
Profile and optimize hot paths across the stack. Focus on API response times, database query performance, and frontend bundle size.

**Implementation Details:**

- Backend:
  - Profile with cProfile or py-spy to find slow endpoints
  - Add database query optimization (missing indexes, N+1 queries)
  - Add response compression (gzip/brotli)
  - Add Redis caching for frequent endpoints (repo analysis results)
  - Optimize LLM calls (reduce token usage, add response caching)
- Frontend:
  - Run Lighthouse audit and fix top issues
  - Add lazy loading for heavy components (ForceGraph, recharts)
  - Add image optimization (WebP format, lazy loading)
  - Add bundle analysis (`vite-bundle-visualizer`)
  - Remove unused dependencies

**Acceptance Criteria:**

- [ ] p95 API response time < 500ms for cached endpoints
- [ ] Lighthouse score > 90 for all pages
- [ ] Initial bundle size < 200KB (gzipped)
- [ ] No N+1 query patterns in hot paths

---

### 11. VS Code Extension

**Priority:** P2 — **Low**
**Status:** 🟢 Not started
**Dependencies:** None
**Effort:** 3 days (frontend/extension)

**Description:**
A VS Code extension that brings CodeFlow features directly into the editor. Inline code explanations, PR review summaries, and quick repo analysis without leaving the IDE.

**Implementation Details:**

- Create new directory: `extensions/vscode/`
- Use VS Code Extension API
- Features:
  - "Analyze this file" — Right-click → sends file to CodeFlow API
  - "Explain this function" — Hover over function → AI explanation
  - "PR Review" — Open PR in editor → inline review comments
  - "Learning Path" — Show current module in sidebar
- Authentication: VS Code prompts for CodeFlow API key
- Packaging: `.vsix` file for VS Code Marketplace

**Acceptance Criteria:**

- [ ] Extension installs and activates in VS Code
- [ ] Right-click context menu shows CodeFlow options
- [ ] Hover over function shows AI explanation
- [ ] PR review shows inline comments

---

### 12. Module-Level RBAC Refinement

**Priority:** P2 — **Medium**
**Status:** 🟡 Partial — basic role checks exist (`require_minimum_role`), module-level granularity is missing; TeamPage already has module grant/revoke UI stubs
**Dependencies:** None
**Effort:** 2 days (backend 1d + frontend 1d)

**Description:**
The current RBAC has owner/senior/member roles but no module-level access granularity. This means access is binary per team — you're either a member (access to everything) or you're not. True progressive onboarding requires granting access module-by-module.

**Implementation Details:**

- Extend team membership model to include `accessible_modules: List[str]`
- Create API endpoints:
  - `POST /api/v1/teams/{id}/members/{user}/grant-module` — Grant module access
  - `POST /api/v1/teams/{id}/members/{user}/revoke-module` — Revoke module access
  - `GET /api/v1/teams/{id}/modules` — List available modules for the team
- Create middleware or guard to check module access on per-endpoint basis
- Extend existing task completion flow to auto-grant modules
- Frontend: Module management UI on TeamPage and TraineeDashboard
  - Seniors see module grid with grant/revoke toggles per member
  - Trainees see locked/unlocked module badges

**Files to modify:**

- `backend/app/services/team_service.py`
- `backend/app/api/v1/teams.py`
- `backend/app/middleware/access_guard.py`
- `web/src/pages/TeamPage.tsx`
- `web/src/pages/TraineeDashboard.tsx`

**Acceptance Criteria:**

- [ ] Seniors can grant/revoke module access to individual members
- [ ] Task completion auto-grants associated module
- [ ] Module-gated endpoints return 403 if access not granted
- [ ] Frontend shows locked modules with lock icon

---

## P3: Platform & Ecosystem

Long-term platform features that expand the product's reach.

---

### 13. Playbook Marketplace

**Priority:** P3 — **Low**
**Status:** 🟢 Not started
**Dependencies:** Playbooks exist, Teams exist
**Effort:** 4 days (backend 2d + frontend 2d)

**Description:**
A marketplace where teams can share and discover onboarding playbooks. Community-contributed templates make it easy to start onboarding for any tech stack.

**Implementation Details:**

- New storage collection: `marketplace_playbooks` (title, description, steps JSON, author, downloads, rating, tech_stack tags)
- New API endpoints:
  - `GET /api/v1/marketplace` — Browse playbooks with search/filter
  - `POST /api/v1/marketplace/publish` — Publish a team playbook
  - `POST /api/v1/marketplace/{id}/import` — Import to your team
  - `POST /api/v1/marketplace/{id}/rate` — Rate a playbook
- Frontend: New route `/marketplace`
  - Search by tech stack (React, Django, Go, etc.)
  - Playbook cards with downloads, rating, author
  - One-click import to own team

**Acceptance Criteria:**

- [ ] Users can browse and search marketplace playbooks
- [ ] One-click import adds playbook to team
- [ ] Rating and download counts work
- [ ] Playbook author attribution preserved

---

### 14. SOC 2 Compliance Reporting

**Priority:** P3 — **Low**
**Status:** 🟢 Not started
**Dependencies:** RBAC, Audit trail
**Effort:** 5 days (backend 3d + docs 2d)

**Description:**
Generate SOC 2 compliance reports for enterprise customers. Show security controls, access logs, data handling practices, and uptime guarantees.

**Implementation Details:**

- New service: `backend/app/services/compliance_service.py`
  - `generate_soc2_report(team_id)` — Build compliance PDF
  - Report sections: Access Control, Data Encryption, Audit Logs, Incident Response, Availability
- New API endpoint: `GET /api/v1/compliance/soc2/{team_id}`
- Frontend: Compliance tab in Team Settings with download button

**Acceptance Criteria:**

- [ ] SOC 2 report generated as downloadable PDF
- [ ] Report includes all required sections
- [ ] Audit logs included in report

---

### 15. Mobile Companion App

**Priority:** P3 — **Low**
**Status:** 🟢 Not started
**Dependencies:** None (uses existing API)
**Effort:** 2 weeks (React Native or PWA)

**Description:**
A mobile app (or PWA) for on-the-go access to onboarding progress, notifications, and quick Q&A. Not a full code analysis tool — focused on consumption and awareness.

**Implementation Details:**

- Option A: Progressive Web App (PWA) — Add service worker, manifest, offline support to existing web app
- Option B: React Native app — New project in `mobile/` directory
- Features:
  - Push notifications for task events
  - Quick Q&A (ask a question, get answer)
  - Progress dashboard (read-only)
  - Daily streak reminder
  - View learning path modules

**Acceptance Criteria:**

- [ ] Mobile app shows push notifications for task events
- [ ] Quick Q&A works with streaming responses
- [ ] Progress dashboard shows completion percentage
- [ ] Daily login streak tracked from mobile

---

## P4: AIaaS API Expansion

API products for external developers to consume CodeFlow's AI capabilities.

---

### 16. AIaaS API Gateway

**Priority:** P4 — **Medium**
**Status:** 🟡 Partial — API key management exists, tier system exists, usage tracking exists
**Dependencies:** None
**Effort:** 3 days (backend)

**Description:**
Package CodeFlow's AI capabilities as first-class public APIs for third-party developers. Current AIaaS has key management and usage tracking but the public API endpoints are still coupled to the SaaS frontend.

**Implementation Details:**

- New API endpoints under `/api/v1/ai/`:
  - `POST /api/v1/ai/knowledge/query` — Query a codebase (context-aware RAG)
  - `POST /api/v1/ai/knowledge/index` — Index a repo for retrieval
  - `POST /api/v1/ai/knowledge/stream` — Streaming query with SSE
  - `POST /api/v1/ai/learn/path` — Generate learning path
  - `POST /api/v1/ai/learn/quiz` — Generate quiz questions
  - `POST /api/v1/ai/review/pr` — Review a PR diff
  - `POST /api/v1/ai/review/code` — Review code snippet
  - `POST /api/v1/ai/analytics/architecture` — Analyze repo architecture
- Rate limiting: Per API key, per tier (Free: 100/day, Startup: 10K/day, Pro: 100K/day)
- Pricing: $0.001/query (Startup), $0.0005/query (Pro)
- Documentation: Public API reference with OpenAPI/Swagger

**Files to create/modify:**

- `backend/app/api/v1/ai_gateway.py` — Add public endpoints
- `backend/app/services/quota.py` — Per-key quota enforcement
- `sdks/typescript/src/index.ts` — SDK methods for new endpoints

**Acceptance Criteria:**

- [ ] All AIaaS endpoints work with API key authentication
- [ ] Rate limiting enforced per key
- [ ] SDK methods for all new endpoints
- [ ] Public API documentation published

---

### 17. TypeScript SDK Expansion

**Priority:** P4 — **Low**
**Status:** 🟢 Not started
**Dependencies:** AIaaS API Gateway
**Effort:** 2 days (SDK)

**Description:**
Expand the existing TypeScript SDK to cover all new AIaaS endpoints. Make it easy for external developers to integrate CodeFlow into their tools.

**Implementation Details:**

- Add SDK methods for all AIaaS endpoints:
  - `client.knowledge.query(repoId, question)`
  - `client.knowledge.index(repoUrl)`
  - `client.learning.path(repoUrl, level)`
  - `client.learning.quiz(pathId, moduleIndex)`
  - `client.review.pr(repoUrl, prNumber)`
  - `client.review.code(codeSnippet)`
  - `client.analytics.architecture(repoUrl)`
- Add streaming support for query endpoint
- Add TypeScript types for all request/response schemas
- Publish to npm under `@codeflow/sdk`

**Files to modify:**

- `sdks/typescript/src/index.ts`

**Acceptance Criteria:**

- [ ] All new endpoints have SDK methods
- [ ] Streaming queries work with async iterators
- [ ] Published to npm with CI/CD

---

## P5: Viral/Demo Features

Features designed to be recorded, shared, and drive adoption through word-of-mouth.

---

### 18. "Senior Dev Roast" Mode

**Priority:** P5 — **Low**
**Status:** 🟢 Not started
**Dependencies:** None (uses existing Q&A streaming infrastructure)
**Effort:** 0.5 days (frontend)

**Description:**
A toggle in the Q&A chat that makes the AI respond with brutal, sarcastic but _accurate_ code criticism. Built on existing streaming Q&A infrastructure — just a system prompt change.

**Implementation Details:**

- Frontend: Toggle switch in AskPage chat header labeled "🔥 Roast Mode"
- When active, send `{ "roast_mode": true }` with query
- Backend: Modify system prompt when `roast_mode` is true
  - Normal: "You are a helpful coding assistant..."
  - Roast: "You are a sarcastic senior developer who has seen it all..."
- No new API endpoint needed — reuse `POST /api/v1/ask/query`
- Add a "Copy Roast" button for easy sharing

**Files to modify:**

- `web/src/pages/AskPage.tsx` — Add toggle UI
- `backend/app/agents/repo_qa.py` — Add roast system prompt variant

**Acceptance Criteria:**

- [ ] Toggle switches chat personality in real-time
- [ ] Roast responses are sarcastic but technically accurate
- [ ] "Copy Roast" button copies last response

---

### 19. DevScore Leaderboard

**Priority:** P5 — **Low**
**Status:** 🟢 Not started
**Dependencies:** Gamification System (XP tracking)
**Effort:** 1 day (frontend)

**Description:**
A team leaderboard showing XP scores. Weekly top scorer gets a crown badge. Competitive but friendly — drives engagement through social comparison.

**Implementation Details:**

- Frontend: Leaderboard component on DashboardPage
  - Show top 10 team members by weekly XP
  - Current user highlighted even if not in top 10
  - Trophy icons for top 3 (🥇🥈🥉)
  - Crown badge on weekly winner
  - XP trend sparkline (up/down from last week)

**Files to modify:**

- `web/src/pages/DashboardPage.tsx` — Add leaderboard tab

**Acceptance Criteria:**

- [ ] Leaderboard shows top 10 by weekly XP
- [ ] Current user shown with rank even if outside top 10
- [ ] Crown badge on previous week's winner
- [ ] Weekly reset works correctly

---

### 20. Codebase Trailer

**Priority:** P5 — **Low**
**Status:** 🟢 Not started
**Dependencies:** ArchitectureExplorer (provides the raw data)
**Effort:** 1 day (backend 0.5d + frontend 0.5d)

**Description:**
Auto-generate a 30-second "trailer" for the codebase — a fun, shareable movie-trailer-style summary.

**Implementation Details:**

- New API endpoint: `POST /api/v1/unique/trailer`
  - Input: `{ "repo_url": "..." }`
  - Output: `{ "title": "IN A WORLD...", "tagline": "...", "scenes": [...], "cast": [...], "genre": "..." }`
- LLM prompt: Generate a movie trailer script from the architecture analysis
- Frontend: Display trailer as animated card on ExplorePage after analysis
  - Typewriter effect for the title
  - Scene-by-scene reveal
  - Share button to copy trailer text

**Acceptance Criteria:**

- [ ] Trailer generated from architecture analysis
- [ ] Title, tagline, scenes, cast all populated
- [ ] Frontend shows animated reveal
- [ ] Share button copies to clipboard

---

### 21. "Hot Take" PR Review

**Priority:** P5 — **Low**
**Status:** 🟢 Not started
**Dependencies:** PR Review Agent (exists)
**Effort:** 0.5 days (backend)

**Description:**
The PR review agent adds a one-line "hot take" to each review. A humorous, personality-driven summary that makes code reviews more enjoyable and shareable.

**Implementation Details:**

- Extend `PRReviewAgent` to generate a "hot_take" field
- Examples:
  - "This is the cleanest code I've seen all week. Have a cookie. 🍪"
  - "This looks like it was written at 3 AM after three energy drinks."
  - "Solid logic. The variable names suggest you hate your future self though."
- Add to PR review response: `{ "hot_take": "...", ...existing_fields }`
- Frontend: Display hot take as a highlighted quote at the top of the review

**Files to modify:**

- `backend/app/agents/pr_review.py` — Add hot take generation
- `web/src/pages/PRDescriptionPage.tsx` — Display hot take

**Acceptance Criteria:**

- [ ] Hot take generated for every PR review
- [ ] Hot take is humorous but relevant to the PR
- [ ] Frontend displays hot take prominently

---

## Infrastructure & Polish

Non-feature work that improves quality, reliability, and developer experience.

---

### 22. Loading Skeletons for All Pages

**Priority:** Polish
**Status:** ✅ Done
**Effort:** 0.5 days (frontend)

**Description:**
Replace spinner-based loading states with skeleton screens that match the page layout. Improves perceived performance and UX.

**What was built:**

- **CodeHealthPage** — in-page loading skeleton upgraded from raw `animate-pulse` divs to reusable `StatsGridSkeleton` + `SkeletonBase`
- **MemberDetailPage** — skeleton upgraded to `SkeletonHeading`/`SkeletonBase` + `StatsGridSkeleton`
- **ModuleHealthPage** — skeleton upgraded to `SkeletonHeading` + `StatsGridSkeleton`
- **ReviewQueuePage** — loading state uses `StatsGridSkeleton` + `SkeletonBase` cards with error toasts
- **AdminDashboardPage** — page-level skeleton uses `SkeletonHeading`/`SkeletonBase`/`StatsGridSkeleton` with toasts on all catch blocks
- **WaitlistPage** — `useToast` wired for errors (static form page, no loading skeleton needed)

**Acceptance Criteria:**

- [x] All 24 pages have consistent skeleton loading states
- [x] Skeletons match the page layout structure
- [x] Skeletons use the reusable `SkeletonBase` / page-specific skeleton components

---

### 23. Toast Notification System (Remaining Pages)

**Priority:** Polish
**Status:** ✅ Done
**Effort:** 0.5 days (frontend)

**Description:**
Consistent toast notifications for all CRUD operations. Success, error, and info toasts on create/update/delete actions.

**What was built:**

- **CodeHealthPage** — added `useToast`, error toasts for repos, tasks, teams fetch failures
- **MemberDetailPage** — added `useToast`, error toasts for tasks, member details, module permissions failures
- **ModuleHealthPage** — added `useToast`, error toasts for tasks, team members fetch failures
- **ReviewQueuePage** — `useToast` wired with error toasts on team-load and task-load failures
- **AdminDashboardPage** — all 7 silent catch blocks replaced with toast.error calls (usage, audit, keys, webhooks)
- **WaitlistPage** — `useToast` added with error toasts for count fetch and form submission network errors

---

### 24. Accessibility Audit

**Priority:** Polish
**Status:** 🟢 Not started
**Effort:** 1 day (frontend)

**Description:**
Audit all pages for WCAG 2.1 AA compliance. Fix issues with keyboard navigation, ARIA labels, color contrast, and screen reader support.

**Implementation Details:**

- Run axe DevTools on all 24 pages
- Fix violations: missing ARIA labels, insufficient contrast, missing focus indicators
- Add skip-to-content link
- Ensure all interactive elements are keyboard accessible

---

### 25. Dark Mode Consistency

**Priority:** Polish
**Status:** 🟢 Not started
**Effort:** 0.5 days (frontend)

**Description:**
Audit all 24 pages for dark mode consistency. Some components may not render correctly in dark mode. With themes including himalayan, midnight, forest, and violet, each theme variant should be checked.

---

## Quick Wins (New)

Small, high-value improvements discovered during implementation that don't fit neatly into other categories.

---

### 26. Billing API — Idempotency Key Header Passthrough

**Priority:** Quick Win
**Status:** ✅ Done
**Effort:** 0.1 days

**What was built:**

- `backend/app/api/v1/billing.py` — stripe_webhook endpoint now reads `Idempotency-Key` header and passes it to `billing.handle_webhook()`

---

### 27. Waitlist Service — CORS Middleware Fix

**Priority:** Quick Win
**Status:** ✅ Done
**Effort:** 0.1 days

**What was built:**

- Fixed CORS middleware ordering issue in waitlist service that prevented frontend from calling the waitlist API

---

### 28. Load More / Infinite Scroll on Tasks

**Priority:** Quick Win
**Status:** 🟢 Not started
**Effort:** 0.5 days (frontend)

**Description:**
TasksPage and NotificationsPage show all items at once. Add load-more pagination or infinite scroll for performance with large datasets. Pagination component (Pagination.tsx) already exists and is used in AdminDashboardPage — reuse it in tasks and notifications.

**Files to modify:**

- `web/src/pages/TasksPage.tsx` — Add Pagination component
- `web/src/pages/NotificationsPage.tsx` — Add Pagination component

---

## Feature Dependency Map

```
P0 ─────────────────────────────────────────────────────────
│
├── ✅ Real Stripe Webhook
│
├── 🟡 Production Deployment (ready to go)
│
└── 🟡 E2E / Integration Tests (backend ✅, frontend pending)

P1 ─────────────────────────────────────────────────────────
│
├── 🟢 Interactive Repo Visualization
│
├── 🟢 Knowledge Quizzes ──→ Gamification System ──→ DevScore Leaderboard
│                               │
│                               └── Weekly Digest
│
└── 🟡 Module-Level RBAC

P2 ─────────────────────────────────────────────────────────
│
├── 🟢 SSO/SAML Authentication
│
├── ✅ React Query Integration
│
├── 🟢 Performance Optimization
│
└── 🟢 VS Code Extension

P3 ─────────────────────────────────────────────────────────
│
├── 🟢 Playbook Marketplace
│
├── 🟢 SOC 2 Compliance Reporting (needs RBAC + Audit)
│
└── 🟢 Mobile Companion App

P4 ─────────────────────────────────────────────────────────
│
├── 🟡 AIaaS API Gateway ──→ 🟢 TypeScript SDK Expansion
│
P5 ─────────────────────────────────────────────────────────
│
├── 🟢 Roast Mode
├── 🟢 Codebase Trailer
└── 🟢 Hot Take PR Review
```

---

## Effort Summary (Remaining)

| Priority | Features | Total Effort |
|----------|----------|-------------|
| **P0** | Production Deploy + Frontend E2E | 4 days |
| **P1** | 5 features | 11.5 days |
| **P2** | 3 features + 2 complete ✅ | 8 days |
| **P3** | 3 features | 11 days |
| **P4** | 2 features | 5 days |
| **P5** | 4 features | 3 days |
| **Polish** | 2 items (A11y, Dark Mode) | 1.5 days |
| **Quick Wins** | 1 remaining | 0.5 days |
| **Total** | **~18 remaining items** | **~44.5 days** |

### By Track

| Track | Effort |
|-------|--------|
| Backend | ~24 days |
| Frontend | ~19 days |
| DevOps | ~2.5 days |

---

## Appendix: Complete Built vs Unbuilt Inventory

### ✅ Already Built (60+ endpoints, 11 agents, 24 pages)

| Category | Items |
|----------|-------|
| **AI Agents** | ArchitectureExplorer, LearningPathGenerator, FirstPRAccelerator, RepoQA, SilentPairProgramming, PatternRecognition, RegressionTestGenerator, OnboardingReportGenerator, HealthScorer, PR Review Agent, TaskQA |
| **Backend Services** | GitHubService, ParserService, EmbeddingsService, CacheService, TaskService, UserService, TeamService, PlaybookService, BillingService (+ Stripe webhook with idempotency), APIKeyService, UsageTracker, InviteService, AuditService, NotificationService, AccessControlService, ConversationService, ContributorTracker, SlackService, ReportGenerator, EmailService, WebhookService (+ custom webhooks with signing), QuotaService, PostgresDB, FirestoreDB, GraphBuilder |
| **Frontend Pages** | All 24 routes: Landing, Pricing, Changelog, Docs, Login, Register, ForgotPassword, Join, Explore, Learn, FirstIssue, Ask, Reports, Dashboard, Team, Playbooks, Billing, API Keys, Settings, PR Describe, Tasks, My Progress, Notifications, Profile |
| **Middleware** | CORS, Auth, RateLimit, ResponseWrapper, Logging, AccessGuard |
| **Infrastructure** | Docker Compose (dev + prod + microservices), Nginx (dev + prod), Kubernetes (8 manifests), Terraform (GCP), CI/CD configs |
| **SDK** | TypeScript SDK with key management, basic AIaaS methods |
| **Tests** | 222+ unit tests + 2 integration tests (full onboarding flow) |
| **React Query** | 3 pages migrated (TraineeDashboard, DashboardPage, NotificationsPage) |

### 🚧 To Be Built (~20 items)

| Priority | Items | Total Effort |
|----------|-------|-------------|
| **P0** | Production Deployment, Frontend E2E Tests | 4 days |
| **P1** | Repo Visualization, Knowledge Quizzes, Gamification, Weekly Digest, Module RBAC | 11.5 days |
| **P2** | SSO/SAML, Performance, VS Code Extension | 8 days |
| **P3** | Playbook Marketplace, SOC 2, Mobile App | 11 days |
| **P4** | AIaaS Gateway, SDK Expansion | 5 days |
| **P5** | Roast Mode, DevScore, Codebase Trailer, Hot Take | 3 days |
| **Polish** | Skeletons ✅, Toasts ✅, A11y, Dark Mode | 1.5 days |
| **Quick Wins** | Load More on Tasks/Notifications | 0.5 days |

---

_This plan was generated from analysis of all existing documentation: STATUS.md, PLAN.md, docs/features2.md, p.md, readme1.md, docs/system_architecture_design.md — and updated with completion status from implementation sessions up to June 30, 2026._

_Last updated: 2026-06-30 (Refreshed)_
