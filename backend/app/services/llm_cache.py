"""LLM Response Cache — Redis-backed, keyed by (query type + prompt).

Stage 3 of the token-saving strategy: repeated prompts (same query type,
same system prompt, same max_tokens) are served from Redis instead of
hitting a provider, so a cache hit costs **$0** and zero input tokens.

Two tiers, both inside the router (see ``LLMRouter.chat`` / ``openai_chat``)
so every agent and the OpenAI gateway benefit automatically:

- **Exact tier** — keys are normalized (whitespace collapsed, stripped) so
  semantically identical prompts with different formatting still hit.
- **Semantic tier** — *near-duplicate* questions (light rephrasings, case /
  punctuation / word-order noise) hit a previously stored answer even when
  the exact key differs. Prompts are embedded locally (hashed character
  n-grams — no embedding API call, which would cost more than it saves) and
  a candidate is only served when BOTH gates pass:

    1. cosine similarity ≥ ``LLM_SEMANTIC_THRESHOLD`` (default 0.85), and
    2. the new question's content words are a **subset** of the stored
       question's content words.

  The subset gate is what makes the tier safe: lexical similarity alone
  cannot tell ``sort`` from ``reverse`` or ``auth`` from ``payment`` (both
  score ~0.9), but a cached answer is only served when the new question
  introduces no new content words, so one-word adversarial rewrites
  structurally miss and fall through to the provider.

Cache hits are attributed as a synthetic ``cache/redis`` or
``cache/semantic`` route with ``free=True`` and zero price — they show up
in the cost-savings reports as requests that avoided the full baseline
cost.

Streaming responses are NOT cached (they are unbounded/one-shot); only
non-streaming ``chat``/``json_chat``/``openai_chat`` calls are.

Redis is optional: when ``REDIS_URL`` is unset the service falls back to
in-process TTL dicts so dev/tests behave identically.
"""

import asyncio
import hashlib
import json
import logging
import math
import os
import re
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("onramp.llm_cache")

REDIS_PREFIX = "llm:resp"
DEFAULT_TTL = int(os.getenv("LLM_CACHE_TTL", str(3600)))  # 1h default

# ── Semantic tier knobs ──────────────────────────────────────────────────
SEMANTIC_PREFIX = "llm:sem"
SEMANTIC_ENABLED = os.getenv("LLM_SEMANTIC_CACHE", "1") != "0"
DEFAULT_SEMANTIC_THRESHOLD = float(os.getenv("LLM_SEMANTIC_THRESHOLD", "0.85"))
BUCKET_CAP = int(os.getenv("LLM_SEMANTIC_BUCKET_CAP", "100"))  # max entries per bucket
EMBED_DIM = 512
# Prompts shorter than this carry too little signal for similarity to be
# meaningful — let them fall through to the exact tier / provider.
_MIN_PROMPT_LEN = 8

# ── In-process fallback when Redis is unavailable ──────────────────────
_LOCAL_CACHE: Dict[str, Tuple[float, str]] = {}
# Bucket -> {entry_id: (expiry_ts, entry_dict)} — mirrors the Redis hash
# layout so dev/tests behave identically without a Redis instance.
_LOCAL_SEM: Dict[str, Dict[str, Tuple[float, dict]]] = {}
_LOCAL_CACHE_LOCK = asyncio.Lock()

_WS_RE = re.compile(r"[ \t]+")
# Content words are the subset-gate vocabulary: strip punctuation, drop
# stopwords and single-char tokens so the gate keys on distinctive meaning.
_PUNC_RE = re.compile(r"[^a-z0-9]+")
_STOPWORDS = frozenset(
    """a an the is are was were be been how do does did to of in on at for with
    by from this that it its can could should would what which who whom when
    where why as or and but not no yes if then than so too very just about into
    over under again further once here there all any both each few more most
    other some such only own same s t don now i me my we our you your he him his
    she her they them their""".split()
)


async def _redis():
    """Redis client or None (graceful fallback)."""
    try:
        from app.services.cache_service import get_client

        return await get_client()
    except Exception:
        return None


