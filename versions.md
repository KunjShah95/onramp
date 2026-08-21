# Onramp 2.0 — Version Plan

> Release roadmap from current state → MVP GA → growth. Companion to `features_mvp.md`
> (the readiness checklist), `ROADMAP.md` (wedge roadmap), and `GAPS.md`. Dated 2026-08-21.

---

## v0.9.0 — Release Candidate (target: now → +1 week)

**Goal:** everything committed, tested, and deployable. No new features.

| Workstream | Contents |
|------------|----------|
| Commit & tag | Land the entire working tree: 5 security-critical fixes, RBAC fix, JSONB `in` filter, webhook encryption gate, Firebase/Firestore scrub, microservices archive, CI workflows, migration 003 |
| Tests | Restore backend test suite (target the documented 222-test surface); regression tests for each fixed critical; keep web 16/16 green |
| Dependencies | `requirements.lock.txt` via pip-compile; Docker + CI install from lock |
| CI | Backend + frontend workflows green on main; add ruff + eslint jobs |
| Secrets | Rotate DB password; production env via secret manager; boot-time fail-fast validation (`ENV=production` requires DATABASE_URL, `RAZORPAY_WEBHOOK_SECRET` when Razorpay enabled, `GITHUB_TOKEN_ENCRYPTION_KEY`, `REDIS_URL`, ≥1 LLM key; see `backend/app/main.py:100`) |

**Exit criteria:** clean `git status`, both CI workflows green, staging deploy boots with prod-shaped env.

---

## v1.0.0 — MVP GA (target: +2–3 weeks)

**Goal:** public production launch. Core product = the 4 onboarding features + teams + billing.

### Shipping feature set (already built, verified)
- **Core 4:** Architecture Explorer, First-PR Accelerator, Learning Path Generator, Repo Q&A (+ repo context index, Autopilot repo→PRs pipeline)
- **Wedge:** Ramp visibility + senior-time protection, Review Ops (load board + suggestion + consistency), HR headcount/retention
- **Team layer:** teams + RBAC (9 roles: junior_dev→ceo), email invites, playbooks + marketplace, task management with AI review + PR-merge auto-complete
- **Dashboards:** Mission Control / Executive / Senior Space / Trainee / HR + Ramp panels, DORA/velocity, cohort trends
- **Platform:** `cf_` API keys + usage tracking + tiered rate limits + credit wallet, TypeScript SDK, **Razorpay** billing (INR), notifications (in-app + Slack + digest + webhooks), integrations (GitHub, Slack, webhooks, Jira/Linear/GitLab/Bitbucket, feature flags)
- **Frontend:** 58+ components (44+ routes), 4 themes (slate/ember/aurora/paper), lazy-loaded

### Hardening required for GA (from features_mvp.md + ROADMAP.md)
- ✅ Redis-required distributed rate limiting; per-route limits on LLM routes — done (`main.py:100`)
- ✅ DB SSL `verify-full` (prod default) + nginx security headers (HSTS, CSP, X-Frame-Options) — done
- ✅ `except: pass` sweep → logged + Sentry — done; tz-aware datetimes — done (migration 005 `timestamptz`)
- ✅ Structured JSON logging (`LOG_FORMAT=json`) + Prometheus `/metrics` + `/health` `/ready` — done
- ⏳ Uptime monitoring + alerting on `/health` (UptimeRobot/Better Stack)
- ⏳ Postgres backup with verified restore (Neon PITR: verify retention, document restore)
- ⏳ Razorpay end-to-end with test-mode webhooks (checkout → active → cancel → downgrade)
- ✅ Privacy Policy + Terms pages (`/privacy`, `/terms`) — done
- ⏳ render.yaml off free tiers (paid host for prod)
- ✅ Readme/STATUS/CLAUDE consolidated — this update

**Exit criteria:** release gate §9 of `features_mvp.md` fully checked; 48h post-deploy Sentry/uptime clean.

---

## v1.1.0 — Stabilization & Ops (target: GA +4–6 weeks)

**Goal:** operational maturity; pay down deferred correctness debt.

- Finish Firestore→Postgres: typed tables for all remaining `DynamicDocument` collections; retire the JSONB catch-all
- Response envelope moved from body-buffering middleware to router layer; first-class SSE support for `/ask/query/stream`
- Background worker/queue (arq or celery) for digests, batch notifications, report generation
- Prometheus/Grafana profile enabled; LLM cost/latency dashboard per provider from usage_records
- Playwright E2E suite in CI (auth flow, core-4 happy paths, billing checkout)
- Dependency scanning (pip-audit, npm audit) gating CI
- Load-test baseline documented; p95 budgets enforced
- API key HMAC pepper; storage-interface contract tests

---

## v1.2.0 — Growth Features (target: GA +2–3 months)

**Goal:** differentiation and expansion, built on a stable base.

- **Unique differentiators to first-class:** Silent Pair Programming, Pattern Recognition, Regression Test Generator — promote from `/unique` into dedicated UX flows
- PR Review + roast mode polish; PR Description generator GitHub App integration
- Quiz/assessment expansion tied to learning paths
- Public API docs portal (generated from OpenAPI) + SDK examples
- Usage-based billing refinements (metered LLM spend per team)
- Admin panel expansion (waitlist management, feature flags)
- GDPR data-deletion self-service

---

## v2.0.0 — Enterprise (target: GA +6 months, demand-driven)

- SSO/SAML (Enterprise tier)
- Audit-log export + retention policies
- Self-hosted / VPC deployment story (the docker-compose.prod + k8s manifests exist — productize)
- VS Code extension (Silent Pair Programming in-editor)
- Multi-repo / org-wide onboarding analytics, DORA metrics
- SLA + status page

---

## Versioning policy

- **SemVer.** Breaking API changes bump major; `/api/v1` stays stable through all v1.x
- Git tags `vX.Y.Z` on main; every tag deployable from CI
- Alembic migrations append-only after v1.0.0 (no edits to shipped revisions)
- CHANGELOG.md maintained from v0.9.0 onward; `/changelog` page reads from it

| Version | Theme | Gate |
|---------|-------|------|
| v0.9.0 | Commit, test, lock | CI green, clean tree |
| v1.0.0 | MVP GA | features_mvp.md release gate |
| v1.1.0 | Ops maturity | E2E in CI, worker queue live |
| v1.2.0 | Growth | API portal, differentiators surfaced |
| v2.0.0 | Enterprise | SSO, self-host |
