# Onramp 2.0 — MVP Release Readiness Checklist

> Production-readiness audit for MVP release. Generated 2026-07-02 from live codebase verification
> (not from stale docs). Each item verified against the working tree.
>
> Legend: ✅ Done (verified) · 🔶 Done but uncommitted · ❌ Blocker · ⚠️ Should-fix · 📋 Nice-to-have

---

## 0. Snapshot (updated 2026-08-21)

| Area | State |
|------|-------|
| Backend (FastAPI, 42+ routers, 34 tables, 28 migrations) | Boots, compiles clean |
| Frontend (React 19, 58+ components / 44+ routes) | Builds, typechecks, **58+ Vitest tests pass**, 65+ Playwright E2E |
| Backend tests | ✅ `backend/tests/` — 63 files, 700+ tests (ramp/review-ops/benchmark incl.), passing locally (memory + PG) |
| Wedge | ✅ Built: ramp (Track·Quantify·Intercept), Review Ops, HR cohort/headcount, Phase 0 cost-model harness |
| CI workflows | ✅ Committed (`backend.yml`, `frontend.yml`). Backend job fixed: pytest-timeout + LLM-key-at-import (conftest) |
| Security criticals (5 from 2026-07-02 audit) | ✅ Fixed and committed; see `GAPS.md` + `SECURITY.md` |

**Verdict: release candidate + wedge built.** Remaining before GA: secrets rotation (§1.3), CI green on main, **Razorpay** E2E, backups, render tier off free, 5-team validation interviews (`ROADMAP.md`, `docs/validation-interview-script.md`).

---

## 1. ❌ Release Blockers (P0 — must fix before MVP)

### 1.1 Commit the working tree — ✅ DONE
Committed as `b03ee8b`…`ae75a67` (security fixes, Firebase scrub, microservices archive,
CI workflows, dep lock, test suite) and pushed to origin/main.
- [x] Commit in logical chunks
- [x] Migration 003 included
- [ ] Tag `v0.9.0` once CI is green on main

### 1.2 Backend test suite — ✅ DONE (47 tests)
`backend/tests/` restored with regression coverage for every fixed critical:
- [x] Auth middleware public-path matrix (regression for critical 1.1)
- [x] Session token-only auth (regression for critical 1.2)
- [x] Stripe webhook signature enforcement (regression for critical 1.5)
- [x] `query_documents` `"in"` filter (regression for 2.2)
- [x] RBAC / `require_minimum_role` matrix
- [x] Migration 003 data-fix-before-constraint ordering
- [x] Prod env boot validation
- [x] `pytest` green locally (47/47, verified with LLM keys stripped, CI-style)
- [ ] Confirm green in CI (two CI-only failures fixed: `pytest-timeout` not installed → commit `ae75a67`; `LLMClient()` raising at import without provider key → conftest sets dummy `GROQ_API_KEY`, pending commit)

### 1.3 Secrets hygiene — partially done
- [ ] **Rotate `DB_PASSWORD`** — local `.env` has weak throwaway value; production must use a strong generated credential from a secret manager (Render env group / Doppler / Vault), never a checked-in file
- [x] Startup fail-fast validation (`_validate_production_env` in `main.py` — requires `DATABASE_URL`, `RAZORPAY_WEBHOOK_SECRET` (when Razorpay enabled), `GITHUB_TOKEN_ENCRYPTION_KEY`, `REDIS_URL`, ≥1 LLM key; covered by `test_prod_env_validation.py`)
- [ ] Confirm no secrets in tracked files (audit scan was clean ✅ — re-run before tag: `git grep -E 'sk-|AIza|ghp_|whsec_|AKIA'`)
- [ ] Set `ALLOW_UNVERIFIED_RAZORPAY` / `ALLOW_UNVERIFIED_STRIPE` unset/false in all deployed envs (Razorpay is current; Stripe flag is historical)

### 1.4 Pin backend dependencies — ✅ DONE
- [x] `requirements.lock.txt` generated (commit `9a3a22d`); CI installs from lock
- [x] Web is fine (`package-lock.json` ✅)

