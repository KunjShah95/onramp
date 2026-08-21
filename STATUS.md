# Onramp 2.0 — Implementation Status

**Updated:** 2026-08-21
**Overall Completion:** release-candidate hardening + wedge built (all 5 phases + v1.4-v1.6 wedge + Phase 0 cost-model harness; see `ROADMAP.md` + `features_mvp.md` for readiness checklist)

---

## Phase 0: Skeleton ✅ COMPLETE

| Component | Status |
|-----------|--------|
| Backend skeleton (FastAPI + middleware) | ✅ Complete |
| Frontend skeleton (React 19 + TS + Tailwind) | ✅ Complete |
| Agent base class + 4 core stubs | ✅ Complete |
| v1 endpoints (explore, learn, first-pr, ask) | ✅ Complete |
| Both boot without errors | ✅ Verified |

---

## Phase 1: Core 4 Features ✅ COMPLETE

| Agent | Status |
|-------|--------|
| ArchitectureExplorer | ✅ Complete |
| FirstPRAccelerator | ✅ Complete |
| LearningPathGenerator | ✅ Complete |
| RepoQA | ✅ Complete |

---

## Phase 2: Enhancer Features ✅ COMPLETE

| Feature | Status |
|---------|--------|
| OnboardingReportGenerator | ✅ Complete |
| HealthScorer | ✅ Complete |
| Slack Integration | ✅ Complete |
| ContributorTracker | ✅ Complete |

---

## Phase 3: Unique Differentiators ✅ COMPLETE

| Feature | Status |
|---------|--------|
| SilentPairProgramming | ✅ Complete |
| PatternRecognition | ✅ Complete |
| RegressionTestGenerator | ✅ Complete |

---

## Phase 4: AIaaS Launch ✅ COMPLETE

| Feature | Status |
|---------|--------|
| API Key Management | ✅ Complete |
| Usage Tracking | ✅ Complete |
| Tiered Rate Limiting | ✅ Complete |
| TypeScript SDK | ✅ Complete |
| Frontend: API Keys Page | ✅ Complete |

---

## Phase 5: SaaS Launch ✅ COMPLETE

| Feature | Status |
|---------|--------|
| Team Management | ✅ Complete |
| Playbooks | ✅ Complete |
| Razorpay Billing (INR) | ✅ Complete (skeleton — needs real webhook) |
| Frontend: Dashboard | ✅ Complete |
| Frontend: Team Page | ✅ Complete |
| Frontend: Playbooks | ✅ Complete |
| Frontend: Billing | ✅ Complete |

---

## Post-MVP Features

| Feature | Status | Details |
|---------|--------|---------|
| **Task Management** | ✅ Complete | Create, assign, submit, review, approve, complete with AI review |
| **Notification System** | ✅ Complete | Bell dropdown, per-type toggles, digest, quiet hours, Slack dispatch |
| **PR Description Generator** | ✅ Complete | AI-powered PR description generation + roast mode |
| **CTO Dashboard** | ✅ Complete | Team analytics, member progress, completion rates |
| **Trainee Dashboard** | ✅ Complete | `/my-progress` — per-trainee task and module tracking |
| **Audit Trail** | ✅ Complete | Event logging for task lifecycle |
| **Theme System** | ✅ Complete | 4 themes (himalayan, midnight, forest, purple) + accent customization |
| **Integration System** | ✅ Complete | Webhooks, Slack/GitHub config, Settings UI |
| **Aceternity UI Components** | ✅ Complete | CardSpotlight, GradientHeading, StatusBadge, PageTransition, etc. |
| **Role-Based Access Control** | ✅ Complete | `require_minimum_role` — owner/senior/member hierarchy |
| **Email Invitations** | ✅ Complete | SendGrid integration — invites, task assigned, task completed emails |
| **Responsive Design** | ✅ Complete | All 24 pages responsive from 320px to desktop |
| **API Response Caching** | ✅ Complete | Redis-backed `@cached` decorator with graceful fallback |

---

## Test Status

> Original 222-test pre-rewrite suite was replaced by a regression-focused suite covering every security-critical fix + wedge features.

