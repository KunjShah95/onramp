# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x (main) | ✅ |
| < 1.0   | ❌ |

## Reporting a Vulnerability

Open a private security advisory on GitHub or email `security@onramp.dev`. Expect an initial response within 48h. If accepted, a fix will be prioritized and a coordinated disclosure timeline agreed; if declined, the reasoning will be shared.

## Authentication & Authorization

- **JWT (HS256)**: 7-day access token + rotating refresh tokens (`POST /api/v1/auth/refresh`). Passwords hashed with **bcrypt**; change via `POST /api/v1/auth/forgot-password` / `reset-password` with short-lived JWT.
- **OAuth**: Google + GitHub login with **CSRF state tokens** (Redis) + account linking. Optional **Neon Auth JWKS** (RS256) verification path.
- **API keys**: `cf_` keys, **HMAC-SHA256** hashed with `API_KEY_HMAC_SECRET` (versioned pepper), scopes + expiry + credit limits.
- **RBAC**: 9 roles (`junior_dev` → `ceo`/`admin`/`hr`), `require_team_role` hierarchy checks, organization + team scoping.
- **Field-level encryption**: PII + stored provider/GitHub tokens encrypted with **Fernet** (`PII_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`); keys validated at boot.

## Transport & Headers

- **CORS**: explicit allowlist (`CORS_ALLOWED_ORIGINS`) + Vercel preview regex (`CORS_ALLOWED_ORIGIN_REGEX`); credentials only for allowed origins.
- **Security headers**: HSTS (prod), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; opt-in CSP.
- **Body size limit**: 4 MB default (`MAX_REQUEST_BODY_BYTES`, 413).
- **TLS**: terminate at Render/Railway + Nginx; `BACKEND_URL`/`FRONTEND_URL` must be `https://` in prod (boot warning).

## Rate Limiting & Abuse

- **Redis-backed** `RateLimitMiddleware` (200 req/min default, tighter on LLM routes). `ENV=production` requires `REDIS_URL` or boot fails.
- Request correlation IDs (`X-Request-ID`) + Prometheus metrics for rate-limit and auth events.

## Webhooks & Billing

- **GitHub webhook**: HMAC-SHA256 signature verified (`GITHUB_WEBHOOK_SECRET`).
- **Razorpay webhook**: signature verified (`RAZORPAY_WEBHOOK_SECRET`); required when `RAZORPAY_KEY_ID` is set, otherwise boot warns.

## Production Hardening

- **Boot fail-fast** (`backend/app/main.py:100`): when `ENV=production`, validates `DATABASE_URL`, `JWT_SECRET` (not default), `PII_ENCRYPTION_KEY`, `API_KEY_HMAC_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `REDIS_URL`, Fernet key structure, `DATABASE_URL`/`REDIS_URL` schemes, numeric env bounds. LLM keys are a *warning* (DB-managed keys allowed).
- **DB**: `asyncpg` + `DB_SSL_MODE` (`verify-full` in prod), pool sizing via `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`.
- **Container**: Docker hardened (non-root user, healthchecks), `docker-compose.prod.yml` + `render.yaml` (non-root Nginx :8080).
- **Secrets**: never commit `.env`; rotate `JWT_SECRET`/`PII_ENCRYPTION_KEY`/`API_KEY_HMAC_SECRET` via Render env group / secret manager. Audit for leaked keys before tagging: `git grep -E 'sk-|AIza|ghp_|whsec_|AKIA'`.

## Data & Privacy

- PII encrypted at rest (Fernet); user deactivation (`users.deactivated_at`) + team-scoped reads.
- Audit events (`audit_events` table, `GET /api/v1/audit`) for sensitive actions.
- See `GAPS.md` for the current gap audit and `versions.md` for the hardening roadmap (DB SSL, CSP at Nginx, dependency scanning, backup restore, etc.).

## Dependencies

- Run `pip-audit` / `npm audit --audit-level=high` locally; CI gating is planned (see `features_mvp.md:2.88`).
- Pinned deps via `requirements.txt` + `package-lock.json`.

## References

- `backend/app/main.py` — middleware stack + prod validation + public-path allowlist
- `backend/app/middleware/` — auth, rate-limit, security headers
- `docs/` — `ARCHITECTURE.md`, `LLM_ROUTING.md`, `PRODUCTION_AUDIT.md`