### 1.5 Rate limiting distributed in production — ✅ DONE
- [x] `REDIS_URL` required when `ENV=production` (boot fail-fast in `main.py`)
- [x] Per-route limits on LLM endpoints (`rate_limit.py:33` — `/ask/`, `/ai/`, `/explore/` prefixes get a tighter `LLM_ROUTE_LIMIT`)

---

## 2. ✅ / 🔶 Security — fixed, needs commit + regression tests

All five criticals from the 2026-07-02 audit verified fixed in the working tree:

| # | Issue | State |
|---|-------|-------|
| 1.1 | Auth public-path `startswith` prefix bypass | 🔶 Fixed — exact set membership (`auth.py:129,136`) |
| 1.2 | Session `id` accepted as bearer token | 🔶 Fixed — token-only lookup |
| 1.3 | Migration 003 constraint-before-data-fix | 🔶 Fixed — `UPDATE` runs before `create_check_constraint` |
| 1.4 | CORS wildcard `*.vercel.app` + credentials | 🔶 Fixed — regex scoped to `^https://(onramp|onramp-[a-z0-9]+)\.vercel\.app$` |
| 1.5 | Stripe (now Razorpay) webhook trusted without signature | 🔶 Fixed — prod hard-fails; dev requires explicit `ALLOW_UNVERIFIED_RAZORPAY=true` (historical flag was `ALLOW_UNVERIFIED_STRIPE`) |

High-severity fixes also verified in tree:
- 🔶 `_is_admin` heuristic replaced with `users.is_admin` column check (`digest.py:192-199`)
- 🔶 GitHub token encryption hard-fails in production without key (`webhook_service.py:33`)
- 🔶 JSONB `"in"` filter implemented in `postgres_db.py` (no longer silent no-op)
- 🔶 Firebase npm dep removed; env examples scrubbed; render.yaml scrubbed
- 🔶 Frontend tests green (neon-auth mocked in `setup.ts`, 16/16 pass)

Remaining security hardening (⚠️ pre-GA):
- [x] DB SSL: production defaults to `verify-full` (`database/config.py` — `prefer` auto-upgrades when `ENV=production`)
- [x] API key hashing: HMAC-SHA256 with versioned pepper (`API_KEY_HMAC_SECRET`, `cf_` + 32-byte entropy; `SECURITY.md`)
- [x] Security headers at nginx: HSTS, X-Content-Type-Options, X-Frame-Options, CSP (`default-src 'none'; frame-ancestors 'none'`). Also removed nginx's wildcard `Access-Control-Allow-Origin: *` which duplicated (and would have broken) the backend's origin-scoped CORS
- [ ] 📋 Dependency scanning in CI (`pip-audit`, `npm audit --audit-level=high`)

---

## 3. Reliability & Correctness (P1 — fix before or immediately after MVP)

