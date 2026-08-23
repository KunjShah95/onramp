"""Shared helpers for the ``X-LLM-Route`` debug header.

Every LLM-backed endpoint can report which provider/model served a request
with the same header the OpenAI-compatible ``/v1`` gateway exposes::

    X-LLM-Route: groq/llama-3.3-70b-versatile

Two situations:

- *After* the LLM call (non-streaming): the router's ``last_route`` holds the
  authoritative served provider. Use :func:`attach_served_route_header`.
- *Before* the LLM call (SSE streaming, where response headers must be fixed
  up front): use :func:`primary_route_header` for a best-effort guess at the
  primary provider (agents know their ``query_type``, so the guess is
  usually exact).

The OpenAI-compatible gateway has its own model-string-first variant
(``openai_gateway._route_header_for``); these helpers cover the internal
query-type-first endpoints.
"""

import logging
from typing import Any, Dict, List, Optional, Union

from app.llm import QueryType, RoutingMode

logger = logging.getLogger("onramp.llm_route")

FALLBACK_ROUTE = "onramp"


# ── Team routing context (BYOK keys + routing dial) ────────────────────────
#
# Shared by every LLM-backed endpoint (the OpenAI-compatible gateway and the
# internal /ask chat) so team BYOK provider keys, multi-key pools, and the
# routing-mode preference resolve identically everywhere. Each loader is
# best-effort: a storage failure logs and returns None / the default rather
# than failing the request, and the underlying services use a short-TTL cache
# so these are cheap on the hot path.


async def team_provider_keys(org: Optional[str]) -> Optional[Dict[str, str]]:
    """Decrypted ``{provider: primary_key}`` BYOK map for an org. None when
    ``org`` is falsy (personal/unauthenticated context) or on storage failure
    — the router then falls back to platform/env keys."""
    if not org:
        return None
    try:
        from app.services.team_provider_keys import get_team_keys_map

        return await get_team_keys_map(org)
    except Exception:
        logger.exception("Failed to load provider keys for %s", org)
        return None


async def team_key_pools(org: Optional[str]) -> Optional[Dict[str, List[str]]]:
    """Decrypted multi-key pools ``{provider: [key, ...]}`` for an org (None
    when no pool keys exist / no org / storage failure)."""
    if not org:
        return None
    try:
        from app.services.team_provider_keys import get_team_key_pools

        pools = await get_team_key_pools(org)
        return pools or None
    except Exception:
        logger.exception("Failed to load key pools for %s", org)
        return None


async def team_key_pool_ids(org: Optional[str]) -> Optional[Dict[str, List[str]]]:
    """Stable ``{provider: [key_id, ...]}`` map aligned index-for-index with
    :func:`team_key_pools` so route records name the exact key that served."""
    if not org:
        return None
    try:
        from app.services.team_provider_keys import get_team_key_pool_ids

        ids = await get_team_key_pool_ids(org)
        return ids or None
    except Exception:
        logger.exception("Failed to load key pool ids for %s", org)
        return None


async def resolve_team_routing_mode(
    org: Optional[str], requested: Optional[Union[int, str]]
) -> Union[int, str]:
    """Effective routing_mode for a request: an explicit per-request value
    (``requested``) wins; otherwise the org's stored preference; otherwise
    :data:`RoutingMode.BALANCED`. Best-effort — never raises."""
    if requested is not None:
        return requested
    if not org:
        return RoutingMode.BALANCED
    try:
        from app.services.team_routing_settings import get_team_routing_mode

        return await get_team_routing_mode(org)
    except Exception:
        logger.exception("Failed to load routing mode for %s", org)
        return RoutingMode.BALANCED


def primary_route_header(
    llm: Any,
    query_type: Optional[QueryType] = None,
    prompt: str = "",
) -> str:
    """Best-effort header for the provider expected to serve a request.

    Prefers an explicit ``query_type`` (agents declare theirs), then prompt
    auto-classification, then the default CHAT chain. Never raises.
    """
    chain = []
    try:
        if query_type is not None and hasattr(llm, "resolve_route"):
            chain = llm.resolve_route(query_type)
        elif prompt and hasattr(llm, "provider_chain"):
            chain = llm.provider_chain(prompt=prompt)
        elif hasattr(llm, "resolve_route"):
            chain = llm.resolve_route(QueryType.CHAT)
        if chain and hasattr(llm, "route_info"):
            return llm.route_info(chain[0])["served"]
    except Exception:
        logger.debug("Failed to resolve primary route header", exc_info=True)
    return FALLBACK_ROUTE


def attach_served_route_header(
    llm: Any,
    before_route: Optional[dict],
    response,
) -> bool:
    """Set the header from the authoritative ``last_route`` if a call ran.

    ``before_route`` is a snapshot of ``llm.last_route`` taken before the LLM
    call. The router assigns a *fresh* dict on every completion, so an
    identity change means a call actually ran and updated the attribution; a
    stale or untouched route is deliberately not reported (the request may
    have been served by a non-LLM fallback). Returns True if the header was
    set.

    Note: under concurrency, another request could replace ``llm.last_route``
    between the snapshot and this check, so the reported route may belong to
    a different request. Fine for a debug header — do not build billing on
    this value.
    """
    try:
        after = getattr(llm, "last_route", None)
        if after is not None and after is not before_route and after.get("served"):
            response.headers["X-LLM-Route"] = after["served"]
            return True
    except Exception:
        logger.debug("Failed to attach served route header", exc_info=True)
    return False
