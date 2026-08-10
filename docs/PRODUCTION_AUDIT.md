# 🔍 Production Deployment Audit — Comprehensive Findings

**Date:** July 2026 (updated Aug 2026)  
**Status:** ✅ **Production-ready at the code level** — all P0 boot blockers and P1 items are fixed. Remaining items are manual GitHub secret setup (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `RENDER_DEPLOY_HOOK_URL`) plus the P2 backlog.

---

## 1. Environment Variables Audit

### ✅ Configured Properly

| Variable | Source | Status |
| ---------- | -------- | -------- |
| `ENV` (→ `production`) | `docker-compose.prod.yml` | ✅ Set |
| `ENVIRONMENT` (→ `production`) | `docker-compose.prod.yml` | ✅ Set (alias) |
| `JWT_SECRET` | `.env.example`, `docker-compose.prod.yml` | ✅ Template exists — naming mismatch fixed |
| `DATABASE_URL` (asyncpg) | `docker-compose.prod.yml`, `DEPLOYMENT.md` | ✅ Passed through |
| `REDIS_URL` | Railway auto-injects | ✅ Railway-managed |
| `CORS_ALLOWED_ORIGINS` | `docker-compose.prod.yml`, `DEPLOYMENT.md` | ✅ Configurable |
| LLM keys (OpenRouter, Gemini, etc.) | All workflows, env files | ✅ Template exists |

### ~~❌ Missing / Incomplete~~ ✅ **FIXED**

| Variable | Status |
| ---------- | -------- |
| `PII_ENCRYPTION_KEY` | ✅ Added to `docker-compose.prod.yml` + root `.env.example` |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | ✅ Added to `docker-compose.prod.yml` + root `.env.example` |
| `GITHUB_TOKEN` | ✅ Added to `docker-compose.prod.yml` + root `.env.example` |
| `REDIS_URL` | ✅ Constructed in `docker-compose.prod.yml` as `redis://:${REDIS_PASSWORD}@redis:6379/0` (Railway auto-injects) |
| `TRUST_PROXY` | ✅ Set to `true` in `docker-compose.prod.yml` (Railway requirement) |
| `RAZORPAY_*` | ✅ Replaced Stripe vars in root `.env.example` (Aug 2026) |

**Remaining:** Slack vars, SENTRY_DSN — depend on service setup, not P0 blockers.

---

## 2. CORS Configuration Audit

### Current Config (in `main.py`)

```python
_cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", 
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
)

# CORS origin regex — configurable via CORS_ALLOWED_ORIGIN_REGEX env var
_cors_regex = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https://(onramp|onramp-[a-z0-9]+)\.vercel\.app$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
)
```

### Issues

| # | Issue | Severity |
| --- | ------- | ---------- |
| 1 | **`allow_origin_regex` is now configurable via `CORS_ALLOWED_ORIGIN_REGEX` env var** — defaults to Vercel pattern for backward compat, operators can set custom domain patterns | ✅ Fixed |
| 2 | **`allow_origins` default includes only localhost** — production deployment on Railway/Vercel REQUIRES `CORS_ALLOWED_ORIGINS` to be set. The `DEPLOYMENT.md` documents this correctly but the default fallback means a misconfigured production deploy will silently fail with CORS errors in the browser | ⚠️ Medium |
| 3 | **OAuth redirect URLs** in `auth.py` read `CORS_ALLOWED_ORIGINS` to determine the redirect target — same issue, the default is localhost | ⚠️ Medium |
| 4 | `TRUST_PROXY` must be `true` on Railway for correct client IP detection in rate limiting and auth | ✅ Fixed in docker-compose.prod.yml |

---

## 3. Database Connection String Audit

### ✅ Connection pooling parameters — all configurable

```python
pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "20"))
pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))
pool_recycle = int(os.getenv("DB_POOL_RECYCLE", "1800"))
```

### ⚠️ SSL mode

- Defaults to `require` in production — correct
- `docker-compose.prod.yml` overrides to `prefer` — acceptable for Docker internal networking
- Railway injects `DATABASE_URL` automatically when PostgreSQL addon is attached

### ❌ DATABASE_URL not in root `.env.example`

The root `.env.example` (used by `docker-compose`) does NOT include `DATABASE_URL`. The `docker-compose.prod.yml` constructs it inline from `DB_PASSWORD`. This is correct but the root `.env.example` needs to define `DB_PASSWORD`.

---

## 4. Docker / Deployment Configuration Audit

### `docker-compose.prod.yml`

| Issue | Severity |
| ------- | ---------- |
| Uses **Python 3.11** in the Dockerfile, but app is written for **3.12** (see `pyproject.toml`) | ⚠️ Medium — most 3.11 code works, but potential compatibility |
| **No `JWT_SECRET_KEY` default** referenced — the variable is passed through as `${JWT_SECRET_KEY}` but the root `.env.example` has `JWT_SECRET_KEY=change-me-to-a-random-secret-min-32-chars` | ✅ Documented |
| **`PII_ENCRYPTION_KEY` not passed** through to the backend container | ❌ High |
| **Missing healthcheck result forwarding** — no restart policy on failure beyond `unless-stopped` | ⚠️ Low |
| **No readiness probe** between backend → frontend dependency | ⚠️ Low — unlikely to cause issues |

