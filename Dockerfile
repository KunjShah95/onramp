# syntax=docker/dockerfile:1.4
# =============================================================================
# CodeFlow - Production Dockerfile
# =============================================================================
# Multi-stage build for optimized production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies
# -----------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install \
    -r requirements.txt \
    && rm -rf /root/.cache

# -----------------------------------------------------------------------------
# Stage 2: Production - Runtime image
# -----------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS production

# Labels
ARG VERSION="2.0.0"
ARG BUILD_DATE
ARG GIT_COMMIT
LABEL maintainer="codeflow@example.com" \
      version="${VERSION}" \
      build-date="${BUILD_DATE}" \
      git-commit="${GIT_COMMIT}" \
      description="CodeFlow AI Onboarding Platform - Backend API"

# Security: Create non-root user
RUN groupadd --gid=1000 appgroup && \
    useradd --uid=1000 --gid=appgroup --shell /bin/bash --create-home appuser

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    SERVICE_NAME=codeflow-backend \
    SERVICE_VERSION=${VERSION}

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application
COPY --chown=appuser:appgroup . /codeflow

WORKDIR /codeflow

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/observability/health/live || exit 1

# Entrypoint
ENTRYPOINT ["python", "-m", "uvicorn"]
CMD ["app.main:app", "--host", "0.0.0.0", "--port", "8000"]


# =============================================================================
# Development Dockerfile (development use only)
# =============================================================================
FROM python:3.11-slim-bookworm AS development

WORKDIR /codeflow

# Install development dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install dev tools
RUN pip install --no-cache-dir \
    ruff \
    mypy \
    pytest \
    pytest-asyncio \
    pytest-cov \
    httpx

# Copy source code
COPY . .

# Expose port
EXPOSE 8000

# Development entrypoint
CMD ["python", "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]


# =============================================================================
# Celery Worker Dockerfile
# =============================================================================
FROM python:3.11-slim-bookworm AS celery-worker

ARG VERSION="2.0.0"
LABEL maintainer="codeflow@example.com" \
      version="${VERSION}" \
      description="CodeFlow AI Onboarding Platform - Celery Worker"

RUN groupadd --gid=1000 appgroup && \
    useradd --uid=1000 --gid=appgroup --shell /bin/bash --create-home appuser

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

COPY --chown=appuser:appgroup . /codeflow

WORKDIR /codeflow

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD celery -A app.tasks.celery_app inspect ping || exit 1

ENTRYPOINT ["celery", "-A", "app.tasks.celery_app"]
CMD ["worker", "-Q", "agent-tasks,analytics-tasks,notification-tasks,default", "-l", "info"]


# =============================================================================
# Frontend Dockerfile
# =============================================================================
# Build stage
FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine AS frontend-production

COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