| Suite | Location | Status |
|-------|----------|--------|
| Backend (auth middleware, rate limit, RBAC guard, billing webhook, storage `in` filter, migration ordering, prod env validation, ramp/review-ops/benchmark, repo index, embeddings, DORA, RBAC) | `backend/tests/` — 63 files, 700+ tests | ✅ Passing (memory + Postgres variants) |
| Frontend (Vitest + RTL) | `web/src/` — `*.test.tsx` + `src/test/` | ✅ 58+ tests, strict TS zero errors; `frontend.yml` runs `vitest run` + `tsc --noEmit` + `build` |
| E2E (Playwright) | `web/e2e/` | ✅ 65+ specs (auth, dashboard, review-queue, explore, team, billing, a11y, perf); not yet wired into required CI gate |
| SDK | `sdk/` | ✅ 6 tests |

> See `ROADMAP.md:Testing & Reliability` for full breakdown.

---

## Frontend Routes (58+ components, 44+ routes)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | LandingPage | Landing / hero |
| `/why-onramp` | WhyOnrampPage | Cost-at-scale calculator |
| `/pricing` | PricingPage | Pricing tiers |
| `/changelog` | ChangelogPage | Changelog |
| `/docs` | DocsPage | Documentation |
| `/developer` | DeveloperPortal | Developer portal |
| `/login` | Login | Sign in (JWT + OAuth) |
| `/register` | Register | Sign up |
| `/forgot-password` | ForgotPassword | Password reset |
| `/join` | JoinPage | Accept invite token |
| `/explore` | ExplorePage | Architecture analysis |
| `/learn` | LearnPage | Learning path generation |
| `/first-issue` | FirstIssuePage | First PR finder |
| `/ask` | AskPage | Repository Q&A (SSE) |
| `/reports` | OnboardingReportPage | Generate reports |
| `/dashboard` | DashboardPage | Mission Control |
| `/executive` | ExecutivePage | Executive console |
| `/ramp` | RampPage | Ramp health + cost + stuck |
| `/reviews` | ReviewQueuePage | Review Ops queue |
| `/team` | TeamPage | Team + invite management |
| `/playbooks` | PlaybooksPage | Onboarding playbooks |
| `/marketplace` | MarketplacePage | Playbook marketplace |
| `/billing` | BillingPage | Razorpay + credit wallet |
| `/api-keys` | ApiKeysPage | API key management |
| `/admin` | AdminDashboardPage | Admin console |
| `/settings` | Settings | Settings + theme |
| `/pr-describe` | PRDescriptionPage | PR description gen |
| `/tasks` | TasksPage | Task management |
| `/my-progress` | TraineeDashboard | Trainee progress |
| `/notifications` | NotificationsPage | Notification history |
| `/wiki` | WikiPage | AI wiki |
| `/profile` | Profile | User profile |
| `/hr` | HrDashboardPage | HR dashboard |
| `/privacy` | PrivacyPage | Privacy Policy |
| `/terms` | TermsPage | Terms of Service |
| + 20 more | DevSpace, SeniorSpace, CodeHealth, Dora, Drift, etc. | Role-gated surfaces |

> Full list: `web/src/pages/` + `web/src/App.tsx`

---

## Backend Routers (42+ routers: `/api/v1` + `/v1` gateway + ops)

| Router | Module | Purpose |
|--------|--------|---------|
| explore | explore.py | Architecture analysis |
| learn | learn.py | Learning paths |
| first_pr | first_pr.py | First PR finder + guides |
| ask | ask.py | Repository Q&A (SSE) + index |
| repo_index / repositories | repo_index.py, repositories.py | Repo context index (cached) |
| autopilot | autopilot.py | Repo→graph→issues→tasks→PRs pipeline |
| ramp | ramp.py | Ramp profiles, stuck, health, cost-model, benchmarks |
| review_ops | review_ops.py | Load board, suggestion, consistency |
| hr_dashboard | hr_dashboard.py | Cohort retention + headcount flows |
| reports | reports.py | Onboarding reports |
| health / dora | health.py, dora.py | Health checks, DORA metrics |
| slack | slack.py | Slack digest + slash commands |
| contributor | contributor.py | Contributor tracking |
| unique | unique.py | Pair walkthrough, Patterns, RegTest |
| dashboard | dashboard.py | CTO/trainee dashboards |
| ai_gateway / openai_gateway | ai_gateway.py, openai_gateway.py | API keys (`cf_`), `/v1` gateway |
| modelling | modelling.py | Model catalog |
| teams | teams.py | Team CRUD + members + modules |
| playbooks / marketplace | playbooks.py, marketplace.py | Playbooks + marketplace |
| billing | billing.py | Razorpay (INR) subscriptions + webhooks |
| auth / accounts / admin | auth.py, accounts.py, admin.py | JWT + OAuth + admin provider keys |
| pr_review | pr_review.py | PR review + roast |
| tasks | tasks.py | Task CRUD + workflow + WebSocket |
| notifications | notifications.py | In-app notifications (14 types) |
| integrations | integrations.py | Webhooks, Slack/GitHub config |
| audit / ops | audit.py, ops.py | Audit log, `/health` `/ready` `/metrics` |
| webhook_handler | webhook_handler.py | GitHub webhook HMAC |
| wiki / gamification / quiz / onboarding_plans / etc. | wiki.py, gamification.py, quiz.py, onboarding_plans.py, feature_flags.py, digest.py, seed.py, ws.py | Wiki, gamification, quizzes, plans, flags, digests |
| _Total_ | `backend/app/api/v1/` | 42+ routers (see `backend/app/main.py:416` includes) |