### `Dockerfile` (root)

| Issue | Severity |
|-------|----------|
| ✅ Now uses `python:3.12-slim-bookworm` — aligned with `pyproject.toml` | ✅ Fixed |

### `web/Dockerfile`

| Issue | Severity |
|-------|----------|
| ✅ Uses Node 20 Alpine — correct |
| ✅ Nginx serves built assets — correct |

### Nginx Configuration

| Issue | Severity |
| ------- | ---------- |
| ✅ `proxy_pass http://backend:8000` — correct internal DNS |
| ✅ `Cache-Control: public, immutable` — good for static assets |
| ✅ Gzip enabled |
| ✅ Security headers added: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy | ✅ Fixed |
| ⚠️ No rate limiting at Nginx level — relies entirely on backend middleware | ⚠️ Low |

---

## 5. Deployment Path Nuance

| Platform | `REDIS_URL` | Vault/Secrets | Status |
| ---------- | ------------ | --------------- | -------- |
| **Railway (Option A)** | Auto-injected by Redis addon | Railway Dashboard env vars | ✅ Works for REDIS_URL — but PII/GITHUB keys still need manual entry |
| **Docker self-hosted (Option B)** | Must be constructed from `REDIS_HOST`+`REDIS_PORT`+`REDIS_PASSWORD` | Must be in `.env` file | ❌ `REDIS_URL` never assembled from individual vars |

## 6. CI/CD Pipeline Audit

### Backend CI (`backend.yml`)

| ✅ Working | Compileall, alembic migrations, pytest (memory + postgres) |
| ----------- | ------ |
| ✅ Test CI | Runs against in-memory and PostgreSQL |
| ✅ Fixed | Load tests (`test_load_performance.py`) — runs in dedicated step with 120s timeout |
| ✅ Fixed | Contract tests (`test_api_contract.py`) — runs in dedicated named step |
| ✅ Configured | `pytest-cov` coverage across all 4 test steps (unit, contract, load, postgres) |

### Frontend CI (`frontend.yml`)

| ✅ Working | TypeScript check, vitest, build |
| ----------- | ------ |
| ✅ Sound | Good isolation and caching |
| ❌ Missing | Playwright E2E tests — should run in CI |
| ❌ Missing | `@axe-core/playwright` a11y tests — should run |

### CD Pipeline (`cd.yml`)

| Issue | Severity |
| ------- | ---------- |
| ❌ **Vercel token and project IDs not configured** — deploy step is skipped at runtime (echoes "not configured") | ❌ **BLOCKER** |
| ❌ **Render deploy hook URL not configured** — backend deploy is skipped | ❌ **BLOCKER** |
| ❌ **No production environment validation in pipeline** — no check that env vars are set before deploy | ⚠️ Medium |
| ❌ **No smoke test after deploy** — doesn't verify the deployed app responds | ⚠️ Medium |

---

## 6. Authentication / JWT Audit

### ~~🔴 CRITICAL: `JWT_SECRET` vs `JWT_SECRET_KEY` naming mismatch~~ ✅ **FIXED**

All config files now use `JWT_SECRET` consistently. The mismatch between `auth.py` (reading `JWT_SECRET`) and `docker-compose.prod.yml`/K8s/`.env.example` (passing `JWT_SECRET_KEY`) is resolved.

**Changed files:**

- `docker-compose.yml` — `JWT_SECRET_KEY` → `JWT_SECRET`
- `docker-compose.prod.yml` — `JWT_SECRET_KEY` → `JWT_SECRET`
- `kubernetes/deployment.yaml` — `JWT_SECRET_KEY` → `JWT_SECRET`
- `kubernetes/config.yaml` — `JWT_SECRET_KEY` → `JWT_SECRET`
- `.env.example` (root) — `JWT_SECRET_KEY` → `JWT_SECRET`

### Other JWT Issues

| Issue | Status |
| ------- | -------- |
| `JWT_SECRET` has a hardcoded default fallback — now verified at boot | ✅ Fixed (`_validate_production_env()` checks for insecure default) |
| JWT uses HS256 with 7-day expiry — acceptable for v1 | ✅ |
| No JWT refresh token rotation | ⚠️ Low (noted in roadmap) |
| `_validate_production_env()` now checks `JWT_SECRET` + `PII_ENCRYPTION_KEY` | ✅ Fixed |
| `TRUST_PROXY=true` set in `docker-compose.prod.yml` | ✅ Fixed |

---

## 7. Security Audit Summary

