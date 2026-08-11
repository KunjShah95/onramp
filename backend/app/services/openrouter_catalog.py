"""Dynamic OpenRouter model catalog — the discoverability layer for the
gateway's OpenRouter passthrough.

The router's pinned defaults (``LLMRouter.list_models``) cover a handful of
hand-picked models; OpenRouter itself serves hundreds across every vendor.
The gateway already passes any ``vendor/model`` id straight through to
OpenRouter, but that only works if the caller already knows the id exists.
This service fetches OpenRouter's model list, caches it briefly, and
normalizes it (id, name, context length, per-1M-token pricing, free flag)
so model listings (``GET /v1/models``, ``GET /ai/models``) can be merged
with the static catalog and a picker UI can render the full catalog with
prices instead of routing blind.

The fetch is strictly best-effort: any failure returns [] (or the stale
cache when one exists) and the caller falls back to the static catalog, so
a transient OpenRouter outage can never take down model listing. The
``/models`` endpoint is public — no API key is required — but an OpenRouter
key is accepted when available so requests from behind a BYOK team still
see the same catalog.
"""

import logging
import math
import os
import time
from typing import Dict, List, Optional

logger = logging.getLogger("onramp.openrouter_catalog")

BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

# The catalog changes slowly (new model releases); an hour-long TTL keeps a
# picker fresh without hammering OpenRouter on every /models call.
_DEFAULT_TTL_SECONDS = 3600.0

# api_key -> (expires_at, models) — cached per key so different callers
# (platform vs. team BYOK) each get the same catalog without refetching.
_CACHE: Dict[str, tuple] = {}


def _ttl() -> float:
    try:
        return float(os.getenv("OPENROUTER_CATALOG_TTL", _DEFAULT_TTL_SECONDS))
    except ValueError:
        return _DEFAULT_TTL_SECONDS


def _as_float(value) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(parsed):
        return 0.0
    return round(parsed, 6)


def _as_int(value) -> int:
    """Defensive context-length parse — a malformed foreign payload must not
    take down the whole merged catalog (one bad entry is skipped, not all)."""
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0


def normalize_model(entry: dict) -> Optional[dict]:
    """One OpenRouter model entry → compact, picker-friendly record.

    ``free`` mirrors the router's own convention: an explicit ``:free``
    suffix (OpenRouter's free tier marker) or a $0 rate card.
    """
    if not entry or not entry.get("id"):
        return None
    model_id = str(entry["id"])
    pricing = entry.get("pricing") or {}
    prompt = _as_float(pricing.get("prompt"))
    completion = _as_float(pricing.get("completion"))
    free = model_id.endswith(":free") or (prompt == 0.0 and completion == 0.0)
    return {
        "id": model_id,
        "name": entry.get("name") or model_id,
        "context_length": _as_int(entry.get("context_length")),
        "pricing": {"prompt": prompt, "completion": completion},
        "free": free,
        "vendor": model_id.split("/", 1)[0] if "/" in model_id else "",
    }


async def fetch_catalog(api_key: Optional[str] = None) -> List[dict]:
    """Fetch + normalize OpenRouter's model catalog (best-effort → []).

    Results are cached per api_key for ``OPENROUTER_CATALOG_TTL`` seconds
    (default 1h). A transient network failure serves the stale cache when
    one exists, otherwise returns [] — never raises.
    """
    cache_key = api_key or ""
    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    if cached is not None and cached[0] > now:
        return list(cached[1])

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        import httpx

        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(f"{BASE_URL}/models", headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.exception("OpenRouter catalog fetch failed")
        if cached is not None:
            return list(cached[1])  # serve stale on transient failure
        return []

    models = [m for m in (normalize_model(e) for e in data.get("data", [])) if m]
    _CACHE[cache_key] = (now + _ttl(), models)
    logger.info("Fetched %d models from OpenRouter catalog", len(models))
    return models


def invalidate_cache() -> None:
    """Drop the catalog cache (tests / after an admin key rotation)."""
    _CACHE.clear()
