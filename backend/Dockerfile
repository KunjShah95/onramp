# ── Multi-stage Dockerfile (production-hardened) ──────────────────────────
# development:  full image with requirements installed (used by docker-compose)
# production:   API server (uvicorn) — DEFAULT build target (last stage)
# celery-worker: Celery worker (named stage — selected via --target)
#
# Hardening applied:
#   - Python 3.12-slim base (matches the runtime the app is tested on)
#   - Non-root user (`onramp`, uid 10001) for production
#   - HEALTHCHECK against /health (liveness) + /ready (readiness)
#   - PYTHONUNBUFFERED + PYTHONDONTWRITEBYTECODE for clean, portable logs
#   - curl installed for the healthcheck probe
#
# Stage order matters: the LAST stage is the default `docker build` target.
# `production` is kept last so a plain build yields the API — Render
# Blueprints cannot select a Dockerfile target, so workers use the
# production image and override the command (see render.yaml).

FROM python:3.12-slim as base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install runtime deps (curl for healthchecks) + requirements.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt

# ── development stage (docker-compose mounts the source for hot reload) ──
FROM base as development

COPY ./app ./app
COPY ./alembic ./alembic
COPY ./alembic.ini ./alembic.ini

EXPOSE 8000

CMD sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"

# ── runtime stage — shared non-root runtime for production + workers ──────
FROM base as runtime

COPY ./app ./app
COPY ./alembic ./alembic
COPY ./alembic.ini ./alembic.ini

# Create an unprivileged user and drop privileges.
RUN groupadd --gid 10001 onramp \
    && useradd --uid 10001 --gid onramp --shell /usr/sbin/nologin --create-home onramp \
    && chown -R onramp:onramp /app

USER onramp

EXPOSE 8000

# ── celery-worker stage (select with: docker build --target celery-worker) ─
FROM runtime as celery-worker

HEALTHCHECK NONE

CMD ["celery", "-A", "app.tasks.celery_app", "worker", "-l", "info", "-Q", "agent-tasks,analytics-tasks,notification-tasks,default"]

# ── production stage — API server; LAST stage = default build target ──────
FROM runtime as production

# Liveness probe: process up (nginx/LB hit /health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Readiness is enforced externally by the orchestrator hitting /ready
# (e.g. k8s readinessProbe / docker-compose healthcheck on the service).
CMD sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${UVICORN_WORKERS:-4} --proxy-headers"