| Check | Status |
| ------- | -------- |
| PII encryption at rest (Fernet) | ✅ Yes — but key is NOT provisioned in production config |
| Boot-time env validation | ✅ Yes — but missing vars prevent startup |
| CORS allowlist | ✅ Configurable — but regex is Vercel-specific |
| Rate limiting | ✅ Redis-backed in production — but REDIS_URL must be set |
| Secrets management | ❌ No vault integration (env vars only) |
| Security headers (Nginx) | ✅ CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy |
| Dependency scanning in CI | ✅ pip-audit in backend.yml + npm audit in frontend.yml |
| Third-party penetration test | ❌ Not done |

---

## 📋 Action Items: Checklist to Unblock Production

### P0 — Boot Blockers

| # | Action | Status |
| --- | -------- | -------- |
| 1 | Add `PII_ENCRYPTION_KEY` to `docker-compose.prod.yml` backend env block | ✅ Fixed |
| 2 | Add `GITHUB_TOKEN_ENCRYPTION_KEY` to `docker-compose.prod.yml` backend env block | ✅ Fixed |
| 3 | Add billing env vars to root `.env.example` — Stripe → Razorpay (`RAZORPAY_*`) | ✅ Fixed |
| 4 | Add `REDIS_URL` construction from individual Redis vars | ✅ Fixed |
| 5 | Add `GITHUB_TOKEN` to `docker-compose.prod.yml` backend env block | ✅ Fixed |
| 6 | Fix `JWT_SECRET` vs `JWT_SECRET_KEY` naming mismatch | ✅ Fixed |
| 7 | Set up `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` in GitHub secrets | ➡️ Manual (GitHub Settings) |
| 8 | Set up `RENDER_DEPLOY_HOOK_URL` in GitHub secrets | ➡️ Manual (GitHub Settings) |
| 9 | Fix K8s probes (`/api/v1/observability/health/live` → `/health` + `/ready`) | ✅ Fixed (Aug 2026) |
| 10 | Fix K8s dead `CORS_ORIGINS` → `CORS_ALLOWED_ORIGINS`; add `REDIS_URL` to Secret | ✅ Fixed (Aug 2026) |
| 11 | Fix docker-compose CORS typo `http:localhost:80` → `http://localhost:80` | ✅ Fixed (Aug 2026) |
| 12 | Rewrite `rotate-secrets.yml` (previously generated keys that were never stored) | ✅ Fixed (Aug 2026) |
| 13 | API key rotation: pepper versioning + legacy fallback (`API_KEY_ALLOW_LEGACY_PEPPER`) | ✅ Fixed (Aug 2026) |
| 14 | PII backfill migration 022 — encrypt pre-existing plaintext `email`/`name` | ✅ Fixed + applied live (Aug 2026) |

### P1 — Must-Fix Before GA

| # | Action | Status |
| --- | -------- | -------- |
| 9 | Update `allow_origin_regex` in `main.py` — made configurable via `CORS_ALLOWED_ORIGIN_REGEX` env var | ✅ Fixed |
| 10 | Add `TRUST_PROXY=true` to `docker-compose.prod.yml` | ✅ Fixed |
| 11 | Add pre-deploy env validation & smoke test to CD pipeline | ✅ Fixed (cd.yml) |
| 12 | Update `_validate_production_env()` to check `JWT_SECRET` + `PII_ENCRYPTION_KEY` | ✅ Fixed |
| 13 | Update Dockerfile from `python:3.11` to `python:3.12` | ✅ Fixed (all 4 stages: builder, production, development, celery-worker) |
| 14 | Add Nginx security headers (CSP, HSTS, X-Frame-Options) to `nginx.conf` | ✅ Fixed (6 headers at server level + duplicated in / location per Nginx inheritance rules) |

### P2 — Should-Fix Soon

| # | Action | Est. Time |
| --- | -------- | ----------- |
| 15 | Add load tests + contract tests to backend CI | ✅ Fixed — 3 named steps in `backend.yml` |
| 16 | Add Playwright E2E + a11y tests to frontend CI | 15 min |
| 17 | Add pytest-cov coverage reporting to CI (all 4 test steps) | ✅ Fixed |
| 18 | Set up `SENTRY_DSN` and verify error capture works | 5 min |
| 19 | Set up dependency vulnerability scanning (e.g., `pip audit`, `npm audit`) | 10 min |
| 20 | Run `npm audit fix` on the web package | 2 min |

---

**Summary:** All P0 code-level blockers fixed (the only remaining items are the 2 manual GitHub-secret setups — `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` and `RENDER_DEPLOY_HOOK_URL` — required to activate the CD deploy steps). **6 of 6 P1 items fixed.** P2 backlog: Playwright E2E/a11y in frontend CI, Sentry DSN, `npm audit fix`. The Railway+Vercel deployment path is unblocked at the code level — add the 4 GitHub secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, RENDER_DEPLOY_HOOK_URL) and deploy.
