"""OpenAI-compatible /v1 gateway.

Exposes the query-type LLM router behind the OpenAI Chat Completions API
shape, so any OpenAI-SDK client (openai python, langchain, openai-js, ...)
can point ``base_url`` at this service and use it like OpenRouter:

    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key="cf_...",                    # Onramp API key (X-API-Key or Bearer)
        base_url="https://yourhost.com/v1",  # OpenAI-compatible gateway
    )
    resp = await client.chat.completions.create(
        model="code",                        # or a provider/model/query-type name
        messages=[{"role": "user", "content": "..."}],
        stream=True,
    )

Supported ``model`` values are resolved by :meth:`LLMRouter.provider_chain`:
query-type names ("code", "reasoning", ...), provider names ("groq",
"anthropic", ...), known model ids ("gpt-4o-mini", ...), or omitted for
automatic classification.
"""

import json
import logging
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.v1.auth import get_user_or_api_key
from app.api.v1 import llm_route
from app.services.moderation import check_moderation, is_enabled as moderation_enabled
from app.services.quota import charge_wallet, check_quota
from app.services.usage_tracker import UsageTracker
from app.services.llm_costs import (
    calculate_cost,
    calculate_cost_avoided,
    calculate_embedding_cost,
    estimate_tokens,
)

logger = logging.getLogger("onramp.openai_gateway")

router = APIRouter(prefix="/v1", tags=["openai-compatible"])
usage = UsageTracker()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage] = Field(default_factory=list)
    max_tokens: Optional[int] = Field(default=2000, ge=1, le=32768)
    temperature: Optional[float] = None
    stream: Optional[bool] = False
    user: Optional[str] = None
    # OpenRouter-style cost/quality dial for this call: an int 0-10 (0 =
    # cheapest) or a preset name ("cost"/"balanced"/"intelligence"). Wins
    # over the caller's team default when set; falls back to the team's
    # stored preference, then RoutingMode.BALANCED. See app/llm.py RoutingMode.
    routing_mode: Optional[Union[int, str]] = None


class EmbeddingsRequest(BaseModel):
    model: Optional[str] = None
    input: Union[str, List[str]]
    user: Optional[str] = None


def _get_llm(req: Request):
    """Return the app's LLM router or 503 if unavailable."""
    llm = getattr(req.app.state, "llm", None)
    if llm is None or not hasattr(llm, "openai_chat"):
        raise HTTPException(status_code=503, detail="LLM router not initialized")
    return llm


def _get_embeddings(req: Request):
    """Return the app's embedding router or 503 if unavailable."""
    embeddings = getattr(req.app.state, "embeddings", None)
    if embeddings is None or not getattr(embeddings, "is_available", False):
        raise HTTPException(status_code=503, detail="Embedding router not initialized")
    return embeddings


def _extract_prompt(messages: List[ChatMessage]) -> Tuple[Optional[str], str]:
    """Split OpenAI messages into (system_prompt, user_prompt)."""
    system_parts: List[str] = []
    user_parts: List[str] = []
    for msg in messages:
        if msg.role == "system":
            system_parts.append(msg.content)
        elif msg.role in ("user", "assistant", "developer", "tool"):
            user_parts.append(msg.content)
    system = "\n".join(system_parts) if system_parts else None
    return system, "\n".join(user_parts)


