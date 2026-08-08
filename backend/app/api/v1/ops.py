"""
Production operations endpoints.

  GET /health    — liveness probe (process is up, returns 200)
  GET /ready     — readiness probe (DB + Redis reachable, returns 200/503)
  GET /metrics   — Prometheus text exposition (dependency-free registry)

Kubernetes / Docker healthchecks, load balancers and uptime monitors should
poll ``/ready`` (readiness gates traffic) and ``/health`` (liveness restarts
a hung process). ``/metrics`` is scraped by Prometheus / Grafana.
"""

import os
import time
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel

from app import metrics as metrics_module

logger = logging.getLogger("onramp.ops")
router = APIRouter(tags=["ops"])

_START_TIME = time.time()


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float


class CheckDetail(BaseModel):
    status: str  # "ok" | "error"
    detail: str = ""


class ReadinessResponse(BaseModel):
    status: str  # "ready" | "not_ready"
    checks: dict


@router.get("/health", tags=["ops"])
async def liveness():
    """Liveness probe — always 200 while the process is running."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        uptime_seconds=round(time.time() - _START_TIME, 2),
    )


async def _check_database() -> CheckDetail:
    """Return whether the configured storage backend is reachable."""
    try:
        if os.getenv("STORAGE_BACKEND", "").lower() == "memory":
            return CheckDetail(status="ok", detail="memory backend")
        from sqlalchemy import text
        from app.database.config import db_config

        engine = await db_config.ensure_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return CheckDetail(status="ok", detail="postgres")
    except Exception as exc:  # pragma: no cover - depends on live infra
        return CheckDetail(status="error", detail=str(exc)[:200])


async def _check_redis() -> CheckDetail:
    """Return whether Redis is reachable (skipped when unconfigured)."""
    if not os.getenv("REDIS_URL"):
        return CheckDetail(status="ok", detail="not configured")
    try:
        from app.services.cache_service import get_client

        client = await get_client()
        if client is None:
            return CheckDetail(status="error", detail="redis unavailable")
        await client.ping()
        return CheckDetail(status="ok", detail="redis")
    except Exception as exc:  # pragma: no cover - depends on live infra
        return CheckDetail(status="error", detail=str(exc)[:200])


@router.get("/ready", tags=["ops"])
async def readiness():
    """Readiness probe — 200 only when all required dependencies are up."""
    checks = {
        "database": await _check_database(),
        "redis": await _check_redis(),
    }
    all_ok = all(check.status == "ok" for check in checks.values())
    body = ReadinessResponse(
        status="ready" if all_ok else "not_ready",
        checks={name: c.model_dump() for name, c in checks.items()},
    )
    return Response(
        content=body.model_dump_json(),
        status_code=200 if all_ok else 503,
        media_type="application/json",
    )


@router.get("/metrics", tags=["ops"])
async def metrics():
    """Prometheus metrics in the text exposition format.

    Disabled by setting ENABLE_METRICS=false (returns 404 so scrapers
    fail loudly rather than scrape an empty registry).
    """
    if not metrics_module.metrics_enabled():
        raise HTTPException(status_code=404, detail="metrics disabled")
    return PlainTextResponse(
        metrics_module.generate_metrics(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
