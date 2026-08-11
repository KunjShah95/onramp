"""Per-team routing-mode preference (Cost / Balanced / Intelligence).

Mirrors :mod:`app.services.team_provider_keys` — same generic document
store, same short-TTL cache-then-invalidate-on-write shape — but for a
single scalar instead of a per-provider secret. Lets a team bias how
readily :class:`app.llm.LLMRouter` reaches for a paid provider (see
``RoutingMode`` / ``resolve_route`` in ``app/llm.py``) without touching env
vars or redeploying.
"""

import logging
import time
from typing import Dict, Optional, Tuple

from app.llm import RoutingMode
from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.team_routing_settings")

COLLECTION = "team_routing_settings"

_CACHE_TTL_SECONDS = 30.0
_MODE_CACHE: Dict[str, Tuple[float, int]] = {}


def _invalidate_team_cache(team_id: str) -> None:
    _MODE_CACHE.pop(team_id, None)


async def get_team_routing_mode(team_id: Optional[str]) -> int:
    """Team's routing-mode int (0-10). Defaults to RoutingMode.BALANCED
    when the team has no preference set, or when ``team_id`` is falsy
    (personal/unauthenticated context)."""
    if not team_id:
        return RoutingMode.BALANCED

    now = time.monotonic()
    cached = _MODE_CACHE.get(team_id)
    if cached is not None and cached[0] > now:
        return cached[1]

    records = await get_storage().query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )
    mode = RoutingMode.coerce(records[0].get("routing_mode")) if records else RoutingMode.BALANCED
    _MODE_CACHE[team_id] = (now + _CACHE_TTL_SECONDS, mode)
    return mode


async def set_team_routing_mode(team_id: str, routing_mode, user_id: str) -> dict:
    """Upsert a team's routing-mode preference. ``routing_mode`` accepts an
    int 0-10 or a preset name ("cost"/"balanced"/"intelligence")."""
    mode = RoutingMode.coerce(routing_mode)

    storage = get_storage()
    existing = await storage.query_documents(COLLECTION, [("team_id", "==", team_id)])
    if existing:
        record_id = existing[0].get("id") or existing[0].get("_id")
        await storage.update_document(
            COLLECTION, record_id, {"routing_mode": mode, "updated_by": user_id}
        )
    else:
        await storage.create_document(
            COLLECTION,
            generate_id(),
            {"team_id": team_id, "routing_mode": mode, "created_by": user_id, "updated_by": user_id},
        )
    _invalidate_team_cache(team_id)
    return {"team_id": team_id, "routing_mode": mode}