async def _track_usage(
    auth: dict,
    route: Optional[Dict] = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    endpoint: str = "chat",
    cost_usd_override: Optional[float] = None,
    cost_avoided_override: Optional[float] = None,
) -> None:
    """Record gateway usage against the caller's quota (best-effort).

    ``route`` (provider/model/free attribution) is stored alongside the
    usage record so free-first routing savings can be measured. The record
    also persists the dollar cost of the request (``cost_usd``) and the
    savings vs the paid baseline model (``cost_avoided_usd``), both computed
    from per-model token pricing. Callers with an exact cost (e.g. embeddings
    priced per input token) can pass ``cost_usd_override``.
    """
    try:
        uid = auth.get("uid", "unknown")
        org = auth.get("org_name") or uid
        model = (route or {}).get("model") or ""
        # Prefer the per-request price snapshot persisted in the route record
        # (self-consistent even if the pricing table changes later); fall back
        # to the live table for routes without price fields (e.g. tests).
        snapshot = None
        if route and "price_in" in route and "price_out" in route:
            snapshot = {"input": route["price_in"], "output": route["price_out"]}
        cost = (
            cost_usd_override
            if cost_usd_override is not None
            else calculate_cost(model, input_tokens, output_tokens, price=snapshot)
        )
        avoided = (
            cost_avoided_override
            if cost_avoided_override is not None
            else calculate_cost_avoided(model, input_tokens, output_tokens, price=snapshot)
        )
        await usage.record_usage(
            org_name=org,
            endpoint=endpoint,
            credits=1,
            cost_usd=cost,
            cost_avoided_usd=avoided,
            metadata=route,
        )
        # Usage-based callers draw down their prepaid credit wallet on success
        # (the up-front check only verified the balance, it did not charge).
        await _charge_usage_based(auth, endpoint)
    except Exception:
        pass  # usage tracking is non-critical


async def _charge_usage_based(auth: dict, action: str) -> None:
    """Best-effort wallet charge for usage_based callers (no-op otherwise)."""
    scope = auth.get("org_name") or auth.get("uid")
    if not scope:
        return
    await charge_wallet(scope, action)


async def _enforce_quota(auth: dict, action: str) -> None:
    """Block the request up front when the caller is out of quota/credits.

    Enforces without recording — the endpoint records the charge on success,
    so failed requests never consume quota. Best-effort: a quota infra error
    fails open so the gateway stays available.
    """
    scope = auth.get("org_name") or auth.get("uid")
    if not scope:
        return
    try:
        await check_quota(scope, action)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Quota check failed for %s; allowing request", scope)


async def _team_provider_keys(auth: dict) -> Optional[Dict[str, str]]:
    """Decrypted BYOK map for the caller's org (or None for no-org callers).

    Only API-key callers carry an ``org_name`` scope (JWT sessions don't), so
    platform env keys are used for everything else. Shared implementation:
    :func:`app.api.v1.llm_route.team_provider_keys`.
    """
    return await llm_route.team_provider_keys(auth.get("org_name"))


async def _team_key_pools(auth: dict) -> Optional[Dict[str, List[str]]]:
    """Decrypted multi-key pools ``{provider: [key, ...]}`` for the caller's
    org (or None when no pool keys exist). Shared implementation:
    :func:`app.api.v1.llm_route.team_key_pools`.
    """
    return await llm_route.team_key_pools(auth.get("org_name"))


async def _team_key_pool_ids(auth: dict) -> Optional[Dict[str, List[str]]]:
    """Stable ``{provider: [key_id, ...]}`` map for the caller's org — aligned
    index-for-index with :func:`_team_key_pools`, so the router can record
    which exact key served a call in the route metadata. Shared
    implementation: :func:`app.api.v1.llm_route.team_key_pool_ids`.
    """
    return await llm_route.team_key_pool_ids(auth.get("org_name"))


async def _resolve_routing_mode(auth: dict, requested: Optional[Union[int, str]]) -> Union[int, str]:
    """Effective routing_mode for this call: an explicit per-request value
    wins; otherwise the caller's org-level default (Developer Portal
    setting), then RoutingMode.BALANCED. Shared implementation:
    :func:`app.api.v1.llm_route.resolve_team_routing_mode`.
    """
    return await llm_route.resolve_team_routing_mode(auth.get("org_name"), requested)


def _route_header_for(
    llm,
    body: ChatCompletionRequest,
    prompt: str,
    provider_keys: Optional[Dict[str, str]] = None,
    routing_mode: Optional[Union[int, str]] = None,
) -> str:
    """Best-effort route header for the primary provider of this request.

    The header is a debug aid; the authoritative served model is reported in
    each streaming chunk's ``model`` field. Never raises.
    """
    try:
        chain = llm.provider_chain(
            model=body.model, prompt=prompt, provider_keys=provider_keys, routing_mode=routing_mode
        )
        if chain:
            passthrough = getattr(llm, "_is_openrouter_passthrough_model", None)
            model_override = body.model if passthrough and passthrough(body.model, provider_keys) else None
            return llm.route_info(chain[0], model_override=model_override)["served"]
    except Exception:
        pass
    return body.model or "onramp"


