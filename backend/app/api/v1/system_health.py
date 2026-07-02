"""Deep health check for watchdogs and orchestrators.

`GET /health/deep` verifies each dependency the app actually needs at runtime:
database connectivity, Redis (when configured), and LLM provider availability
(circuit-breaker state; a live 1-token ping is opt-in via ?ping_llm=true so
watchdog probes don't spend tokens by default).

Returns 200 when every required dependency is healthy, 503 otherwise, so a
container orchestrator's restart policy can act on it directly.
"""

import os
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

router = APIRouter(tags=["health"])


async def _check_database() -> dict:
    from app.services.postgres_db import _use_memory_backend

    if _use_memory_backend():
        return {"status": "ok", "backend": "memory"}
    started = time.monotonic()
    try:
        from app.database.config import db_config

        engine = await db_config.ensure_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "backend": "postgres",
            "latency_ms": round((time.monotonic() - started) * 1000),
        }
    except Exception as exc:
        return {"status": "error", "backend": "postgres", "error": str(exc)[:200]}


async def _check_redis() -> dict:
    if not os.getenv("REDIS_URL"):
        return {"status": "skipped", "reason": "REDIS_URL not configured"}
    started = time.monotonic()
    try:
        from app.services.cache_service import get_client

        client = await get_client()
        if client is None:
            return {"status": "error", "error": "Redis client unavailable"}
        await client.ping()
        return {"status": "ok", "latency_ms": round((time.monotonic() - started) * 1000)}
    except Exception as exc:
        return {"status": "error", "error": str(exc)[:200]}


async def _check_llm(llm, ping: bool) -> dict:
    if llm is None:
        return {"status": "error", "error": "LLM router not initialized"}
    providers = llm.provider_status()
    usable = [
        name
        for name, info in providers.items()
        if info["configured"] and info["circuit"]["state"] != "open"
    ]
    result = {
        "status": "ok" if usable else "error",
        "usable_providers": usable,
        "providers": providers,
    }
    if ping and usable:
        started = time.monotonic()
        try:
            await llm.chat("ping", max_tokens=1)
            result["ping"] = {
                "status": "ok",
                "latency_ms": round((time.monotonic() - started) * 1000),
            }
        except Exception as exc:
            result["status"] = "error"
            result["ping"] = {"status": "error", "error": str(exc)[:200]}
    return result


@router.get("/health/deep")
async def deep_health(request: Request, ping_llm: bool = False):
    llm = getattr(request.app.state, "llm", None)
    checks = {
        "database": await _check_database(),
        "redis": await _check_redis(),
        "llm": await _check_llm(llm, ping_llm),
    }
    healthy = all(c["status"] in ("ok", "skipped") for c in checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "healthy" if healthy else "unhealthy", "checks": checks},
    )
