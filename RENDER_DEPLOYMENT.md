# Render Deployment Guide

> See also: `Readme.md:Deploying to Render` (blueprint overview) + `render.yaml` (authoritative blueprint) + `docs/DEPLOYMENT.md`.

**Issue Fixed:** Celery worker failing to connect to Redis (localhost:6379 unreachable in cloud) — solved by wiring `REDIS_URL` from the Key Value instance's private connection string on all services.

---

## Architecture

Onramp runs as **4 Render services** (defined in `render.yaml`):

1. **Web Service** (`onramp-api`) — FastAPI / uvicorn, health check `/health`
2. **Background Worker** (`onramp-worker`) — Celery worker (`agent-tasks,analytics-tasks,notification-tasks,default`)
3. **Background Worker** (`onramp-beat`) — Celery beat scheduler (digests, nightly sweeps, repo indexes, stuck checks)
4. **Key Value** (`onramp-redis`) — Redis (Celery broker + result store, private-network only)

All four share the `onramp-shared` env group so secrets stay in sync.

---

## Setup Steps

### 1. Create Redis Service

In Render dashboard:

- **Name:** `onramp-redis`
- **Database:** Redis
- **Plan:** Free (dev) or appropriate tier (prod)
- **Copy connection string**

Example: `redis://red-xxx:6379`

### 2. Create Web Service

**File:** `render.yaml` or dashboard config

```yaml
# Use the render.yaml blueprint (recommended) — Dashboard → New → Blueprint → connect this repo.
# It creates all 4 services + the shared env group. Manual equivalent:
services:
  - type: keyvalue
    name: onramp-redis
    plan: free
    ipAllowList: []   # private-network only

  - type: web
    name: onramp-api
    runtime: docker
    rootDir: backend
    plan: starter
    healthCheckPath: /health
    envVars:
      - fromGroup: onramp-shared
      - key: REDIS_URL
        fromService: { name: onramp-redis, type: keyvalue, property: connectionString }

  - type: worker
    name: onramp-worker
    runtime: docker
    rootDir: backend
    dockerCommand: celery -A app.tasks.celery_app worker -l info -Q agent-tasks,analytics-tasks,notification-tasks,default
    envVars:
      - fromGroup: onramp-shared
      - key: REDIS_URL
        fromService: { name: onramp-redis, type: keyvalue, property: connectionString }

  - type: worker
    name: onramp-beat
    runtime: docker
    rootDir: backend
    dockerCommand: celery -A app.tasks.celery_app beat -l info
    envVars:
      - fromGroup: onramp-shared
      - key: REDIS_URL
        fromService: { name: onramp-redis, type: keyvalue, property: connectionString }
```

### Legacy manual steps (without blueprint)

1. **New → Redis** → copy Internal URL (`rediss://...`) and set as `REDIS_URL` on every service.
2. **New → Web Service** → rootDir `backend`, runtime Docker, health check `/health`.
3. **New → Background Worker (×2)** → same image, `dockerCommand` as above.
4. Put all secrets in one **Environment Group** (`onramp-shared`).

---

## Environment Variables

### Required
```
ENV=production
DATABASE_URL=postgresql://...  # Neon or other managed Postgres
REDIS_URL=redis://...          # Render Redis or external
JWT_SECRET=<strong-random>     # Generate: openssl rand -base64 32
```

### LLM Providers (Pick at least 1)
```
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk_...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=sk_...
NVIDIA_API_KEY=nvapi_...
```

### Optional
```
CORS_ALLOWED_ORIGINS=https://yourdomain.com
CORS_ALLOWED_ORIGIN_REGEX=^https://[a-z0-9-]+\.yourdomain\.com$
BACKEND_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
RAZORPAY_KEY_ID=rzp_...  RAZORPAY_KEY_SECRET=...  RAZORPAY_WEBHOOK_SECRET=...
GITHUB_TOKEN=ghp_...  GITHUB_CLIENT_ID=...  GOOGLE_CLIENT_ID=...
SENDGRID_API_KEY=SG....
SENTRY_DSN=https://...
GEMINI_API_KEY=...  OPENROUTER_API_KEY=...  GROQ_API_KEY=...
```

---

## Monitoring & Debugging

### Check Web Service Logs
```bash
# In Render dashboard, Web Service → Logs
# Should show: Started server process, listening on 0.0.0.0:8000
```