# ── GET /v1/models ──────────────────────────────────────────────────────────

@router.get("/models")
async def list_models(req: Request, auth: dict = Depends(get_user_or_api_key)):
    """OpenAI-compatible model listing (OpenRouter-style).

    Merges the router's pinned defaults + query types with the *live*
    OpenRouter catalog (cached fetch, best-effort — a transient OpenRouter
    outage falls back to the static catalog). Catalog entries carry their
    per-1M-token pricing and context length so a picker UI can show cost.
    """
    llm = _get_llm(req)
    catalog = llm.list_models()

    data = []
    pinned_ids = set()
    for provider, info in catalog["providers"].items():
        pinned_ids.add(info["model"])
        data.append({
            "id": info["model"],
            "object": "model",
            "owned_by": provider,
            "available": info["available"],
            "free": bool(info.get("free", False)),
        })
    for qtype in catalog["query_types"]:
        data.append({
            "id": qtype,
            "object": "model",
            "owned_by": "onramp-query-router",
            "available": True,
        })
    # Dynamic OpenRouter catalog (public endpoint; authenticated when a key is
    # configured). Deduped against the pinned defaults above.
    try:
        from app.services.openrouter_catalog import fetch_catalog

        openrouter_key = (
            (getattr(llm, "platform_keys", None) or {}).get("openrouter")
            or os.getenv("OPENROUTER_API_KEY")
        )
        for m in await fetch_catalog(openrouter_key):
            if m["id"] in pinned_ids:
                continue
            data.append({
                "id": m["id"],
                "object": "model",
                "owned_by": "openrouter",
                "available": True,
                "free": m["free"],
                "context_length": m["context_length"],
                "pricing": m["pricing"],
                "vendor": m["vendor"],
            })
    except Exception:
        logger.exception("Failed to merge OpenRouter catalog")
    embeddings = getattr(req.app.state, "embeddings", None)
    if embeddings is not None and hasattr(embeddings, "list_models"):
        ecat = embeddings.list_models()
        for provider, info in ecat["providers"].items():
            data.append({
                "id": info["model"],
                "object": "embedding",
                "owned_by": provider,
                "available": info["available"],
                "dimensions": info["dimensions"],
            })
    return {"object": "list", "data": data}


# ── POST /v1/chat/completions ───────────────────────────────────────────────