def _normalize(text: Optional[str]) -> str:
    """Collapse horizontal whitespace runs; preserve newlines + indentation.

    Newlines and indentation are semantic in code (Python block structure),
    so they must survive normalization — flattening them could serve a
    wrong cached answer for a differently-indented prompt. Horizontal runs
    of spaces/tabs are collapsed so formatting noise still hits.
    """
    return _WS_RE.sub(" ", (text or "").strip())


# ── Exact tier ───────────────────────────────────────────────────────────

def cache_key(
    query_type: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    scope: str = "global",
) -> str:
    """Deterministic cache key for a call.

    ``query_type`` must be the *string value* of the resolved QueryType
    (not the enum) — the router resolves classification before checking.
    ``scope`` isolates tenants (org/uid) so one customer's cached answer is
    never served to another — pass the caller's org name for user-facing
    prompts. Prompts that are genuinely global/system-level may keep the
    default "global" scope to share cache entries.
    """
    raw = f"{scope}|{query_type}|{_normalize(prompt)}|{_normalize(system)}|{max_tokens}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{REDIS_PREFIX}:{scope}:{query_type}:{digest}"


async def get_cached(
    query_type: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    scope: str = "global",
) -> Optional[str]:
    """Return the cached response text, or None on miss / cache error."""
    key = cache_key(query_type, prompt, system, max_tokens, scope=scope)
    client = await _redis()
    if client:
        try:
            raw = await client.get(key)
            if raw is not None:
                return raw
        except Exception:
            logger.debug("Redis llm-cache get failed for %s", key)
    async with _LOCAL_CACHE_LOCK:
        entry = _LOCAL_CACHE.get(key)
        if entry and entry[0] > time.time():
            return entry[1]
        _LOCAL_CACHE.pop(key, None)
    return None


async def set_cached(
    query_type: str,
    prompt: str,
    system: Optional[str],
    max_tokens: int,
    response: str,
    ttl: int = DEFAULT_TTL,
    scope: str = "global",
) -> None:
    """Store a response with TTL. Never raises (cache must be best-effort)."""
    if not response:
        return
    key = cache_key(query_type, prompt, system, max_tokens, scope=scope)
    client = await _redis()
    if client:
        try:
            await client.setex(key, ttl, response)
            return
        except Exception:
            logger.debug("Redis llm-cache set failed for %s", key)
    async with _LOCAL_CACHE_LOCK:
        _LOCAL_CACHE[key] = (time.time() + ttl, response)


async def is_cached(
    query_type: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    scope: str = "global",
) -> bool:
    return await get_cached(query_type, prompt, system, max_tokens, scope=scope) is not None


async def evict(
    query_type: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    scope: str = "global",
) -> bool:
    """Remove one cached entry (used by invalidation hooks / tests)."""
    key = cache_key(query_type, prompt, system, max_tokens, scope=scope)
    removed = False
    client = await _redis()
    if client:
        try:
            removed = bool(await client.delete(key))
        except Exception:
            pass
    async with _LOCAL_CACHE_LOCK:
        if _LOCAL_CACHE.pop(key, None) is not None:
            removed = True
    # Cascade to the semantic tier so an invalidation of the exact entry
    # cannot leave a stale near-duplicate answer behind.
    await evict_semantic(query_type, prompt, system, max_tokens, scope=scope)
    return removed


# ── Semantic tier (near-duplicate detection) ─────────────────────────────

def _embed(text: str, dim: int = EMBED_DIM) -> List[float]:
    """Local deterministic embedding: hashed character n-grams (1–3).

    Deliberately NOT an embedding API — probing the cache must be cheaper
    (faster, freer, private) than the LLM call it replaces. The result is
    an L2-normalized TF hash vector, so cosine similarity measures lexical
    overlap. It is not a semantic model and cannot tell ``sort`` from
    ``reverse`` — that is exactly why lookups ALSO enforce the content-word
    subset gate (see ``get_semantic``).
    """
    n = _normalize(text).lower()
    vec = [0.0] * dim
    if not n:
        return vec
    for size in (1, 2, 3):
        for i in range(0, len(n) - size + 1):
            gram = n[i:i + size]
            h = int(hashlib.md5(gram.encode("utf-8")).hexdigest()[:8], 16) % dim
            vec[h] += 1.0
    m = math.sqrt(sum(v * v for v in vec))
    if m > 0:
        vec = [v / m for v in vec]
    return vec


