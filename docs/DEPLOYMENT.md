# CodeFlow 2.0 — Deployment Guide

Deploy CodeFlow to production. For local development, see [QUICK_START.md](QUICK_START.md).

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
- [Firebase](https://console.firebase.google.com) project with Authentication enabled
- GitHub account connected to both Railway and Vercel
- OpenRouter API key or Gemini API key
- GitHub personal access token (for repo analysis)

---

### Step 1: Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. **Enable Authentication:**
   - Go to Authentication → Sign-in method
   - Enable: Email/Password, Google, GitHub
   - Add your authorized domains (your-vercel-domain.vercel.app)
4. **Create Web App:**
   - Project Settings → General → Your apps → Add app → Web
   - Copy the `firebaseConfig` values: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`
5. **Generate Service Account:**
   - Project Settings → Service Accounts → Generate New Private Key
   - Save the JSON file — you'll paste the contents into `FIREBASE_SERVICE_ACCOUNT_JSON`

### Step 2: Deploy Backend to Railway

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

**Add Redis (optional):**
1. Click **+ New** → **Database** → **Add Redis**
2. Railway automatically adds `REDIS_URL` to the backend environment

**Set Environment Variables** in Railway Dashboard → Backend Service → Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `ENV` | `production` | |
| `ENVIRONMENT` | `production` | |
| `FIREBASE_PROJECT_ID` | `your-project-id` | From Firebase Console |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `{ ... }` | Full JSON from service account key |
| `AUTH_DEV_BYPASS` | `false` | MUST be false in production |
| `CORS_ALLOWED_ORIGINS` | `https://codeflow.vercel.app` | Add your Vercel domain |
| `TRUST_PROXY` | `true` | Railway runs behind a proxy |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Or `GEMINI_API_KEY` |
| `GITHUB_TOKEN` | `ghp_...` | GitHub personal access token |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Optional — leave empty for stub |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Optional |
| `STRIPE_PRICE_STARTUP` | `price_...` | From Stripe dashboard |
| `STRIPE_PRICE_PROFESSIONAL` | `price_...` | From Stripe dashboard |
| `SENTRY_DSN` | `https://...` | Optional |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | `...` | Generate with Fernet |
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
| `VITE_FIREBASE_API_KEY` | `...` | From Firebase web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` | |
| `VITE_FIREBASE_PROJECT_ID` | `your-project-id` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `...` | |
| `VITE_FIREBASE_APP_ID` | `1:...:web:...` | |
| `VITE_API_URL` | `https://backend-service-name.railway.app/api/v1` | Your Railway backend URL |
| `VITE_WAITLIST_URL` | `https://backend-service-name.railway.app` | Same as backend URL |

**Deploy:** Click **Deploy**. Vercel will build and deploy automatically.

Your frontend URL will be: `https://codeflow.vercel.app` (you can rename in Vercel dashboard).

### Step 4: Post-Deployment Checks

```bash
# 1. Verify backend health
curl https://your-backend.railway.app/health
# Expected: {"status": "healthy"}

# 2. Verify API docs
# Open: https://your-backend.railway.app/docs
# Should show Swagger UI

# 3. Open frontend
# https://codeflow.vercel.app
# Sign in with Google → should redirect to dashboard

# 4. Test the full flow
# - Create a team
# - Invite a team member
# - Analyze a repository
# - Generate a learning path
# - Create and complete tasks
```

### Step 5: Configure Stripe Webhook (Optional)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. URL: `https://your-backend.railway.app/api/v1/billing/webhook`
4. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.trial_will_end`
5. Click **Add endpoint**
6. Copy the **Signing secret** (`whsec_...`)
7. Add it as `STRIPE_WEBHOOK_SECRET` in Railway

### Step 6: CI/CD Setup

Once Railway and Vercel are connected to GitHub, deployments are automatic:

- **Backend:** Push to `main` → Railway auto-deploys from `backend/` directory
- **Frontend:** Push to `main` → Vercel auto-deploys from `web/` directory

---

## Option B: Docker Self-Hosted

For teams that prefer full control over infrastructure. See `docker-compose.prod.yml`.

```bash
# Clone the repository
git clone https://github.com/your-org/codeflow.git
cd codeflow

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
| `REDIS_URL` | No | — | Set automatically by Railway Redis |
| `FIREBASE_PROJECT_ID` | Yes | — | From Firebase Console |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes (or path) | — | Full service account JSON |
| `CORS_ALLOWED_ORIGINS` | Yes | `http://localhost:5173` | Vercel frontend URL |
| `TRUST_PROXY` | Yes | `false` | Set to `true` on Railway |
| `OPENROUTER_API_KEY` | See notes | — | At least one AI key required |
| `GEMINI_API_KEY` | See notes | — | Free alternative to OpenRouter |
| `GITHUB_TOKEN` | Yes | — | For repo cloning/issues |
| `STRIPE_SECRET_KEY` | No | — | For billing |
| `STRIPE_WEBHOOK_SECRET` | No | — | For webhook verification |
| `SENTRY_DSN` | No | — | For error monitoring |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | No | — | For storing user tokens |

### Frontend (set in Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_FIREBASE_API_KEY` | Yes | — | From Firebase web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | — | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Yes | — | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | No | — | `<project>.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | No | — | From Firebase settings |
| `VITE_FIREBASE_APP_ID` | Yes | — | Firebase app ID |
| `VITE_API_URL` | Yes | `http://localhost:8000/api/v1` | Railway backend URL + `/api/v1` |
| `VITE_WAITLIST_URL` | No | `http://localhost:3008` | Backend URL (same as above) |

---

## Stripe Configuration

1. Create a webhook endpoint in Stripe Dashboard
2. URL: `https://your-backend.railway.app/api/v1/billing/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.trial_will_end`
4. Create products and prices in Stripe Catalog → set price IDs in env vars

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
| Firebase Auth | Spark (free tier) | $0 |
| OpenRouter API | Pay-as-you-go | $5–50 |
| GitHub PAT | Free | $0 |
| **Total** | | **$10–70/month** |

---

## Monitoring

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Simple health check (200 = healthy) |
| `GET /docs` | Swagger API documentation |
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
- `FIREBASE_SERVICE_ACCOUNT_JSON` invalid → Verify JSON is valid and properly escaped
- Port binding error → Railway uses `PORT` env var, not 8000

### Frontend can't reach backend

Check browser console for CORS errors. Verify:
1. `VITE_API_URL` in Vercel matches the Railway backend URL
2. `CORS_ALLOWED_ORIGINS` in Railway includes the Vercel domain
3. `TRUST_PROXY=true` in Railway

### Auth fails

Common issues:
1. Firebase project not configured for the frontend domain
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add `codeflow.vercel.app`
2. Service account JSON not set correctly in Railway
   - Use `FIREBASE_SERVICE_ACCOUNT_JSON` (inline JSON, properly escaped)
3. Auth dev bypass still enabled
   - Ensure `AUTH_DEV_BYPASS=false`

### Build fails on Vercel

```
# If you see "Build failed with 8 errors" — check for TypeScript errors
cd web
npx tsc --noEmit  # Fix any errors locally
npm run build      # Verify build passes locally
```

---
