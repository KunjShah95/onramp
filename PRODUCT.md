# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Role-adaptive across an engineering org, with no single primary audience — every surface serves its role equally:

- **New devs / trainees** onboarding into an unfamiliar codebase: tracking progress, unlocking modules, following learning paths, landing a first PR.
- **Senior devs** mentoring and reviewing: task assignment, code review, sign-off.
- **CTO / engineering leadership** needing team-health and velocity visibility: executive dashboards, task distribution, review gates.
- **HR / people ops** running onboarding programs: people management, onboarding plans, HR dashboards.

Access and UI adapt per role via RBAC (9 roles, `junior_dev` → `ceo`; `new_dev` was renamed to `junior_dev` in migration 026).

## Product Purpose

Onramp 2.0 is an AI-powered developer onboarding and team-acceleration platform. It helps engineering teams onboard new developers faster, automate code review, track skill progression, and give leadership visibility into team health — all driven by multi-provider AI agents. Success = new devs reach productive contribution sooner, seniors spend less time on repetitive review/guidance, and leadership sees team health without manual reporting.

## Positioning

Combines AI codebase comprehension tools (architecture explorer, first-PR accelerator, learning-path generator, repo Q&A, code-health scorer) with a full onboarding workflow (task lifecycle, gamification, module-gated learning) and leadership oversight in one role-adaptive platform. The mechanism a neighboring product could not truthfully copy: AI agents grounded in the team's actual repository feed the same system that gates onboarding tasks and reports team health — comprehension, workflow, and oversight share one data spine rather than being bolted together.

## Operating Context

- Full task lifecycle: create → assign → start → submit → review → approve → complete, with an AI-assisted review queue and a product sign-off gate. PR merges auto-complete tasks + auto-close originating GitHub issues.
- Module-level access control: grant/revoke module access per user per team; auto-unlock on task completion.
- Multi-team structure; users can belong to more than one team; team switching via `team_id` scoping.
- Repo Autopilot pipeline (optional): repo URL → graph/index → issues → tasks (load-aware by role) → `AutonomousCodingAgent` PRs → validate + senior review (`scripts/repo_autopilot.py` + `/api/v1/autopilot/*`).
- Repo context index (parse once, reuse everywhere): `POST /repos/index` (24h Redis, Celery pre-build, webhook eviction) + requirement-scored `GET /repos/index/{id}/context`.
- Integrates with GitHub (token/scope validation, PR auto-apply, webhook HMAC), Slack (channel config, event-driven standups), SendGrid email, and **Razorpay** billing (INR).
- Runs against a team's real repositories; AI features require at least one LLM provider key (free-first router).

## Capabilities and Constraints

**AI developer tools:** architecture explorer (force-directed repo graph + entity graph), first-PR accelerator, learning-path generator, repo Q&A (streaming SSE), PR description generator (+ roast), code-health scorer, pattern recognition, silent pair programming, quiz generator, regression-test generator, drift detector, codebase trailer, issue resolution agent, autonomous coding agent.

**Onboarding & learning:** trainee dashboard (progress, modules, streak, XP), gamification (XP, levels, badges, streaks, leaderboards), module-level access, onboarding reports (HTML/Markdown), persisted learning paths, onboarding plans (30-60-90 day), playbooks (templates + tags), wiki (AI-generated from repo URL), onboarding hub, DORA/velocity metrics.

**Leadership & wedge:** ramp profiles (ramp days vs benchmark), senior-time cost, stuck-dev detectors + alerts, org health score (0-100), reviewer load board + next-reviewer suggestion + consistency scores, task distribution & completion charts, headcount flows + cohort retention curves, time-to-first-merged-PR.

**Billing & gateway:** Razorpay subscriptions (free / pro / enterprise, INR) + usage-based credit wallet, API-key management (`cf_` + HMAC-SHA256, usage tracking, credit limits, expiry), OpenAI-compatible `/v1` gateway, rate limiting (Redis), usage quotas, BYOK per-team provider keys (encrypted, round-robin).

**Notifications & integrations:** in-app center (14 event types, preferences, quiet hours, digest), bell + badge, webhooks (create/test/rotate/logs), GitHub token validation, Slack, SendGrid, Jira/Linear/GitLab/Bitbucket sync, feature flags, Celery digests.

**Constraints:** Multi-provider LLM router with QueryType fallback (OpenRouter, Gemini, Groq, NVIDIA free-first; DeepSeek/Qwen/Zhipu/Moonshot/Mistral/OpenAI/Anthropic/HuggingFace/Ollama fallback) + Redis semantic cache + EmbeddingRouter. RBAC with 9 roles (`junior_dev` → `ceo`/`admin`/`hr`). JWT auth HS256 (7-day expiry, rotating refresh tokens) + Fernet field-level PII encryption + Google/GitHub OAuth (CSRF state, account linking) + optional Neon Auth JWKS. React 19 + TypeScript strict, Vite 6, Tailwind CSS 3, Framer Motion, GSAP, Recharts, Phosphor Icons, TanStack Query, Monaco Editor. FastAPI + PostgreSQL 16 (asyncpg/SQLAlchemy 2.0 + pgvector, 34 tables, 28 migrations) + Redis + Celery, unified `{success, data}` response envelope (`backend/app/main.py:100` prod validation).

**Terminology:** roles run `junior_dev` → `ceo`; "modules" are gated learning units; "onboarding reports" are auto-generated repo docs; "ramp" = trainee onboarding trajectory.

## Brand Commitments

Name "Onramp 2.0" is locked. No other binding brand constraints — voice, palette, typography, and the broader visual world are open. (Existing Tailwind/Framer implementation is treated as evidence, not a commitment.)

## Evidence on Hand

- Readme.md — full feature inventory, tech stack, architecture, seeded demo accounts (9 users across roles/teams, password `demo123`), repo autopilot docs, benchmarks.
- ROADMAP.md — wedge roadmap (Track → Quantify → Intercept) + v1.4-v1.6 status; PROBLEM.md — cost math + validation plan.
- Seeded demo data across 39+ tables via `scripts/seed_dev_user.py` (realistic users, teams, tasks; `--quick` / `--dry-run` variants).
- Backend: 43 routers, 16 agents, 60+ services, 700+ pytest tests (`backend/tests/`); Frontend: 58+ pages, Vitest + Playwright E2E, strict TS.
- No real external customers, testimonials, benchmarks, or press exist yet — do not fabricate them; use the benchmark *calculators* in PROBLEM.md/ROADMAP.md for internal modeling only.

## Product Principles

1. **Role decides the view.** Every surface is framed by the role that lands on it; the same data spine renders differently for a trainee, a senior, a CTO, and HR.
2. **AI is grounded, not decorative.** Every AI feature answers against the team's real repository; comprehension, workflow, and oversight draw on one shared data spine.
3. **Onboarding is a tracked workflow, not a doc.** Progress, gating, review, and sign-off are first-class state, not prose to read.
4. **Leadership visibility is a byproduct, not extra work.** Team-health signals fall out of the same tasks people already complete.
5. **Multi-provider by default.** No single LLM or integration is load-bearing; the platform degrades gracefully across providers.

## Accessibility & Inclusion

No product-specific accessibility standard was established beyond general good practice.
