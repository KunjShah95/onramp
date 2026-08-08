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

from typing import Any, Optional

from app.llm import QueryType

FALLBACK_ROUTE = "onramp"


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
        pass
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
        pass
    return False
