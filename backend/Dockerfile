# ── Multi-stage Dockerfile ──────────────────────────────────────────────────
# development:  full image with requirements installed (used by docker-compose)
# production:    same base, used for standalone deployment

FROM python:3.11-slim as development

WORKDIR /app

# Install dependencies
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt

# Copy application code and migrations
COPY ./app ./app
COPY ./alembic ./alembic
COPY ./alembic.ini ./alembic.ini

# Expose port 8000
EXPOSE 8000

# Default command works standalone or with docker-compose override
CMD sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"


FROM development as production

# Production inherits the same CMD from the development stage