@router.post("/chat/completions")
async def chat_completions(
    body: ChatCompletionRequest,
    req: Request,
    response: Response,
    auth: dict = Depends(get_user_or_api_key),
):
    """OpenAI-compatible chat completions (non-streaming + SSE streaming)."""
    llm = _get_llm(req)
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    # Enforce quota up front (without recording); the charge is recorded only
    # after the LLM call succeeds so failures never consume quota.
    await _enforce_quota(auth, "chat")

    system, prompt = _extract_prompt(body.messages)
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="messages must include a user message")
    max_tokens = body.max_tokens or 2000

    # Content moderation / guardrails (flag-gated via ENABLE_MODERATION — off
    # by default, so this adds zero latency until a deployment opts in).
    # Blocks obviously abusive input before it reaches any provider; fail-open
    # and non-blocking when disabled.
    moderation_header = "off"
    if moderation_enabled():
        openrouter_key = (
            (getattr(llm, "platform_keys", None) or {}).get("openrouter")
            or os.getenv("OPENROUTER_API_KEY")
        )
        verdict = await check_moderation(
            f"{system or ''}\n{prompt}", openrouter_key=openrouter_key
        )
        if verdict["blocked"]:
            logger.warning(
                "Moderation blocked gateway request: %s (%s)",
                verdict["category"], verdict["source"],
            )
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "Input blocked by content moderation",
                    "code": "MODERATION_BLOCKED",
                    "category": verdict["category"],
                    "source": verdict["source"],
                },
            )
        moderation_header = verdict["source"] or "pass"

    # Request-scoped BYOK overrides: when the caller's org has its own provider
    # keys (Developer Portal), those win over the platform env keys for this
    # request. Loaded once up front and threaded through routing + streaming.
    provider_keys = await _team_provider_keys(auth)
    # Multi-key pools (several BYOK keys per provider) — the router rotates
    # round-robin across them to spread traffic / dodge per-key rate limits.
    key_pools = await _team_key_pools(auth)
    # Stable key_ids for those pools (aligned index-for-index) so route
    # records name the exact key that served, not just its position.
    key_pool_ids = await _team_key_pool_ids(auth)
    # Cost/quality dial: explicit per-request value wins, else the caller's
    # org-level default (Developer Portal setting), else RoutingMode.BALANCED.
    routing_mode = await _resolve_routing_mode(auth, body.routing_mode)

    if body.stream:
        # Debug route header (best-effort — resolved from the primary provider).
        route_header = _route_header_for(llm, body, prompt, provider_keys, routing_mode)
        return StreamingResponse(
            # Usage (with real token counts + cost) is tracked inside the
            # generator once the stream completes; failed streams are not
            # billed, so nothing is recorded on the error path.
            _stream_events(
                llm, body, system, prompt, max_tokens, auth, provider_keys,
                routing_mode, key_pools, key_pool_ids,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-LLM-Route": route_header,
                "X-LLM-Moderation": moderation_header,
            },
        )

    try:
        # cache_scope isolates the response cache per tenant (org) so one
        # customer's cached answers are never served to another.
        cache_scope = auth.get("org_name") or auth.get("uid") or "global"
        chat_kwargs: Dict[str, Any] = {
            "system": system,
            "max_tokens": max_tokens,
            "model": body.model,
            "cache_scope": cache_scope,
            "provider_keys": provider_keys,
            "routing_mode": routing_mode,
        }
        if key_pools:
            chat_kwargs["key_pools"] = key_pools
        if key_pool_ids:
            chat_kwargs["key_pool_ids"] = key_pool_ids
        content, served, route = await llm.openai_chat(prompt, **chat_kwargs)
    except RuntimeError as exc:
        logger.warning("Chat completion failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    await _track_usage(
        auth, route, input_tokens=estimate_tokens(prompt), output_tokens=estimate_tokens(content)
    )
    # Debug headers: which provider/model served this request, and whether it
    # was served from the Redis response cache (free, zero tokens/cost).
    response.headers["X-LLM-Route"] = served
    response.headers["X-LLM-Moderation"] = moderation_header
    response.headers["X-LLM-Cache"] = "HIT" if getattr(llm, "last_cache_hit", False) else "MISS"
    # Which cache tier served: "redis" (exact match), "semantic" (near-
    # duplicate), or "MISS". The semantic tier reuses the same free/$0
    # attribution but comes from the embedding-similarity lookup.
    _last_route = getattr(llm, "last_route", None) or {}
    response.headers["X-LLM-Cache-Tier"] = (
        _last_route.get("model", "exact")
        if getattr(llm, "last_cache_hit", False)
        else "MISS"
    )
    return _completion_response(served, content, body.model, prompt)


def _completion_response(
    served: str, content: str, requested: Optional[str], prompt: str = ""
) -> Dict:
    """OpenAI ``chat.completion`` object shape."""
    completion_tokens = estimate_tokens(content)
    prompt_tokens = estimate_tokens(prompt)
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": served,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        "requested_model": requested,
    }


def _sse(payload: Dict) -> str:
    return "data: " + json.dumps(payload) + "\n\n"


