import os
import json
import re
import logging
from typing import Dict, Any, List, Optional
from enum import Enum

from app.services.llm_costs import get_price
from app.services.llm_cache import (
    get_cached as llm_cache_get,
    set_cached as llm_cache_set,
    get_semantic as llm_cache_get_semantic,
    set_semantic as llm_cache_set_semantic,
)
from app import metrics


def _record_cache(outcome: str, tier: str = "redis") -> None:
    """Record a cache hit/miss into the Prometheus registry (best-effort)."""
    try:
        if outcome == "hit":
            metrics.record_cache_hit(tier=tier)
        else:
            metrics.record_cache_miss()
    except Exception:
        pass


def _record_llm_call(provider, free: bool) -> None:
    """Record a served provider call into the Prometheus registry."""
    try:
        metrics.record_llm_call(provider, free)
    except Exception:
        pass

logger = logging.getLogger("onramp.llm")


def _qtype_value(qtype) -> str:
    """QueryType enum (or None) → its string value, for cache keys."""
    if qtype is None:
        return "auto"
    return qtype.value if hasattr(qtype, "value") else str(qtype)


class ModelProvider(Enum):
    """Available LLM providers ordered by priority (free first, paid last)."""
    OPENROUTER = "openrouter"  # Free
    GEMINI = "gemini"          # Free
    GROQ = "groq"              # Free
    NVIDIA = "nvidia"          # Free
    OPENAI = "openai"          # Paid fallback
    ANTHROPIC = "anthropic"    # Paid fallback
    OLLAMA = "ollama"          # Local / self-hosted (no API key required)


class QueryType(Enum):
    """Semantic query categories used to route a request to the best model.

    Mirrors how OpenRouter picks a model per task: a code-writing prompt
    should hit a coding-strong model, a quick chat should hit a fast cheap
    one, a JSON extraction should hit a model with reliable structured
    output, and so on.
    """

    CHAT = "chat"                     # General conversation / everyday questions
    CODE = "code"                     # Code generation, debugging, refactoring
    REASONING = "reasoning"           # Math, logic, analysis, comparisons
    STRUCTURED = "structured"         # JSON / tables / data extraction
    SUMMARIZATION = "summarization"   # Condense long content into key points
    TRANSLATION = "translation"       # Convert text between languages
    CREATIVE = "creative"             # Stories, poems, marketing copy, prose


QUERY_TYPE_LABELS: Dict[QueryType, str] = {
    QueryType.CHAT: "General conversation and everyday questions - fastest/cheapest model",
    QueryType.CODE: "Code generation, debugging, and refactoring - coding-strong models first",
    QueryType.REASONING: "Math, logic, and analysis - strong reasoning models first",
    QueryType.STRUCTURED: "JSON, tables, and data extraction - models with reliable structured output",
    QueryType.SUMMARIZATION: "Condensing long content into key points - fast, long-context models",
    QueryType.TRANSLATION: "Converting text between languages - multilingual models first",
    QueryType.CREATIVE: "Stories, poems, and marketing copy - best prose models first",
}

