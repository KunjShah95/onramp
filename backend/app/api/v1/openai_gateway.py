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
import time
import uuid
from typing import Dict, List, Optional, Tuple, Union

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.v1.auth import get_user_or_api_key
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
) -> None:
    """Record gateway usage against the caller's quota (best-effort).

    ``route`` (provider/model/free attribution) is stored alongside the
    usage record so free-first routing savings can be measured. The record
    also persists the dollar cost of the request (``cost_usd``) and the
    savings vs the paid baseline model (``cost_avoided_usd``), both computed
    from per-model token pricing.
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
        cost = calculate_cost(model, input_tokens, output_tokens, price=snapshot)
        avoided = calculate_cost_avoided(model, input_tokens, output_tokens, price=snapshot)
        await usage.record_usage(
            org_name=org,
            endpoint="chat",
            credits=1,
            cost_usd=cost,
            cost_avoided_usd=avoided,
            metadata=route,
        )
    except Exception:
        pass  # usage tracking is non-critical


def _route_header_for(llm, body: ChatCompletionRequest, prompt: str) -> str:
    """Best-effort route header for the primary provider of this request.

    The header is a debug aid; the authoritative served model is reported in
    each streaming chunk's ``model`` field. Never raises.
    """
    try:
        chain = llm.provider_chain(model=body.model, prompt=prompt)
        if chain:
            return llm.route_info(chain[0])["served"]
    except Exception:
        pass
    return body.model or "onramp"


# ── GET /v1/models ──────────────────────────────────────────────────────────

@router.get("/models")
async def list_models(req: Request, auth: dict = Depends(get_user_or_api_key)):
    """OpenAI-compatible model listing (OpenRouter-style)."""
    llm = _get_llm(req)
    catalog = llm.list_models()

    data = []
    for provider, info in catalog["providers"].items():
        data.append({
            "id": info["model"],
            "object": "model",
            "owned_by": provider,
            "available": info["available"],
        })
    for qtype in catalog["query_types"]:
        data.append({
            "id": qtype,
            "object": "model",
            "owned_by": "onramp-query-router",
            "available": True,
        })
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

    system, prompt = _extract_prompt(body.messages)
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="messages must include a user message")
    max_tokens = body.max_tokens or 2000

    if body.stream:
        # Debug route header (best-effort — resolved from the primary provider).
        route_header = _route_header_for(llm, body, prompt)
        return StreamingResponse(
            # Usage (with real token counts + cost) is tracked inside the
            # generator once the stream completes; failed streams are not
            # billed, so nothing is recorded on the error path.
            _stream_events(llm, body, system, prompt, max_tokens, auth),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-LLM-Route": route_header,
            },
        )

    try:
        # cache_scope isolates the response cache per tenant (org) so one
        # customer's cached answers are never served to another.
        cache_scope = auth.get("org_name") or auth.get("uid") or "global"
        content, served, route = await llm.openai_chat(
            prompt,
            system=system,
            max_tokens=max_tokens,
            model=body.model,
            cache_scope=cache_scope,
        )
    except RuntimeError as exc:
        logger.warning("Chat completion failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    await _track_usage(
        auth, route, input_tokens=estimate_tokens(prompt), output_tokens=estimate_tokens(content)
    )
    # Debug headers: which provider/model served this request, and whether it
    # was served from the Redis response cache (free, zero tokens/cost).
    response.headers["X-LLM-Route"] = served
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


async def _stream_events(llm, body: ChatCompletionRequest, system, prompt, max_tokens, auth):
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
    try:
        async for token, model_id, _route in llm.openai_chat_stream(
            prompt, system=system, max_tokens=max_tokens, model=body.model
        ):
            served = model_id
            route = _route
            output_chars += len(token)
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
        yield _sse({
            "error": {
                "message": str(exc),
                "type": "upstream_error",
                "code": "router_exhausted",
            }
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

    provider = embeddings.resolve_model(body.model)
    try:
        vectors, served_provider, route = await embeddings.embed_batch(texts)
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
    return {
        "object": "list",
        "data": data,
        "model": route.get("served", model_cfg["model"]),
        "usage": {"prompt_tokens": tokens, "total_tokens": tokens},
        "cost_usd": usd,
        "cost_inr": inr,
    }
