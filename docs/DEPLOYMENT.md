# Onramp 2.0 — Deployment Guide

Deploy Onramp to production. For local development, see [QUICK_START.md](QUICK_START.md).

## Architecture

```
                         ┌─────────────────┐
                         │    Vercel       │
                         │  (Frontend)     │
                         │  React + Vite   │
                         └───────┬─────────┘
                                 │ HTTPS
                         ┌───────▼─────────┐
                         │    Railway      │
                         │  (Backend)      │
                         │  FastAPI        │
                         └───┬───────┬─────┘
                             │       │
                     ┌───────▼───┐ ┌─▼──────────┐
                     │ PostgreSQL│ │ Redis      │
                     │ (Railway  │ │ (Railway   │
                     │  plugin)  │ │  plugin)   │
                     └───────────┘ └────────────┘
```

## Option A: Railway + Vercel (Recommended)

The fastest path to production. No server management needed.

### Prerequisites

- [Railway](https://railway.app) account (backend, database, redis)
- [Vercel](https://vercel.com) account (frontend)
- GitHub account connected to both Railway and Vercel
- OpenRouter API key or Gemini API key
- GitHub personal access token (for repo analysis)

---

### Step 1: Deploy Backend to Railway

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project from the repo root
railway init

# 4. Deploy the backend
cd backend
railway up
```

**Or use the Railway Dashboard (easier):**

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Set **Root Directory** to `backend/`
5. Railway auto-detects `railway.json` and the Dockerfile

**Add PostgreSQL:**
1. In the Railway dashboard, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically adds `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` to the backend environment

**Add Redis (required in production):**
1. Click **+ New** → **Database** → **Add Redis**
2. Railway automatically adds `REDIS_URL` to the backend environment
3. `REDIS_URL` is boot-required under `ENV=production` (rate limits, LLM cache, OAuth state store, repo index cache)

**Set Environment Variables** in Railway Dashboard → Backend Service → Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `ENV` | `production` | Enables boot-time prod validation; disables `/docs` + seed router |
| `ENVIRONMENT` | `production` | Alias |
| `AUTH_DEV_BYPASS` | `false` | MUST be false in production |
| `CORS_ALLOWED_ORIGINS` | `https://onramp.vercel.app` | Add your Vercel domain |
| `TRUST_PROXY` | `true` | Railway runs behind a proxy |
| `JWT_SECRET` | `<random ≥ 32 chars>` | **Required** — boot validator rejects the dev default |
| `PII_ENCRYPTION_KEY` | `<Fernet key>` | **Required** — encrypts `users.email`/`name` at rest |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | `<Fernet key>` | **Required** — encrypts stored GitHub tokens |
| `API_KEY_HMAC_SECRET` | `<random ≥ 32 chars>` | **Required** — HMAC pepper for API key hashing |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Or `GEMINI_API_KEY` |
| `GITHUB_TOKEN` | `ghp_...` | GitHub personal access token (repo analysis) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | GitHub OAuth App — required for GitHub login & account linking |
| `GITHUB_WEBHOOK_SECRET` | — | HMAC secret for the GitHub push webhook |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Required for Google login |
| `BACKEND_URL` | `https://your-backend.railway.app` | Used to build OAuth redirects |
| `FRONTEND_URL` | `https://onramp.vercel.app` | OAuth callback landing page |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | — | Razorpay API keys — enables checkout & top-ups |
| `RAZORPAY_WEBHOOK_SECRET` | `whsec_...` | Webhook signature secret (required when Razorpay enabled) |
| `RAZORPAY_PLAN_STARTUP` | `plan_...` | Razorpay plan ID for startup tier |
| `RAZORPAY_PLAN_PROFESSIONAL` | `plan_...` | Razorpay plan ID for professional tier |
| `SENTRY_DSN` | `https://...` | Optional |
| `ENABLE_API_DOCS` | `false` | Set `true` to expose Swagger `/docs` in production |
| `DB_SSL_MODE` | `require` | Railway Postgres requires SSL |
| `DB_POOL_SIZE` | `10` | |
| `DB_MAX_OVERFLOW` | `20` | |

Your backend URL will be: `https://backend-service-name.railway.app`

### Step 3: Deploy Frontend to Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Deploy from the web/ directory
cd web
vercel --prod
```

**Or use the Vercel Dashboard (easier):**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. **CRITICAL:** Set **Root Directory** to `web/` — this is required for the monorepo setup
5. Framework preset: **Vite** (auto-detected)
6. Build Command: `npm run build` (auto-set)
7. Output Directory: `dist` (auto-set)

> **Note:** Because we set Root Directory to `web/`, the `vercel.json` at the repo root uses root-dir-relative paths. The build command `npm run build` runs inside `web/`, so it uses `web/package.json`. Both approaches (dashboard Root Directory + vercel.json) are now aligned.

**Set Environment Variables** in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://backend-service-name.railway.app/api/v1` | Your Railway backend URL |
| `VITE_WAITLIST_URL` | `https://backend-service-name.railway.app` | Same as backend URL |

> **Note:** Auth is first-party — email/password (JWT) plus Google and GitHub
> OAuth, with GitHub **account linking** for existing users. No Neon Auth or
> Firebase configuration is needed. To enable Google/GitHub login, register
> OAuth Apps and set the `*_CLIENT_ID` / `*_CLIENT_SECRET` + `BACKEND_URL` /
> `FRONTEND_URL` vars above.
>
> Register a GitHub OAuth App at https://github.com/settings/developers →
> New OAuth App. Authorization callback URL:
> `{BACKEND_URL}/api/v1/auth/oauth/github/callback`. Requested scopes:
> `read:user user:email`.

**Deploy:** Click **Deploy**. Vercel will build and deploy automatically.

Your frontend URL will be: `https://onramp.vercel.app` (you can rename in Vercel dashboard).

### Step 4: Post-Deployment Checks

```bash
# 1. Verify backend liveness + readiness
curl https://your-backend.railway.app/health
# Expected: {"status": "ok", "version": "1.0.0", "uptime_seconds": ...}
curl https://your-backend.railway.app/ready
# Expected: {"status": "ready", "checks": {"database": {...}, "redis": {...}}}

# 2. Verify API docs (only if you set ENABLE_API_DOCS=true)
# Open: https://your-backend.railway.app/docs
# Should show Swagger UI — otherwise it 404s by design in production

# 3. Open frontend
# https://onramp.vercel.app
# Sign in with email/password, Google, or GitHub → should redirect to dashboard

# 4. Test the full flow
# - Create a team
# - Invite a team member
# - Analyze a repository
# - Generate a learning path
# - Create and complete tasks
# - Link a GitHub account from Profile → confirm it appears on /auth/me
```

### Step 5: Configure Razorpay Webhook (Optional)

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/app/webhooks)
2. Click **Add webhook**
3. URL: `https://your-backend.railway.app/api/v1/billing/webhook`
4. Events to send:
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.completed`
   - `subscription.cancelled`
   - `subscription.pending`
   - `subscription.halted`
   - `payment.captured`
   - `payment.failed`
5. Click **Create webhook**
6. Copy the **Secret** (`whsec_...`)
7. Add it as `RAZORPAY_WEBHOOK_SECRET` in Railway

### Step 6: CI/CD Setup

Once Railway and Vercel are connected to GitHub, deployments are automatic:

- **Backend:** Push to `main` → Railway auto-deploys from `backend/` directory
- **Frontend:** Push to `main` → Vercel auto-deploys from `web/` directory

---

## Option B: Docker Self-Hosted

For teams that prefer full control over infrastructure. See `docker-compose.prod.yml`.

```bash
# Clone the repository
git clone https://github.com/your-org/onramp.git
cd onramp

# Configure environment
cp .env.production.example .env.production
# Edit .env.production with production values

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

The production Docker Compose includes:
- **Backend** (FastAPI) — 2 replicas, resource-limited
- **PostgreSQL** — v16 Alpine, persistent volume
- **Redis** — v7 Alpine, RDB/AOF persistence
- **Nginx** — reverse proxy with SSL termination

For Kubernetes deployment, see the `kubernetes/` directory.

For GCP deployment with Terraform, see `infrastructure/terraform/`.

---

## Environment Variables Reference

### Backend (set in Railway)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENV` | No | `development` | Set to `production` |
| `DATABASE_URL` | Yes | — | Set automatically by Railway PostgreSQL |
| `REDIS_URL` | **Yes (prod)** | — | Boot-required in production; set automatically by Railway Redis |
| `JWT_SECRET` | **Yes (prod)** | — | HS256 signing secret (≥ 32 chars) |
| `PII_ENCRYPTION_KEY` | **Yes (prod)** | — | Fernet key for PII at rest |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | **Yes (prod)** | — | Fernet key for stored GitHub tokens |
| `API_KEY_HMAC_SECRET` | **Yes (prod)** | — | HMAC pepper for API key hashing |
| `CORS_ALLOWED_ORIGINS` | Yes | `http://localhost:5173` | Vercel frontend URL |
| `TRUST_PROXY` | Yes | `false` | Set to `true` on Railway |
| `OPENROUTER_API_KEY` | See notes | — | At least one AI key required |
| `GEMINI_API_KEY` | See notes | — | Free alternative to OpenRouter |
| `GITHUB_TOKEN` | Yes | — | For repo cloning/issues |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | For GitHub auth | — | GitHub OAuth App |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For Google auth | — | Google OAuth App |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | No | — | For billing (INR) |
| `RAZORPAY_WEBHOOK_SECRET` | No | — | For webhook verification |
| `SENTRY_DSN` | No | — | For error monitoring |

### Frontend (set in Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | `http://localhost:8000/api/v1` | Railway backend URL + `/api/v1` |
| `VITE_WAITLIST_URL` | No | `http://localhost:3008` | Backend URL (same as above) |

---

## Razorpay Configuration

1. Create a webhook endpoint in Razorpay Dashboard (`https://dashboard.razorpay.com/app/webhooks`)
2. URL: `https://your-backend.railway.app/api/v1/billing/webhook`
3. Events to listen for: `subscription.activated`, `subscription.charged`, `subscription.completed`, `subscription.cancelled`, `subscription.pending`, `subscription.halted`, `payment.captured`, `payment.failed`
4. Create plans in Razorpay Catalog → set plan IDs in `RAZORPAY_PLAN_*` env vars
5. Credit wallet top-ups use Razorpay **orders** + Checkout.js with server-side signature verification (`POST /billing/credits/order` + `/billing/credits/order/verify`); webhook `payment.captured` also credits wallets (idempotent per payment)

---

## Database Migrations

Railway applies migrations during deployment. If you need to run them manually:

```bash
# Connect to Railway PostgreSQL via CLI
railway run python -m alembic upgrade head
```

---

## Cost Estimates (Railway + Vercel)

| Service | Plan | Estimated Monthly |
|---------|------|------------------|
| Railway (backend + Postgres + Redis) | Starter ($5) or Developer ($20) | $5–20 |
| Vercel (frontend) | Hobby (free) | $0 |
| OpenRouter API | Pay-as-you-go | $5–50 |
| GitHub PAT | Free | $0 |
| **Total** | | **$5–70/month** |

---

## Monitoring

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness probe — always 200 while running |
| `GET /ready` | Readiness — 503 when Postgres/Redis unreachable |
| `GET /metrics` | Prometheus metrics |
| `GET /docs` | Swagger API docs — **off by default in production** (`ENABLE_API_DOCS=true`) |
| Sentry | Error tracking (configure `SENTRY_DSN`) |

---

## Troubleshooting

### Backend won't start

Check Railway logs:
```
railway logs
```

Common issues:
- `DATABASE_URL` not set → Add Railway PostgreSQL plugin
- Port binding error → Railway uses `PORT` env var, not 8000

### Frontend can't reach backend

Check browser console for CORS errors. Verify:
1. `VITE_API_URL` in Vercel matches the Railway backend URL
2. `CORS_ALLOWED_ORIGINS` in Railway includes the Vercel domain
3. `TRUST_PROXY=true` in Railway

### Auth fails

Common issues:
1. OAuth redirect mismatch
   - The GitHub/Google callback URL registered in the OAuth App must exactly match `{BACKEND_URL}/api/v1/auth/oauth/{provider}/callback`
2. `JWT_SECRET` not set (or still the dev default)
   - Boot fails in production — set a real ≥ 32-char secret
3. Auth dev bypass still enabled
   - Ensure `AUTH_DEV_BYPASS=false` in production
4. CORS mismatch
   - Ensure `CORS_ALLOWED_ORIGINS` in Railway includes the Vercel domain

### Build fails on Vercel

```
# If you see "Build failed with 8 errors" — check for TypeScript errors
cd web
npx tsc --noEmit  # Fix any errors locally
npm run build      # Verify build passes locally
```

---