# Per-query-type provider preference. Entries are tried in order; providers
# without an API key are skipped, and the remaining global fallback chain is
# always appended afterwards, so every query type keeps the full resilience
# of the fallback chain.
#
# CHAT intentionally has an empty preference list: it reuses the default
# free-first fallback chain (OpenRouter -> Gemini -> Groq -> ...) unchanged.
QUERY_TYPE_ROUTES: Dict[QueryType, List[ModelProvider]] = {
    QueryType.CHAT: [],
    QueryType.CODE: [
        ModelProvider.ANTHROPIC,   # Claude - strongest at code
        ModelProvider.OPENAI,      # GPT - solid general coder
        ModelProvider.GEMINI,      # free
        ModelProvider.GROQ,        # free & fast
        ModelProvider.OPENROUTER,  # free
        ModelProvider.NVIDIA,      # free
        ModelProvider.OLLAMA,      # local
    ],
    QueryType.REASONING: [
        ModelProvider.GEMINI,      # free & strong reasoning
        ModelProvider.OPENAI,
        ModelProvider.ANTHROPIC,
        ModelProvider.GROQ,
        ModelProvider.OPENROUTER,
        ModelProvider.NVIDIA,
        ModelProvider.OLLAMA,
    ],
    QueryType.STRUCTURED: [
        ModelProvider.GROQ,        # fast, reliable JSON output
        ModelProvider.GEMINI,
        ModelProvider.OPENROUTER,
        ModelProvider.OPENAI,
        ModelProvider.NVIDIA,
        ModelProvider.ANTHROPIC,
        ModelProvider.OLLAMA,
    ],
    QueryType.SUMMARIZATION: [
        ModelProvider.GROQ,        # fast + long context
        ModelProvider.GEMINI,
        ModelProvider.OPENROUTER,
        ModelProvider.NVIDIA,
        ModelProvider.OPENAI,
        ModelProvider.ANTHROPIC,
        ModelProvider.OLLAMA,
    ],
    QueryType.TRANSLATION: [
        ModelProvider.GEMINI,      # strong multilingual, free
        ModelProvider.GROQ,
        ModelProvider.OPENROUTER,
        ModelProvider.NVIDIA,
        ModelProvider.OPENAI,
        ModelProvider.ANTHROPIC,
        ModelProvider.OLLAMA,
    ],
    QueryType.CREATIVE: [
        ModelProvider.ANTHROPIC,   # best prose
        ModelProvider.OPENAI,
        ModelProvider.GEMINI,
        ModelProvider.GROQ,
        ModelProvider.OPENROUTER,
        ModelProvider.NVIDIA,
        ModelProvider.OLLAMA,
    ],
}

# Lightweight keyword classifier - cheap, deterministic, no extra LLM call.
# Ties resolve by dict insertion order (CODE > REASONING > STRUCTURED >
# SUMMARIZATION > TRANSLATION > CREATIVE > CHAT).
_QUERY_KEYWORDS: Dict[QueryType, List[str]] = {
    QueryType.CODE: [
        "code", "function", "method", "class", "bug", "error", "exception",
        "debug", "refactor", "implement", "script", "syntax", "compile",
        "api", "endpoint", "sql", "database", "python", "javascript",
        "typescript", "react", "docker", "git", "regex", "variable",
        "stack trace", "algorithm", "deploy", "pull request",
    ],
    QueryType.REASONING: [
        "why", "explain", "reason", "logic", "analyze", "compare",
        "difference", "solve", "calculate", "math", "equation", "prove",
        "probability", "statistics", "hypothesis", "evaluate", "infer",
        "deduce", "justify", "pros and cons", "trade-off",
    ],
    QueryType.STRUCTURED: [
        "json", "extract", "table", "csv", "schema", "parse", "array of",
        "fields", "columns", "output as", "return a dict", "yaml", "xml",
        "list of", "list the", "list all", "key-value", "structured",
    ],
    QueryType.SUMMARIZATION: [
        "summarize", "summary", "tl;dr", "tldr", "key points",
        "key takeaways", "bullet points", "condense", "shorten", "overview",
        "recap", "in brief",
    ],
    QueryType.TRANSLATION: [
        "translate", "translation", "in french", "in spanish", "in german",
        "in hindi", "in tamil", "in telugu", "to english", "to french",
        "to spanish", "from english", "from french",
    ],
    QueryType.CREATIVE: [
        "story", "poem", "poetry", "essay", "blog", "article", "marketing",
        "ad copy", "slogan", "tagline", "novel", "screenplay", "song",
        "lyrics", "creative", "metaphor", "write a letter",
    ],
}

# Cheap syntactic signals that a prompt is about code (in addition to
# words). Kept to tokens that rarely appear in prose ("return " and
# "await " are deliberately excluded — too common in everyday language).
_CODE_MARKERS = (
    "def ", "import ", "const ", "=>", "console.log", "<div",
    ".py", ".js", ".ts", "print(", "if __name__",
)

_WORD_RE = re.compile(r"\b")