---

## Middleware Stack (outermost → innermost, `backend/app/main.py:338`)

1. Brotli/GZip (compression, `COMPRESSION_MIN_SIZE`)
2. CORS (allowlist + regex `CORS_ALLOWED_ORIGIN_REGEX`)
3. SecurityHeaders (HSTS prod, nosniff, DENY frame, etc.)
4. Metrics (`/metrics` — Prometheus text format)
5. Logging (structured JSON when `LOG_FORMAT=json`)
6. ResponseWrapper (`{success, data}` envelope; SSE excluded)
7. RateLimit (200 req/min, tighter on LLM routes, Redis in prod)
8. BodySizeLimit (4 MB default, `MAX_REQUEST_BODY_BYTES`)
9. Auth (JWT + `cf_` API key, public path allowlist at `main.py:350`)

---

## What's Left

See `features_mvp.md` (release gate) and `versions.md` (roadmap). Highest-priority remaining:

| Item | Priority | Details |
|------|----------|---------|
| 14 newly-wired pages: retry + refresh buttons | Done | Added Retry buttons to AdminDashboard, ReviewQueue, MemberDetail, ModuleHealth, TraineeDashboard; Refresh buttons on TraineeDashboard + AdminDashboard |
| Rotate DB password + prod secret manager | High | Local `.env` uses a throwaway value; prod must come from a secret manager |
| `DateTime(timezone=True)` migration | Medium | Values are tz-aware UTC; column types still naive — needs Alembic migration 004 |
| Razorpay test-mode E2E verification | Medium | checkout → active → cancel → downgrade against real test webhooks |
| render.yaml off free tiers | Medium | Free tiers sleep; staging-only until upgraded |
| E2E / Playwright suite in CI | Low | Auth flow + core-4 happy paths; `web/e2e/` specs exist but are not wired into CI |
| K8s / Terraform / Cloud Run manifests | Removed | `kubernetes/` removed — it described a different "onramp" project (Firestore, Celery, cert-manager) and was **not deployable**; self-host is via `docker-compose.yml` / `docker-compose.prod.yml` |

---

## Frontend Wiring (verified 2026-07-10)

All 26 routes render and the feature pages now call the real backend via `web/src/lib/api.ts`
(114 typed functions). Previously ~14 pages rendered hardcoded mock data; the marquee
cross-page flows from `PLAN.md` Phase 2 (Learn → tasks, First-Issue guide/walkthrough,
Ask streaming, Notifications, ApiKeys, Playbooks, Report, Trainee/Code-Health dashboards,
PR description, Review queue, Admin, Member/Module views) are now wired.

---

**Status:** release-candidate hardening + wedge built (v1.4-v1.6 + Phase 0); validation interviews next
**Tests:** 700+ backend (63 files) · 58+ frontend · 65+ E2E · 6 SDK — see Test Status above
**Pages:** 58+ components (44+ routes, all wired via 114 typed fns)
**Routers:** 42+ routers · 16 AI agents · 60+ services · 34 tables (28 migrations)
**Next:** run the 5-team validation interviews (`docs/validation-interview-script.md`), CI green on main, Razorpay test-mode E2E, staging deploy