async def _stream_events(
    llm, body: ChatCompletionRequest, system, prompt, max_tokens, auth,
    provider_keys: Optional[Dict[str, str]] = None,
    routing_mode: Optional[Union[int, str]] = None,
    key_pools: Optional[Dict[str, List[str]]] = None,
    key_pool_ids: Optional[Dict[str, List[str]]] = None,
):
    """Server-sent-events generator for streaming completions.

    Tracks usage once the stream ends (with real token counts and the actual
    served route), so streaming requests are costed as accurately as
    non-streaming ones.
    """
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = int(time.time())
    served = body.model or "onramp"
    route = None
    output_chars = 0
    partial_parts: List[str] = []
    try:
        stream_kwargs: Dict[str, Any] = {
            "system": system,
            "max_tokens": max_tokens,
            "model": body.model,
            "provider_keys": provider_keys,
            "routing_mode": routing_mode,
        }
        if key_pools:
            stream_kwargs["key_pools"] = key_pools
        if key_pool_ids:
            stream_kwargs["key_pool_ids"] = key_pool_ids
        async for token, model_id, _route in llm.openai_chat_stream(
            prompt, **stream_kwargs
        ):
            served = model_id
            route = _route
            output_chars += len(token)
            partial_parts.append(token)
            yield _sse({
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": served,
                "choices": [{
                    "index": 0,
                    "delta": {"content": token},
                    "finish_reason": None,
                }],
            })
        yield _sse({
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": served,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        })
    except RuntimeError as exc:
        # Intentional: failed streams are not billed, so no usage is recorded.
        logger.warning("Streaming completion failed: %s", exc)
        # Close the stream with the partial content attached so clients can
        # retry with it as context (the mid-stream failover limitation — the
        # router commits once the first token is emitted). Distinguish a
        # mid-answer drop (partial content exists) from a pre-token outage
        # (no provider was reachable at all).
        partial_text = "".join(partial_parts)
        yield _sse({
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": served,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "error"}],
            "error": {
                "message": str(exc),
                "type": "upstream_error",
                "code": "stream_interrupted" if partial_text else "router_exhausted",
                "partial_content": partial_text,
            },
        })
        return
    await _track_usage(
        auth, route,
        input_tokens=estimate_tokens(prompt),
        output_tokens=max(1, output_chars // 4),
    )
    yield "data: [DONE]\n\n"


# ── POST /v1/embeddings ────────────────────────────────────────────────────

@router.post("/embeddings")
async def create_embeddings(
    body: EmbeddingsRequest,
    req: Request,
    response: Response,
    auth: dict = Depends(get_user_or_api_key),
):
    """OpenAI-compatible embeddings.

    ``model`` resolves through the embedding router (provider name, embedding
    model id, or default). Returns the OpenAI ``embedding`` object shape with
    usage and USD/INR cost.
    """
    embeddings = _get_embeddings(req)
    texts = [body.input] if isinstance(body.input, str) else list(body.input)
    texts = [t for t in texts if t and t.strip()]
    if not texts:
        raise HTTPException(status_code=400, detail="input must not be empty")

    # Enforce quota up front (without recording); the charge is recorded only
    # after the embed call succeeds so failures never consume quota.
    await _enforce_quota(auth, "embed")

    # Request-scoped BYOK overrides (see chat_completions).
    provider_keys = await _team_provider_keys(auth)
    provider = embeddings.resolve_model(body.model, provider_keys)
    try:
        vectors, served_provider, route = await embeddings.embed_batch(
            texts, preferred=provider, provider_keys=provider_keys
        )
    except RuntimeError as exc:
        logger.warning("Embedding request failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    response.headers["X-Embedding-Route"] = route.get("served", served_provider)
    data = [
        {"object": "embedding", "index": i, "embedding": vec}
        for i, vec in enumerate(vectors)
    ]
    model_cfg = embeddings.providers[served_provider]
    tokens = estimate_tokens(" ".join(texts))
    usd, inr = calculate_embedding_cost(model_cfg["model"], tokens)

    # Record usage (with provider attribution + cost) so embed requests count
    # against the caller's monthly quota like chat requests do.
    await _track_usage(
        auth, route, input_tokens=tokens, output_tokens=0, endpoint="embed",
        cost_usd_override=usd,
    )
    return {
        "object": "list",
        "data": data,
        "model": route.get("served", model_cfg["model"]),
        "usage": {"prompt_tokens": tokens, "total_tokens": tokens},
        "cost_usd": usd,
        "cost_inr": inr,
    }