- [x] `except: pass` sweep complete — zero bare-pass handlers remain in `backend/app`
- [x] Datetimes: values are tz-aware (`datetime.now(timezone.utc)`); columns are `DateTime(timezone=True)` — migration 005 (`005_timezone_aware_datetimes.py`) applied ✅
- [ ] ⚠️ `ResponseWrapperMiddleware` buffers every JSON body + double-parses; fragile SSE exclusion by content-type. Move envelope to router layer or explicitly path-exclude `/ask/query/stream`
- [ ] ⚠️ `Team.to_dict` masks lazy-load errors as `member_count = 0` — require eager load, don't swallow
- [ ] ⚠️ Finish Firestore→Postgres: migrate remaining `DynamicDocument` JSONB collections (notifications, tasks, invites, prefs, playbooks, billing events) to typed tables; `firestore_db.py` deleted ✅
- [ ] 📋 Background worker/queue for digests (sequential iteration won't scale)

---

## 4. CI/CD & Deployment (P0/P1)

- [x] ✅ GitHub Actions: backend (compileall + alembic upgrade + pytest w/ service Postgres), frontend (tsc + vitest + build) — **commit them**
- [ ] ❌ Backend CI job will fail until tests exist (see 1.2)
- [ ] ⚠️ Add `eslint` to frontend CI (script exists, not in workflow)
- [ ] ⚠️ Add lint/format for backend (`ruff`) to CI
- [ ] ⚠️ render.yaml uses `plan: free` for API, Postgres, Redis — free tiers sleep + connection limits. Upgrade for production, or document as staging-only
- [ ] ⚠️ Decide the single deployment target: monolith (render.yaml / docker-compose.prod.yml). Microservices tree archived ✅ — delete `docker-compose.microservices.yml` reference confusion, document topology once
- [ ] ⚠️ Smoke test in deploy pipeline: hit `/health` + one authed endpoint post-deploy, auto-rollback on fail
- [ ] 📋 Staging environment mirroring production config

---

## 5. Observability (P1)

- [x] ✅ Sentry wired (env-gated, 10% traces in prod, no PII)
- [x] ✅ Request logging middleware
- [ ] ⚠️ Uptime monitoring + alerting on `/health` (UptimeRobot / Better Stack — 5 min setup)
- [x] Structured JSON logs in production (`LOG_FORMAT=json` → `app/logging_config.py`) ✅
- [x] Prometheus/Grafana profile scaffolded in `docker-compose.prod.yml` + `/metrics` (10 families) ✅
- [ ] 📋 LLM cost/latency dashboard per provider (usage_records already captured — surface them)

---

## 6. Data & Ops (P1)

- [ ] ❌ Backup policy: automated Postgres backups + one tested restore (Neon has PITR — verify retention setting; document restore procedure)
- [ ] ⚠️ Run `alembic upgrade head` against a production-clone to validate the full chain before release
- [ ] ⚠️ Connection pool sizing vs Neon/Render limits at `WORKERS=4`
- [ ] 📋 Data retention/deletion path for user accounts (GDPR baseline — needed the moment a EU user signs up)

---

## 7. Performance (P2)

- [ ] Run `scripts/load-test.js` against staging; capture p95 latency baseline for LLM + non-LLM routes
- [ ] Verify Redis caching hit rate on repo-analysis endpoints (`@cached` decorator exists ✅)
- [ ] Frontend: bundle audit (44+ lazy routes ✅ — check vendor chunk size), Lighthouse ≥ 90 on landing
- [ ] DB indexes review for hot queries (tasks, notifications lists)

---

## 8. Product Surface & Legal (P1 for public SaaS)

- [x] Privacy Policy + Terms of Service pages (`/privacy`, `/terms` — public routes, linked from landing footer)
- [ ] ⚠️ Razorpay billing end-to-end verification with real test-mode webhook events (checkout → active → cancel → downgrade)
- [ ] ⚠️ Transactional email deliverability: SendGrid domain auth (SPF/DKIM) so invites don't land in spam
- [x] STATUS.md / Readme / CLAUDE.md updated — counts truthful (700+ backend, 58+ frontend), Razorpay references correct; this update consolidates top-level markdown
- [ ] 📋 Error pages (404/500) + maintenance mode — `NotFoundPage` exists; expand to 500/maintenance
- [ ] 📋 Consolidate top-level markdown (Readme.md, PLAN.md, STATUS.md) into README + docs/ — partially done via `docs/`

---

## 9. Release Gate (run in order)

1. Commit everything (§1.1), including migration 003 + workflows
2. Restore backend tests, green locally (§1.2)
3. Pin deps (§1.4), rebuild Docker image from lock
4. Push → both CI workflows green
5. Rotate secrets, configure prod env via secret manager (§1.3), Redis required (§1.5)
6. Deploy to staging → alembic upgrade → smoke test → load test
7. Razorpay test-mode E2E (§8)
8. Backup verified restorable (§6)
9. Legal pages live (§8)
10. Tag `v1.0.0`, deploy production, monitor Sentry + uptime for 48h

---

*Verified against working tree 2026-08-21 (this refresh). Historical audit was 2026-07-02. Cross-reference: `GAPS.md`, `versions.md`, `ROADMAP.md`, `STATUS.md`.*