def _kw_in(text: str, keyword: str) -> bool:
    """Substring match for phrases, word-boundary match for short tokens."""
    if len(keyword) >= 6 or " " in keyword:
        return keyword in text
    return _WORD_RE.search(keyword) is not None and (
        re.search(rf"\b{re.escape(keyword)}\b", text) is not None
    )


def classify_query(prompt: str) -> QueryType:
    """Classify a prompt into a :class:`QueryType` using keyword scoring."""
    text = prompt.lower()
    scores: Dict[QueryType, int] = {t: 0 for t in QueryType}
    for qtype, keywords in _QUERY_KEYWORDS.items():
        for kw in keywords:
            if _kw_in(text, kw):
                scores[qtype] += 1

    # Syntactic markers count toward CODE unconditionally, so a bare code
    # snippet ("def foo(): return 42") still classifies as CODE without
    # needing any code-related keywords.
    scores[QueryType.CODE] += sum(1 for m in _CODE_MARKERS if m in text)

    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else QueryType.CHAT


class LLMRouter:
    """Multi-provider LLM with query-type routing and fallback chain.

    Each request is classified into a :class:`QueryType` (or the caller may
    force one), routed to the provider chain best suited for that type
    (OpenRouter-style), and each provider is called through its official AI
    SDK (OpenAI SDK for all OpenAI-compatible endpoints, google-genai for
    Gemini, anthropic for Claude). SDKs are imported lazily inside each call
    so a missing optional SDK only disables that one provider instead of
    breaking application startup.
    """

    def __init__(self):
        # Fallback chain: free providers first → paid providers second → local/Ollama last
        self.fallback_chain = [
            ModelProvider.OPENROUTER,
            ModelProvider.GEMINI,
            ModelProvider.GROQ,
            ModelProvider.NVIDIA,
            ModelProvider.OPENAI,
            ModelProvider.ANTHROPIC,
            ModelProvider.OLLAMA,
        ]

        # Provider config: api_key, model, base_url (for OpenAI-compatible), type, free flag
        # Ollama uses OLLAMA_BASE_URL (not an API key) as the availability signal.
        _ollama_base_url = os.getenv("OLLAMA_BASE_URL", "")
        self.providers = {
            ModelProvider.OPENROUTER: {
                "api_key": os.getenv("OPENROUTER_API_KEY"),
                "model": "google/gemini-2.5-flash:free",
                "base_url": "https://openrouter.ai/api/v1",
                "type": "openai_sdk",
                "free": True,
            },
            ModelProvider.GEMINI: {
                "api_key": os.getenv("GEMINI_API_KEY"),
                "model": "gemini-2.5-flash",
                "base_url": None,
                "type": "gemini_sdk",
                "free": True,
            },
            ModelProvider.GROQ: {
                "api_key": os.getenv("GROQ_API_KEY"),
                "model": "llama-3.3-70b-versatile",
                "base_url": "https://api.groq.com/openai/v1",
                "type": "openai_sdk",
                "free": True,
            },
            ModelProvider.NVIDIA: {
                "api_key": os.getenv("NVIDIA_API_KEY"),
                "model": "meta/llama-3.3-70b-instruct",
                "base_url": "https://integrate.api.nvidia.com/v1",
                "type": "openai_sdk",
                "free": True,
            },
            ModelProvider.OPENAI: {
                "api_key": os.getenv("OPENAI_API_KEY"),
                "model": "gpt-4o-mini",
                "base_url": "https://api.openai.com/v1",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.ANTHROPIC: {
                "api_key": os.getenv("ANTHROPIC_API_KEY"),
                "model": "claude-3-5-sonnet-20241022",
                "base_url": None,
                "type": "anthropic_sdk",
                "free": False,
            },
            ModelProvider.OLLAMA: {
                "api_key": os.getenv("OLLAMA_API_KEY", "ollama"),  # Most local Ollama installs don't need a key
                "model": os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
                "base_url": _ollama_base_url or "http://localhost:11434/v1",
                "type": "openai_sdk",
                "free": True,
            },
        }

        self.current_provider = None
        # Attribution for the most recent completed call: which provider/model
        # served it and whether it was free — used for cost-savings tracking.
        self.last_route: Optional[Dict[str, Any]] = None
        # True when the most recent call was served from the Redis response
        # cache (zero tokens, zero cost) instead of a provider.
        self.last_cache_hit = False
        # Cosine similarity of the semantic-tier hit (None for exact hits /
        # provider calls) — lets the gateway report which tier served.
        self.last_similarity: Optional[float] = None
        self._initialize_providers()

    def _initialize_providers(self):
        """Check which providers are available and set primary.

        A provider is available if:
        - It has an ``api_key`` configured (all cloud providers), OR
        - It has ``OLLAMA_BASE_URL`` set or a default local Ollama at
          ``http://localhost:11434/v1`` (checked at call time by sniffing
          the endpoint — we always include Ollama in the chain; if the
          server isn't running the request will fail and the router falls
          through to the next provider).
        """
        available = [
            p for p in self.fallback_chain
            if self.providers[p]["api_key"]
        ]
        # Ollama is always included in the chain (checked at call time),
        # but only becomes primary if no cloud providers are configured.
        if not available:
            available = [ModelProvider.OLLAMA]
        if not available:
            raise RuntimeError(
                "No LLM provider API keys configured. Set at least one: "
                "OPENROUTER_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, "
                "OPENAI_API_KEY, ANTHROPIC_API_KEY, or set OLLAMA_BASE_URL for local models."
            )
        self.current_provider = available[0]
        fallback_list = [p.value for p in available[1:]]
        logger.info(
            f"LLMRouter initialized. Primary: {self.current_provider.value}, "
            f"Fallbacks: {fallback_list if fallback_list else 'none'}"
        )

    # ── Query-type routing (OpenRouter-style) ──────────────────────────────

    @staticmethod
    def _coerce_query_type(query_type) -> Optional[QueryType]:
        """Accept a QueryType, its string value, or None; unknown strings fall
        back to ``None`` so callers auto-classify instead of raising."""
        if query_type is None or isinstance(query_type, QueryType):
            return query_type
        try:
            return QueryType(query_type)
        except ValueError:
            logger.warning("Unknown query type %r, falling back to auto-classification", query_type)
            return None

    def classify(self, prompt: str) -> QueryType:
        """Classify a prompt into a query type (heuristic, no extra LLM call)."""
        return classify_query(prompt)

    def resolve_route(self, query_type) -> List[ModelProvider]:
        """Ordered provider chain for a query type.

        Type-specific preferences come first; every remaining configured
        provider is appended afterwards so a query type can never exhaust
        the router's fallback resilience.
        """
        qtype = self._coerce_query_type(query_type) or QueryType.CHAT
        preferred = [
            p for p in QUERY_TYPE_ROUTES.get(qtype, [])
            if self.providers[p]["api_key"]
        ]
        seen = set(preferred)
        rest = [
            p for p in self.fallback_chain
            if p not in seen and self.providers[p]["api_key"]
        ]
        return preferred + rest

    def list_models(self) -> Dict[str, Any]:
        """OpenRouter-style model catalog for this router."""
        return {
            "router": "onramp-query-router",
            "query_types": {
                t.value: {
                    "description": QUERY_TYPE_LABELS[t],
                    "preferred_providers": [p.value for p in QUERY_TYPE_ROUTES[t]],
                }
                for t in QueryType
            },
            "providers": {
                p.value: {
                    "model": cfg["model"],
                    "base_url": cfg["base_url"],
                    "type": cfg["type"],
                    "free": cfg["free"],
                    "available": bool(cfg["api_key"]),
                }
                for p, cfg in self.providers.items()
            },
        }

    # ── OpenAI-compatible routing (OpenRouter-style) ───────────────────────

    def _chain_starting_with(self, provider: ModelProvider) -> List[ModelProvider]:
        """Ordered chain with ``provider`` first, then the configured fallbacks."""
        if not self.providers[provider]["api_key"]:
            return self.resolve_route(QueryType.CHAT)
        return [provider] + [
            p for p in self.fallback_chain
            if p != provider and self.providers[p]["api_key"]
        ]

    def provider_chain(
        self,
        model: Optional[str] = None,
        query_type: Optional[QueryType] = None,
        prompt: Optional[str] = None,
    ) -> List[ModelProvider]:
        """Resolve an OpenAI-style ``model`` string to an ordered provider chain.

        Accepted, in order of precedence:
          - an explicit ``query_type`` (a :class:`QueryType` or its value),
          - a query-type name ("code", "reasoning", "chat", ...),
          - a provider name ("openrouter", "gemini", "groq", ...),
          - a known model id ("gpt-4o-mini", "llama-3.3-70b-versatile", ...),
          - auto-classification of ``prompt`` if provided,
          - otherwise the default CHAT chain.
        """
        qtype = self._coerce_query_type(query_type)
        if qtype is not None:
            return self.resolve_route(qtype)
        if model:
            m = model.strip().lower()
            try:
                return self.resolve_route(QueryType(m))
            except ValueError:
                pass
            for provider in ModelProvider:
                if m == provider.value:
                    return self._chain_starting_with(provider)
            for provider, cfg in self.providers.items():
                if cfg["model"] and m == cfg["model"].lower():
                    return self._chain_starting_with(provider)
        if prompt:
            return self.resolve_route(self.classify(prompt))
        return self.resolve_route(QueryType.CHAT)

    def route_info(
        self, provider: ModelProvider, query_type: Optional[QueryType] = None
    ) -> Dict[str, Any]:
        """Attribution dict for a served call (provider, model, free, price).

        Includes the per-1M-token input/output price (USD) from
        :mod:`app.services.llm_costs` so the persisted route record is
        self-contained — cost numbers stay accurate even if the pricing
        table changes after the request.
        """
        cfg = self.providers[provider]
        price = get_price(cfg["model"])
        return {
            "provider": provider.value,
            "model": cfg["model"],
            "served": f"{provider.value}/{cfg['model']}",
            "free": bool(cfg.get("free")),
            "query_type": query_type.value if query_type is not None else None,
            "price_in": price["input"],
            "price_out": price["output"],
        }

    def _effective_query_type(
        self,
        model: Optional[str],
        query_type: Optional[QueryType],
        prompt: Optional[str],
    ) -> Optional[QueryType]:
        """Query type that routing used, for attribution only."""
        qtype = self._coerce_query_type(query_type)
        if qtype is not None:
            return qtype
        if model:
            try:
                return QueryType(model.strip().lower())
            except ValueError:
                pass
        if prompt:
            return self.classify(prompt)
        return QueryType.CHAT

    def served_model(self, provider: ModelProvider) -> str:
        """Human-readable model id actually served (OpenRouter-style)."""
        return f"{provider.value}/{self.providers[provider]['model']}"

    def _cache_route(
        self,
        qtype: Optional[QueryType],
        semantic: bool = False,
        similarity: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Attribution dict for a cache hit (free, $0 cost).

        Two tiers: the exact-match Redis tier (``cache/redis``) and the
        semantic tier (``cache/semantic``) that serves near-duplicate
        questions. Both cost nothing and avoided the full baseline cost, so
        they are recorded with zero price — the cost-savings reports then
        count them as free requests that avoided the baseline entirely.
        ``similarity`` (semantic hits only) records the cosine score so the
        served-route record shows how close the near-duplicate was.
        """
        model = "semantic" if semantic else "redis"
        route = {
            "provider": "cache",
            "model": model,
            "served": f"cache/{model}",
            "free": True,
            "query_type": qtype.value if qtype is not None else None,
            "price_in": 0.0,
            "price_out": 0.0,
            "cached": True,
        }
        if similarity is not None:
            route["similarity"] = round(float(similarity), 4)
        return route

    async def openai_chat(
        self,
        prompt: str,
        system: str = None,
        max_tokens: int = 2000,
        model: Optional[str] = None,
        query_type: Optional[QueryType] = None,
        cache_scope: str = "global",
    ) -> tuple[str, str, Dict[str, Any]]:
        """OpenAI-compatible completion. Returns ``(content, served_model_id, route)``.

        ``cache_scope`` isolates the response cache per tenant (org/uid) so
        one customer's cached answers are never served to another.
        """
        qtype = self._effective_query_type(model, query_type, prompt)
        cached = await llm_cache_get(_qtype_value(qtype), prompt, system, max_tokens, scope=cache_scope)
        if cached is not None:
            route = self._cache_route(qtype)
            self.last_route = route
            self.last_cache_hit = True
            self.last_similarity = None
            _record_cache("hit", tier="redis")
            logger.debug("LLM cache hit (%s): %s…", qtype.value if qtype else "auto", cached[:60])
            return cached, "cache/redis", route
        # Semantic tier: near-duplicate questions (same content words, high
        # lexical overlap) are served from the cache without a provider
        # call. Safe by construction — get_semantic only serves an answer
        # when the new question introduces no new content words.
        semantic = await llm_cache_get_semantic(
            _qtype_value(qtype), prompt, system, max_tokens, scope=cache_scope
        )
        if semantic is not None:
            text, similarity = semantic
            route = self._cache_route(qtype, semantic=True, similarity=similarity)
            self.last_route = route
            self.last_cache_hit = True
            self.last_similarity = similarity
            _record_cache("hit", tier="semantic")
            logger.debug(
                "LLM semantic cache hit (%s, sim=%.3f): %s…",
                qtype.value if qtype else "auto", similarity, text[:60],
            )
            return text, "cache/semantic", route
        chain = self.provider_chain(model=model, query_type=query_type, prompt=prompt)
        response, provider = await self._complete(chain, prompt, system, max_tokens)
        route = self.route_info(provider, query_type=qtype)
        self.last_route = route
        self.last_cache_hit = False
        self.last_similarity = None
        _record_cache("miss")
        _record_llm_call(provider.value, route["free"])
        await llm_cache_set(_qtype_value(qtype), prompt, system, max_tokens, response, scope=cache_scope)
        await llm_cache_set_semantic(_qtype_value(qtype), prompt, system, max_tokens, response, scope=cache_scope)
        return response, self.served_model(provider), route

    async def openai_chat_stream(
        self,
        prompt: str,
        system: str = None,
        max_tokens: int = 2000,
        model: Optional[str] = None,
        query_type: Optional[QueryType] = None,
    ):
        """OpenAI-compatible streaming completion. Yields
        ``(token, served_model_id, route)``."""
        chain = self.provider_chain(model=model, query_type=query_type, prompt=prompt)
        route_qtype = self._effective_query_type(model, query_type, prompt)
        served_provider = None
        async for token, provider in self._stream_complete(chain, prompt, system, max_tokens):
            if served_provider is None:
                served_provider = provider
            yield token, self.served_model(provider), self.route_info(provider, query_type=route_qtype)
        if served_provider is not None:
            self.last_route = self.route_info(served_provider, query_type=route_qtype)

    # ── Chat ───────────────────────────────────────────────────────────────

    async def chat(
        self,
        prompt: str,
        system: str = None,
        max_tokens: int = 2000,
        query_type: Optional[QueryType] = None,
        cache_scope: str = "global",
    ) -> str:
        """Call LLM with automatic fallback on error. Free providers tried first.

        ``query_type`` may be a :class:`QueryType` or its string value; when
        omitted the prompt is classified automatically. ``cache_scope``
        isolates the response cache per tenant (org/uid) — pass the caller's
        org name for user-facing prompts so cached answers never cross
        tenants. Repeats are served from the exact-match Redis cache, and
        near-duplicates from the semantic tier (see
        :mod:`app.services.llm_cache`) — both record a free ``cache/*``
        route with zero price.
        """
        qtype = self._coerce_query_type(query_type) or self.classify(prompt)
        cached = await llm_cache_get(_qtype_value(qtype), prompt, system, max_tokens, scope=cache_scope)
        if cached is not None:
            self.last_route = self._cache_route(qtype)
            self.last_cache_hit = True
            self.last_similarity = None
            _record_cache("hit", tier="redis")
            return cached
        # Semantic tier (see openai_chat for the rationale).
        semantic = await llm_cache_get_semantic(
            _qtype_value(qtype), prompt, system, max_tokens, scope=cache_scope
        )
        if semantic is not None:
            text, similarity = semantic
            route = self._cache_route(qtype, semantic=True, similarity=similarity)
            self.last_route = route
            self.last_cache_hit = True
            self.last_similarity = similarity
            _record_cache("hit", tier="semantic")
            logger.debug(
                "LLM semantic cache hit (%s, sim=%.3f): %s…",
                qtype.value if qtype else "auto", similarity, text[:60],
            )
            return text
        response, provider = await self._complete(
            self.resolve_route(qtype), prompt, system, max_tokens
        )
        # Single assignment (no set-then-patch) so concurrent requests can't
        # clobber the attribution mid-update.
        self.last_route = self.route_info(provider, query_type=qtype)
        self.last_cache_hit = False
        self.last_similarity = None
        _record_cache("miss")
        _record_llm_call(provider.value, self.last_route["free"])
        await llm_cache_set(_qtype_value(qtype), prompt, system, max_tokens, response, scope=cache_scope)
        await llm_cache_set_semantic(_qtype_value(qtype), prompt, system, max_tokens, response, scope=cache_scope)
        return response

    async def _complete(
        self,
        chain: List[ModelProvider],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> tuple[str, ModelProvider]:
        """Run a completion over an explicit provider chain with fallback."""
        errors = []
        for provider in chain:
            config = self.providers[provider]
            if not config["api_key"]:
                continue

            try:
                response = await self._call_provider(provider, prompt, system, max_tokens)
                if self.current_provider != provider:
                    logger.info(f"Switched to provider: {provider.value}")
                    self.current_provider = provider
                return response, provider
            except Exception as e:
                err_msg = f"{provider.value} failed: {str(e)}"
                logger.warning(err_msg)
                errors.append(err_msg)

        raise RuntimeError(f"All LLM providers exhausted. Errors: {'; '.join(errors)}")

    async def json_chat(
        self,
        prompt: str,
        system: str = None,
        query_type: Optional[QueryType] = QueryType.STRUCTURED,
    ) -> dict:
        """Call LLM expecting JSON response with automatic fallback.

        Defaults to the STRUCTURED route (models with reliable JSON output).
        """
        qtype = self._coerce_query_type(query_type) or QueryType.STRUCTURED
        response = await self.chat(prompt, system, query_type=qtype)
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            start = response.find("{")
            end = response.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(response[start:end])
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"Could not parse JSON from response: {response[:200]}")

    async def _call_provider(
        self,
        provider: ModelProvider,
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """Dispatch to the right SDK for this provider type."""
        config = self.providers[provider]
        ptype = config["type"]

        if ptype == "openai_sdk":
            return await self._call_openai_sdk(provider, config, prompt, system, max_tokens)
        elif ptype == "gemini_sdk":
            return await self._call_gemini_sdk(config, prompt, system, max_tokens)
        elif ptype == "anthropic_sdk":
            return await self._call_anthropic_sdk(config, prompt, system, max_tokens)
        raise NotImplementedError(f"Provider type {ptype} not implemented")

    async def _call_openai_sdk(
        self,
        provider: ModelProvider,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """OpenAI Python SDK — covers OpenAI, OpenRouter, Groq, NVIDIA (OpenAI-compatible)."""
        from openai import AsyncOpenAI

        default_headers = None
        if provider == ModelProvider.OPENROUTER:
            # OpenRouter attribution headers (recommended, not required)
            default_headers = {
                "HTTP-Referer": "https://github.com/KunjShah95/codegenome",
                "X-Title": "CodeGenome",
            }

        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            default_headers=default_headers,
            timeout=30.0,
        )

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        resp = await client.chat.completions.create(
            model=config["model"],
            messages=messages,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content

    async def _call_gemini_sdk(
        self,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """Google Gen AI SDK (google-genai)."""
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=config["api_key"])

        gen_config = None
        if system:
            gen_config = types.GenerateContentConfig(system_instruction=system)

        resp = await client.aio.models.generate_content(
            model=config["model"],
            contents=prompt,
            config=gen_config,
        )
        return resp.text

    async def _call_anthropic_sdk(
        self,
        config: Dict[str, Any],
        prompt: str,
        system: str,
        max_tokens: int,
    ) -> str:
        """Anthropic SDK (Claude)."""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=config["api_key"], timeout=30.0)

        kwargs = {
            "model": config["model"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        resp = await client.messages.create(**kwargs)
        return resp.content[0].text


    # ── Streaming ────────────────────────────────────────────────────────────

    async def chat_stream(
        self,
        prompt: str,
        system: str = None,
        max_tokens: int = 2000,
        query_type: Optional[QueryType] = None,
    ):
        """Stream a response token-by-token with provider fallback.

        Fallback only applies *before* the first token of a provider is emitted;
        once a provider starts streaming we commit to it (can't cleanly resume
        a half-emitted answer on another provider).
        """
        qtype = self._coerce_query_type(query_type) or self.classify(prompt)
        served_provider = None
        async for token, provider in self._stream_complete(
            self.resolve_route(qtype), prompt, system, max_tokens
        ):
            if served_provider is None:
                served_provider = provider
            yield token
        if served_provider is not None:
            self.last_route = self.route_info(served_provider, query_type=qtype)

    async def _stream_complete(
        self,
        chain: List[ModelProvider],
        prompt: str,
        system: str,
        max_tokens: int,
    ):
        """Shared streaming generator over an explicit provider chain."""
        errors = []
        for provider in chain:
            config = self.providers[provider]
            if not config["api_key"]:
                continue
            yielded = False
            try:
                async for token in self._stream_provider(provider, prompt, system, max_tokens):
                    yielded = True
                    yield token, provider
                if self.current_provider != provider:
                    logger.info(f"Switched to provider (stream): {provider.value}")
                    self.current_provider = provider
                return
            except Exception as e:
                if yielded:
                    raise
                err_msg = f"{provider.value} failed: {str(e)}"
                logger.warning(err_msg)
                errors.append(err_msg)
        raise RuntimeError(f"All LLM providers exhausted (stream). Errors: {'; '.join(errors)}")

    async def _stream_provider(self, provider, prompt, system, max_tokens):
        config = self.providers[provider]
        ptype = config["type"]
        if ptype == "openai_sdk":
            async for t in self._stream_openai_sdk(provider, config, prompt, system, max_tokens):
                yield t
        elif ptype == "gemini_sdk":
            async for t in self._stream_gemini_sdk(config, prompt, system, max_tokens):
                yield t
        elif ptype == "anthropic_sdk":
            async for t in self._stream_anthropic_sdk(config, prompt, system, max_tokens):
                yield t
        else:
            raise NotImplementedError(f"Provider type {ptype} not implemented")

    async def _stream_openai_sdk(self, provider, config, prompt, system, max_tokens):
        from openai import AsyncOpenAI

        default_headers = None
        if provider == ModelProvider.OPENROUTER:
            default_headers = {
                "HTTP-Referer": "https://github.com/KunjShah95/codegenome",
                "X-Title": "CodeGenome",
            }
        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            default_headers=default_headers,
            timeout=60.0,
        )
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        stream = await client.chat.completions.create(
            model=config["model"], messages=messages, max_tokens=max_tokens, stream=True
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _stream_gemini_sdk(self, config, prompt, system, max_tokens):
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=config["api_key"])
        gen_config = types.GenerateContentConfig(system_instruction=system) if system else None
        stream = await client.aio.models.generate_content_stream(
            model=config["model"], contents=prompt, config=gen_config
        )
        async for chunk in stream:
            if getattr(chunk, "text", None):
                yield chunk.text

    async def _stream_anthropic_sdk(self, config, prompt, system, max_tokens):
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=config["api_key"], timeout=60.0)
        kwargs = {
            "model": config["model"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text


# For backward compatibility, maintain LLMClient as an alias
LLMClient = LLMRouter