def _cosine(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _content_words(text: str) -> frozenset:
    """Distinctive content words: stopwords + punctuation removed.

    The subset gate: a stored answer may only be served to a near-duplicate
    question when EVERY content word of the new question also appears in
    the stored question. One-word adversarial rewrites (``sort`` →
    ``reverse``, ``auth`` → ``payment``) introduce a new content word and
    therefore miss, which raw n-gram similarity alone cannot guarantee.
    """
    tokens = _PUNC_RE.sub(" ", _normalize(text).lower()).split()
    return frozenset(w for w in tokens if w not in _STOPWORDS and len(w) > 1)


def _semantic_bucket_key(
    query_type: str, system: Optional[str], max_tokens: int, scope: str
) -> str:
    """Bucket = one hash per (scope, query type, system, max_tokens)."""
    ctx = hashlib.sha256(f"{_normalize(system)}|{max_tokens}".encode("utf-8")).hexdigest()[:16]
    return f"{SEMANTIC_PREFIX}:{scope}:{query_type}:{ctx}"


def _entry_id(vec: List[float]) -> str:
    """Deterministic hash field name for an embedding (same prompt → same id)."""
    return hashlib.sha256(repr(vec).encode("utf-8")).hexdigest()[:24]


async def get_semantic(
    query_type: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    scope: str = "global",
    threshold: Optional[float] = None,
) -> Optional[Tuple[str, float]]:
    """Return ``(response, similarity)`` for a near-duplicate, else None.

    Both gates must pass (see module docstring): cosine similarity over the
    local n-gram embedding AND the content-word subset check. The subset
    check runs against the *stored* prompt of each candidate, so a new
    question can never receive an answer to a question that introduces
    vocabulary it doesn't contain. Best (highest-similarity) passing
    candidate wins. Never raises — the semantic tier is best-effort.
    """
    if not SEMANTIC_ENABLED:
        return None
    if len(_normalize(prompt)) < _MIN_PROMPT_LEN:
        return None
    query_words = _content_words(prompt)
    if not query_words:
        return None
    threshold = DEFAULT_SEMANTIC_THRESHOLD if threshold is None else float(threshold)
    qvec = _embed(prompt)
    bucket = _semantic_bucket_key(query_type, system, max_tokens, scope)
    best_sim, best = threshold, None

    client = await _redis()
    if client:
        try:
            raw = await client.hgetall(bucket)
            for payload in (raw or {}).values():
                try:
                    entry = json.loads(payload)
                except (TypeError, ValueError):
                    continue
                if not query_words <= _content_words(entry.get("p", "")):
                    continue
                sim = _cosine(qvec, entry["v"])
                if sim < best_sim:
                    continue
                best_sim, best = sim, entry.get("r")
            return (best, best_sim) if best is not None else None
        except Exception:
            logger.debug("Redis llm-sem cache read failed for %s", bucket)

    async with _LOCAL_CACHE_LOCK:
        entries = _LOCAL_SEM.get(bucket)
        if not entries:
            return None
        now = time.time()
        for field, (expiry, entry) in list(entries.items()):
            if expiry <= now:
                entries.pop(field, None)
                continue
            if not query_words <= _content_words(entry.get("p", "")):
                continue
            sim = _cosine(qvec, entry["v"])
            if sim < best_sim:
                continue
            best_sim, best = sim, entry.get("r")
    return (best, best_sim) if best is not None else None


async def set_semantic(
    query_type: str,
    prompt: str,
    system: Optional[str],
    max_tokens: int,
    response: str,
    ttl: int = DEFAULT_TTL,
    scope: str = "global",
) -> None:
    """Embed and store a response in the semantic bucket. Best-effort.

    Skips prompts with no distinctive content words or fewer than
    ``_MIN_PROMPT_LEN`` characters — there is nothing safe to match on.
    """
    if not SEMANTIC_ENABLED or not response:
        return
    if len(_normalize(prompt)) < _MIN_PROMPT_LEN:
        return
    if not _content_words(prompt):
        return
    vec = [round(x, 6) for x in _embed(prompt)]
    entry = {"v": vec, "r": response, "p": prompt, "t": time.time()}
    field = _entry_id(vec)
    bucket = _semantic_bucket_key(query_type, system, max_tokens, scope)

    client = await _redis()
    if client:
        try:
            # Single-field HSET is atomic — unlike a whole-hash read-modify-
            # write, a concurrent set can't silently drop a peer's entry.
            await client.hset(bucket, field, json.dumps(entry))
            count = await client.hlen(bucket)
            if count > BUCKET_CAP:
                # Rarely over cap: prune the oldest entries. A tiny race here
                # only ever drops entries (never serves wrong data) and the
                # bucket is TTL-bounded anyway.
                raw = dict(await client.hgetall(bucket) or {})
                while len(raw) > BUCKET_CAP:
                    oldest = min(raw, key=lambda f: _safe_ts(raw[f]))
                    raw.pop(oldest, None)
                await client.hset(bucket, mapping=raw)
            await client.expire(bucket, ttl)
            return
        except Exception:
            logger.debug("Redis llm-sem cache set failed for %s", bucket)

    async with _LOCAL_CACHE_LOCK:
        entries = _LOCAL_SEM.setdefault(bucket, {})
        entries[field] = (time.time() + ttl, entry)
        if len(entries) > BUCKET_CAP:
            oldest = min(entries, key=lambda f: entries[f][0])
            entries.pop(oldest, None)


def _safe_ts(payload: str) -> float:
    try:
        return float(json.loads(payload).get("t", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


async def evict_semantic(
    query_type: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 2000,
    scope: str = "global",
) -> bool:
    """Remove the semantic entry for a prompt (invalidation hooks / tests)."""
    if not SEMANTIC_ENABLED:
        return False
    field = _entry_id([round(x, 6) for x in _embed(prompt)])
    bucket = _semantic_bucket_key(query_type, system, max_tokens, scope)
    removed = False
    client = await _redis()
    if client:
        try:
            removed = bool(await client.hdel(bucket, field))
        except Exception:
            pass
    async with _LOCAL_CACHE_LOCK:
        entries = _LOCAL_SEM.get(bucket)
        if entries and entries.pop(field, None) is not None:
            removed = True
    return removed


async def evict_scope(scope: str) -> int:
    """Evict EVERY cached answer for a scope (exact + semantic tiers).

    Used by the repo push webhook: when code changes, the cached answers
    about that repo are stale and must be dropped so the next request hits
    the provider with the fresh index — no matter how the question was
    phrased (the whole ``llm:resp:{scope}:`` / ``llm:sem:{scope}:`` key
    space). Returns the number of entries removed (best-effort).
    """
    if not scope or scope == "global":
        return 0
    removed = 0

    client = await _redis()
    if client:
        try:
            # SCAN the two prefixes (never KEYS in production) and delete.
            for prefix in (f"{REDIS_PREFIX}:{scope}:", f"{SEMANTIC_PREFIX}:{scope}:"):
                cursor = 0
                while True:
                    cursor, keys = await client.scan(cursor, match=prefix + "*", count=200)
                    if keys:
                        removed += len(keys)
                        await client.delete(*keys)
                    cursor = int(cursor)
                    if cursor == 0:
                        break
            return removed
        except Exception:
            logger.debug("Redis llm-cache scope eviction failed for %s", scope)

    async with _LOCAL_CACHE_LOCK:
        for key in [k for k in _LOCAL_CACHE if f":{scope}:" in k]:
            _LOCAL_CACHE.pop(key, None)
            removed += 1
        for bucket in [b for b in _LOCAL_SEM if f":{scope}:" in b]:
            removed += len(_LOCAL_SEM[bucket])
            _LOCAL_SEM.pop(bucket, None)
    return removed