### Check Worker Logs
```bash
# In Render dashboard, Background Worker → Logs
# Should show: Connected to redis://...
#             Celery v5.x ready to accept tasks
```

### Worker Connection Errors
```
[ERROR] consumer: Cannot connect to redis://...
```

**Fix:**
1. Verify REDIS_URL is set correctly
2. Check Redis service is running (Render dashboard)
3. Verify Redis connection string (should be in format: redis://red-xxx:6379)
4. Ensure Web and Worker services have SAME REDIS_URL

### Worker Not Accepting Tasks
```
celery@worker Worker: Online
[2026-XX-XX XX:XX:XX,XXX: WARNING] ...
```

**Fix:**
1. Check if tasks exist: `celery -A app.tasks.celery_app inspect registered`
2. Verify task queues: `celery -A app.tasks.celery_app inspect active_queues`
3. Check recent errors: Look for "FAILED" in logs

---

## Deployment Checklist

Before pushing to Render:

- [ ] `.env` file NOT committed (should be in .gitignore)
- [ ] `.env.example` updated with all required vars
- [ ] `render.yaml` or dashboard config created
- [ ] Database migrations tested locally (`alembic upgrade head`)
- [ ] Celery tasks tested locally (`celery -A app.tasks.celery_app worker`)
- [ ] Redis URL copied from Render Redis service
- [ ] All env vars set in Render dashboard or `render.yaml`

After deployment:

- [ ] Web service shows "Running" and logs show "listening on 0.0.0.0:8000"
- [ ] Worker service shows "Running" and logs show "Connected to redis://..."
- [ ] Database migrations ran (check log: "Alembic upgrade head")
- [ ] No 500 errors in web service logs
- [ ] No "Cannot connect to redis" errors in worker logs
- [ ] Health check passes: `GET /health` returns 200

---

## Performance Tuning

### Web Service
- Scale instances as needed (free tier = 1 instance)
- Monitor response times in Render dashboard
- Consider increasing resources if p95 > 2s

### Worker Service
- Start with 1 worker, scale to 2-4 as queue depth increases
- Monitor task completion rate
- Alert if queue depth > 100 (tasks backing up)

### Redis
- Free tier has memory limits; monitor memory usage
- If exceeding limits, upgrade plan or implement TTL cleanup

---

## Troubleshooting

### Symptom: Web service stuck on building
**Fix:**
1. Check build log for Python version or dependency issues
2. Ensure `requirements.txt` exists
3. Try manual rebuild: Render dashboard → Deploy → Manual deploy

### Symptom: Deployments failing randomly
**Fix:**
1. Check if quota reached (Render free tier has builds/month limit)
2. Upgrade to paid plan
3. Clear build cache: Render dashboard → Settings → Clear build cache

### Symptom: Tasks not running
**Fix:**
1. Verify worker is running (should show "Running" in Render dashboard)
2. Check REDIS_URL matches between web and worker
3. Check logs for "Cannot connect to redis"
4. Verify Redis service is running

### Symptom: Database connection pooling issues
**Fix:**
1. Reduce DB_POOL_SIZE in production (Neon has limits)
2. Set DB_POOL_SIZE=2, DB_MAX_OVERFLOW=3 for Neon free tier
3. Increase connection timeout: DB_POOL_TIMEOUT=60

---

## Production Best Practices

1. **Environment Separation**
   - Dev: localhost Redis, free tier resources
   - Staging: Managed Redis, shared resources
   - Prod: Premium Redis, dedicated resources

2. **Monitoring**
   - Set up Sentry for error tracking
   - Use Render metrics dashboard
   - Alert on: error rate > 1%, response time p95 > 2s, worker offline

3. **Backups**
   - Enable Postgres automated backups (Neon)
   - Test restore procedure monthly
   - Keep backup retention > 7 days

4. **Security**
   - Never commit `.env` file
   - Rotate JWT_SECRET quarterly
   - Use strong CORS_ALLOWED_ORIGINS (not *)
   - Enable API key rotation for external services

5. **Scaling**
   - Monitor CPU/memory in Render dashboard
   - Scale horizontally (more instances) not just vertically
   - Use separate worker instances for different task types

---

**Last Updated:** 2026-08-21
**Related:** `render.yaml`, `Readme.md:Deploying to Render`, `GAPS.md`, `docs/DEPLOYMENT.md`
