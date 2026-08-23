import os
import json
import math
import re
import time
import logging
from collections import deque
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


def _build_continue_prompt(prompt: str, partial_text: str) -> str:
    """Re-prompt for the mid-stream continue mode: the next provider receives
    the original prompt plus the partial output so it can resume seamlessly
    without repeating what the client already saw. Deliberately provider-
    agnostic — works for every SDK path via a single prompt rewrite."""
    return (
        f"{prompt}\n\n"
        "[A previous model started this answer but the connection dropped after "
        "the following text. Continue the answer from exactly where it stopped; "
        "do not repeat any of the text below.]\n\n"
        f"{partial_text}\n"
    )


class ModelProvider(Enum):
    """Available LLM providers ordered by priority (free first, paid last)."""
    OPENROUTER = "openrouter"  # Free (also a passthrough to its full catalog - see _is_openrouter_passthrough_model)
    GEMINI = "gemini"          # Free
    GROQ = "groq"              # Free
    NVIDIA = "nvidia"          # Free
    DEEPSEEK = "deepseek"      # Paid, OpenAI-compatible - very cheap, strong at code/reasoning
    QWEN = "qwen"              # Paid, OpenAI-compatible (Alibaba DashScope)
    ZHIPU = "zhipu"            # Paid, OpenAI-compatible (Zhipu AI / GLM)
    MOONSHOT = "moonshot"      # Paid, OpenAI-compatible (Moonshot AI / Kimi)
    MISTRAL = "mistral"        # Paid fallback (OpenAI-compatible)
    OPENAI = "openai"          # Paid fallback
    ANTHROPIC = "anthropic"    # Paid fallback
    HUGGINGFACE = "huggingface"  # Paid fallback (OpenAI-compatible router)
    TOGETHER = "together"      # Paid, OpenAI-compatible (Together AI)
    FIREWORKS = "fireworks"    # Paid, OpenAI-compatible (Fireworks AI)
    PERPLEXITY = "perplexity"  # Paid, OpenAI-compatible (Perplexity)
    AZURE = "azure"            # Paid, OpenAI-compatible (Azure OpenAI)
    CUSTOM_OPENAI = "custom_openai"  # Generic OpenAI-compatible endpoint (any provider)
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
        ModelProvider.DEEPSEEK,    # deepseek-chat/coder - excellent at code, far cheaper
        ModelProvider.OPENAI,      # GPT - solid general coder
        ModelProvider.QWEN,        # qwen-coder line is strong, cheap
        ModelProvider.GEMINI,      # free
        ModelProvider.GROQ,        # free & fast
        ModelProvider.OPENROUTER,  # free
        ModelProvider.NVIDIA,      # free
        ModelProvider.OLLAMA,      # local
    ],
    QueryType.REASONING: [
        ModelProvider.DEEPSEEK,    # deepseek-reasoner - purpose-built reasoning model
        ModelProvider.GEMINI,      # free & strong reasoning
        ModelProvider.OPENAI,
        ModelProvider.ANTHROPIC,
        ModelProvider.QWEN,
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
        ModelProvider.QWEN,        # Alibaba - notably strong on Chinese and other Asian languages
        ModelProvider.ZHIPU,       # GLM - also strong on Chinese
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
# "await " are deliberately excluded - too common in everyday language).
_CODE_MARKERS = (
    "def ", "import ", "const ", "=>", "console.log", "<div",
    ".py", ".js", ".ts", "print(", "if __name__",
)

def _kw_in(text: str, keyword: str) -> bool:
    """Substring match for phrases, word-boundary match for short tokens."""
    if len(keyword) >= 6 or " " in keyword:
        return keyword in text
    return re.search(rf"\b{re.escape(keyword)}\b", text) is not None


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


# ─────────────────────────────────────────────────────────────────────────
# Routing intelligence — Cursor Router / OpenRouter Auto Router-inspired.
#
# Three pieces, each mirroring a specific published technique:
#
#   1. estimate_complexity()  - a pure heuristic "Compass"-style pre-model
#      triage score (0..1). Cursor's Compass is a *trained* classifier on
#      structured turn features; this is the honest heuristic equivalent
#      buildable without a labeled dataset - same job (should this turn
#      skip the free tier?), cheaper to build, zero extra latency/cost per
#      classification (no embedding call, no extra LLM round trip).
#
#   2. _ProviderHealth        - OpenRouter's provider algorithm "deprioritizes
#      any provider with a significant outage in the last 30 seconds". This
#      is the same idea: a rolling per-provider success rate plus a recent-
#      failure cooldown, fed by real call outcomes (the only "did this
#      work" signal actually available - there is no thumbs-up/regenerate
#      endpoint in this codebase to build a UX-satisfaction loop from, so
#      this deliberately tracks infra reliability, not response quality).
#
#   3. RoutingMode            - OpenRouter's Auto Router exposes a single
#      cost_quality_tradeoff int (0-10, 0=cheapest). Same shape here, with
#      three named presets matching Cursor Router's Cost / Balance /
#      Intelligence modes.
#
# All three feed _score_provider() in LLMRouter, which reorders (never
# hard-excludes) the hand-authored QUERY_TYPE_ROUTES preference - that list
# still plays the role of Cursor's taxonomy step (an expert prior on which
# provider is good at which task), just no longer taken as gospel order.
# ─────────────────────────────────────────────────────────────────────────


class RoutingMode:
    """Cost/quality dial, 0 (cheapest) .. 10 (highest quality) - same shape
    as OpenRouter's ``cost_quality_tradeoff`` param. Named presets line up
    with Cursor Router's Cost / Balance / Intelligence modes."""

    COST = 2
    BALANCED = 5
    INTELLIGENCE = 8

    _PRESETS = {
        "cost": COST,
        "balanced": BALANCED,
        "balance": BALANCED,
        "intelligence": INTELLIGENCE,
    }

    @staticmethod
    def coerce(value: Any) -> int:
        """Accept an int 0-10, a preset name, or None (-> BALANCED)."""
        if value is None:
            return RoutingMode.BALANCED
        if isinstance(value, str):
            preset = RoutingMode._PRESETS.get(value.strip().lower())
            if preset is not None:
                return preset
            try:
                value = int(value)
            except ValueError:
                return RoutingMode.BALANCED
        try:
            return max(0, min(10, int(value)))
        except (TypeError, ValueError):
            return RoutingMode.BALANCED


# Query types read as harder-by-default even before any prompt text is
# scored (reasoning/code start from a higher baseline than chat/translation).
_COMPLEXITY_BASELINE: Dict[QueryType, float] = {
    QueryType.CHAT: 0.15,
    QueryType.TRANSLATION: 0.15,
    QueryType.SUMMARIZATION: 0.20,
    QueryType.STRUCTURED: 0.25,
    QueryType.CREATIVE: 0.30,
    QueryType.CODE: 0.35,
    QueryType.REASONING: 0.40,
}

# Phrases that correlate with a genuinely hard ask rather than a quick
# question - deliberately multi-word so they don't fire on incidental use.
_COMPLEXITY_MARKERS = (
    "step by step", "step-by-step", "from scratch", "architecture",
    "distributed", "concurrency", "concurrent", "race condition",
    "edge case", "edge-case", "optimize", "optimization", "trade-off",
    "tradeoff", "design a", "refactor the entire", "multiple files",
    "across the codebase", "end to end", "end-to-end", "production-grade",
    "production grade", "scalable", "in depth", "in-depth", "thorough",
    "comprehensive", "detailed analysis", "root cause",
)

_MULTISTEP_RE = re.compile(r"(?:^|\n)\s*[1-9]\.\s")
_BULLET_RE = re.compile(r"(?:^|\n)\s*[-*]\s.+\n\s*[-*]\s")


def estimate_complexity(prompt: str, query_type: "QueryType") -> float:
    """Heuristic 0..1 difficulty score for one prompt (Compass-style triage).

    Pure structural signals - prompt length, code-block density, explicit
    difficulty language, multi-step shape - combined with the query type's
    baseline. No embedding call and no extra LLM round trip: scoring a
    prompt must never cost more than the routing decision it informs.
    """
    text = prompt.lower()
    score = _COMPLEXITY_BASELINE.get(query_type, 0.25)

    words = prompt.split()
    length_signal = min(len(words) / 220.0, 1.0)  # saturates around 220 words
    score += 0.25 * length_signal

    code_blocks = text.count("```")
    score += min(code_blocks * 0.08, 0.2)

    marker_hits = sum(1 for m in _COMPLEXITY_MARKERS if m in text)
    score += min(marker_hits * 0.1, 0.3)

    if _MULTISTEP_RE.search(prompt) or _BULLET_RE.search(prompt):
        score += 0.1

    return max(0.0, min(1.0, score))


# Recent-outage cooldown - mirrors OpenRouter's "ignore providers with a
# significant outage in the last 30 seconds" provider-selection rule.
_FAILURE_COOLDOWN_SECONDS = 30.0
# Rolling window of recent outcomes used for the smoothed success rate.
_HEALTH_WINDOW = 50


class _ProviderHealth:
    """Tracks recent call outcomes per provider - process-local, reset on
    restart (acceptable: it exists to dodge a provider that is failing
    *right now*, not to be a durable reliability ledger).

    Feeds two things into routing:
      - is_degraded(): a provider that failed within the cooldown window is
        deprioritized (scored down), never hard-excluded - a provider that
        has recovered should still be reachable next call.
      - success_rate(): a Laplace-smoothed rolling success rate, so a
        provider with a longer healthy history is preferred over one with
        the same *recent* state but a worse track record.
    """

    def __init__(self):
        self._outcomes: Dict["ModelProvider", "deque[bool]"] = {}
        self._last_failure_at: Dict["ModelProvider", float] = {}

    def record(self, provider: "ModelProvider", ok: bool) -> None:
        dq = self._outcomes.setdefault(provider, deque(maxlen=_HEALTH_WINDOW))
        dq.append(ok)
        if not ok:
            self._last_failure_at[provider] = time.monotonic()

    def is_degraded(self, provider: "ModelProvider") -> bool:
        last = self._last_failure_at.get(provider)
        return last is not None and (time.monotonic() - last) < _FAILURE_COOLDOWN_SECONDS

    def success_rate(self, provider: "ModelProvider") -> float:
        dq = self._outcomes.get(provider)
        if not dq:
            return 0.7  # optimistic prior for a provider with no track record yet
        successes = sum(1 for ok in dq if ok)
        return (successes + 1) / (len(dq) + 2)  # Laplace smoothing

    def snapshot(self) -> Dict[str, Dict[str, Any]]:
        """Per-provider health for observability (admin/harness endpoint)."""
        providers = set(self._outcomes) | set(self._last_failure_at)
        return {
            p.value: {
                "success_rate": round(self.success_rate(p), 4),
                "degraded": self.is_degraded(p),
                "sample_size": len(self._outcomes.get(p, ())),
            }
            for p in providers
        }


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
            # Free tier first, then the cheapest paid OpenAI-compatible
            # providers (DeepSeek/Qwen/Zhipu/Moonshot/Mistral/HuggingFace
            # are all far cheaper per-token than OpenAI/Anthropic), then
            # the rest of OpenAI-compatible vendors, then the strongest
            # paid SDKs, then generic custom, then local.
            ModelProvider.OPENROUTER,
            ModelProvider.GEMINI,
            ModelProvider.GROQ,
            ModelProvider.NVIDIA,
            ModelProvider.DEEPSEEK,
            ModelProvider.QWEN,
            ModelProvider.ZHIPU,
            ModelProvider.MOONSHOT,
            ModelProvider.MISTRAL,
            ModelProvider.TOGETHER,
            ModelProvider.FIREWORKS,
            ModelProvider.PERPLEXITY,
            ModelProvider.HUGGINGFACE,
            ModelProvider.OPENAI,
            ModelProvider.AZURE,
            ModelProvider.ANTHROPIC,
            ModelProvider.CUSTOM_OPENAI,
            ModelProvider.OLLAMA,
        ]

        # Timeout configuration from environment variables
        self.openai_timeout = float(os.getenv("LLM_TIMEOUT_OPENROUTER", "30.0"))
        self.anthropic_timeout = float(os.getenv("LLM_TIMEOUT_ANTHROPIC", "30.0"))
        self.openai_stream_timeout = float(os.getenv("LLM_TIMEOUT_OPENROUTER_STREAM", "60.0"))
        self.anthropic_stream_timeout = float(os.getenv("LLM_TIMEOUT_ANTHROPIC_STREAM", "60.0"))

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
                "model": "openai/gpt-oss-20b",
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
            ModelProvider.DEEPSEEK: {
                "api_key": os.getenv("DEEPSEEK_API_KEY"),
                "model": "deepseek-chat",
                "base_url": "https://api.deepseek.com/v1",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.QWEN: {
                # Alibaba DashScope's OpenAI-compatible endpoint.
                "api_key": os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY"),
                "model": os.getenv("QWEN_MODEL", "qwen-plus"),
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.ZHIPU: {
                "api_key": os.getenv("ZHIPU_API_KEY"),
                "model": os.getenv("ZHIPU_MODEL", "glm-4-plus"),
                "base_url": "https://open.bigmodel.cn/api/paas/v4",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.MOONSHOT: {
                "api_key": os.getenv("MOONSHOT_API_KEY"),
                "model": os.getenv("MOONSHOT_MODEL", "moonshot-v1-8k"),
                "base_url": "https://api.moonshot.cn/v1",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.MISTRAL: {
                "api_key": os.getenv("MISTRAL_API_KEY"),
                "model": "mistral-large-latest",
                "base_url": "https://api.mistral.ai/v1",
                "type": "openai_sdk",
                "free": False,
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
            ModelProvider.HUGGINGFACE: {
                "api_key": os.getenv("HUGGINGFACE_API_KEY"),
                "model": "Qwen/Qwen2.5-72B-Instruct",
                "base_url": "https://router.huggingface.co/v1",
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.TOGETHER: {
                "api_key": os.getenv("TOGETHER_API_KEY"),
                "model": os.getenv("TOGETHER_MODEL", "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"),
                "base_url": os.getenv("TOGETHER_BASE_URL", "https://api.together.xyz/v1"),
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.FIREWORKS: {
                "api_key": os.getenv("FIREWORKS_API_KEY"),
                "model": os.getenv("FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p1-70b-instruct"),
                "base_url": os.getenv("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1"),
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.PERPLEXITY: {
                "api_key": os.getenv("PERPLEXITY_API_KEY"),
                "model": os.getenv("PERPLEXITY_MODEL", "sonar-pro"),
                "base_url": os.getenv("PERPLEXITY_BASE_URL", "https://api.perplexity.ai"),
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.AZURE: {
                "api_key": os.getenv("AZURE_OPENAI_API_KEY"),
                "model": os.getenv("AZURE_OPENAI_MODEL", "gpt-4o-mini"),
                "base_url": os.getenv("AZURE_OPENAI_ENDPOINT", ""),
                "type": "openai_sdk",
                "free": False,
            },
            ModelProvider.CUSTOM_OPENAI: {
                "api_key": os.getenv("CUSTOM_OPENAI_API_KEY"),
                "model": os.getenv("CUSTOM_OPENAI_MODEL", "gpt-3.5-turbo"),
                "base_url": os.getenv("CUSTOM_OPENAI_BASE_URL", ""),
                "type": "openai_sdk",
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

        # Platform provider keys configured via the Admin Dashboard (stored
        # encrypted in the DB, pushed in at startup / on change). They sit
        # between per-team BYOK keys (which win) and the env vars above.
        self.platform_keys: Dict[str, str] = {}

        # Live per-provider reliability (recent-outage cooldown + rolling
        # success rate) - see _ProviderHealth. Process-local, shared across
        # requests on this instance.
        self.health = _ProviderHealth()

        # Multi-key load balancing (team BYOK key pools): a per-provider
        # round-robin cursor plus the index AND stable key_id used by the most
        # recent selection (for route attribution - best-effort observability,
        # not a hard concurrency guarantee). key_id names the exact key slot
        # that served, stable across pool edits.
        self._key_round_robin: Dict[str, int] = {}
        self._last_key_index: Dict[str, int] = {}
        self._last_key_id: Dict[str, str] = {}

        self.current_provider = None
        # Attribution for the most recent completed call: which provider/model
        # served it and whether it was free - used for cost-savings tracking.
        self.last_route: Optional[Dict[str, Any]] = None
        # True when the most recent call was served from the Redis response
        # cache (zero tokens, zero cost) instead of a provider.
        self.last_cache_hit = False
        # Cosine similarity of the semantic-tier hit (None for exact hits /
        # provider calls) - lets the gateway report which tier served.
        self.last_similarity: Optional[float] = None

        # Cache and graceful degradation behavior:
        # - Exact matches are served from Redis cache (zero latency, zero cost)
        # - Semantic cache serves near-duplicate questions (same meaning, different wording)
        # - Provider fallback chain ensures high availability (free → paid → local)
        # - If all providers fail, a clear error is raised
        # - Streaming responses have separate timeout configuration

        self._initialize_providers()

    def _initialize_providers(self):
        """Check which providers are available and set primary.

        A provider is available if:
        - It has an ``api_key`` configured (all cloud providers), OR
        - It has ``OLLAMA_BASE_URL`` set or a default local Ollama at
          ``http://localhost:11434/v1`` (checked at call time by sniffing
          the endpoint - we always include Ollama in the chain; if the
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
                "MISTRAL_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, "
                "HUGGINGFACE_API_KEY, or set OLLAMA_BASE_URL for local models."
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

    def set_platform_keys(self, keys: Optional[Dict[str, str]] = None) -> None:
        """Apply platform-level keys configured via the Admin Dashboard."""
        self.platform_keys = dict(keys or {})

    def _effective_api_key(
        self,
        provider: ModelProvider,
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
    ) -> str:
        """API key to use for a provider.

        Precedence: team BYOK key pool (request-scoped ``key_pools`` — rotated
        round-robin so several keys for the same provider spread traffic and
        dodge per-key rate limits) > single team BYOK key (``provider_keys``) >
        platform key (Admin Dashboard) > env var. The selected pool index is
        stashed on ``self._last_key_index`` for route attribution; when
        ``key_pool_ids`` (aligned index-for-index with ``key_pools``) is given,
        the stable ``key_id`` is stashed on ``self._last_key_id`` too, so the
        route record names the exact key that served rather than just its
        position.
        """
        if key_pools:
            pool = key_pools.get(provider.value)
            if pool:
                idx = self._key_round_robin.get(provider.value, 0) % len(pool)
                self._key_round_robin[provider.value] = idx + 1
                self._last_key_index[provider.value] = idx
                ids = (key_pool_ids or {}).get(provider.value) if key_pool_ids else None
                if ids and idx < len(ids):
                    self._last_key_id[provider.value] = ids[idx]
                else:
                    self._last_key_id.pop(provider.value, None)
                return pool[idx]
        if provider_keys:
            team_key = provider_keys.get(provider.value)
            if team_key:
                return team_key
        if self.platform_keys:
            platform_key = self.platform_keys.get(provider.value)
            if platform_key:
                return platform_key
        return self.providers[provider]["api_key"]

    def _is_available(
        self, provider: ModelProvider, provider_keys: Optional[Dict[str, str]] = None
    ) -> bool:
        """Provider availability with per-request team overrides applied."""
        if not self._effective_api_key(provider, provider_keys):
            return False
        # Azure and generic custom endpoints require a base URL / endpoint.
        # A team BYOK key alone is enough — the team may be using a private
        # endpoint not reflected in the platform env var.
        if provider in (ModelProvider.AZURE, ModelProvider.CUSTOM_OPENAI):
            if provider_keys and provider_keys.get(provider.value):
                return True
            if self.platform_keys.get(provider.value):
                return True
            return bool((self.providers[provider].get("base_url") or "").strip())
        return True

    def classify(self, prompt: str) -> QueryType:
        """Classify a prompt into a query type (heuristic, no extra LLM call)."""
        return classify_query(prompt)

    def _score_provider(
        self, provider: ModelProvider, rank: int, complexity: float, routing_mode: int,
    ) -> float:
        """Score one provider for this call - higher wins.

        Combines three signals into one number:
          - ``rank``: position in the hand-authored QUERY_TYPE_ROUTES list,
            an expert prior on task fit (plays the role of Cursor's
            taxonomy step). Decays gently, not a hard ordering.
          - live health: a recently-failing provider is deprioritized
            (never excluded - see _ProviderHealth), a provider with a
            better rolling success rate is preferred.
          - price vs. willingness-to-pay: ``want_quality`` is dominated by
            routing_mode (the caller's explicit Cost/Balanced/Intelligence
            choice - a stated preference should outweigh a heuristic
            guess) with prompt complexity as a smaller per-call modulator
            on top of it. This is the "confidence-gated escalation" - the
            router only pays for a stronger model when the caller's
            preference and the prompt's difficulty both point that way;
            an easy prompt on COST mode still heavily penalizes paid
            providers, a hard prompt on INTELLIGENCE barely does.
        """
        cfg = self.providers[provider]
        score = 10.0 - rank * 0.5

        if provider == ModelProvider.OLLAMA:
            # "Free" here means "no API cost", not "as good as a configured
            # cloud provider" - Ollama is the documented last-resort local
            # fallback (fallback_chain: "...then local/Ollama last"). Without
            # this it would win the free-tier's zero-penalty treatment and
            # leapfrog a team's own configured paid provider whenever no
            # other free cloud provider is available. Demoted, never excluded.
            score -= 3.0

        if self.health.is_degraded(provider):
            score -= 6.0
        score += self.health.success_rate(provider) * 2.0

        if not cfg["free"]:
            # routing_mode dominates (a stated preference beats a heuristic
            # guess); complexity is a smaller modulator on top of it.
            #
            # A plain average of mode and complexity would make BALANCED
            # (the default when nothing is specified) split the difference
            # between "prefer free" and "respect the expert pick" - but
            # BALANCED should mean "trust the QUERY_TYPE_ROUTES ordering",
            # the same way Cursor's Balance mode still "matches frontier
            # model quality". A logistic curve on mode does that: it stays
            # low through COST, rises sharply between COST and BALANCED,
            # and is already near its ceiling by BALANCED - so only COST
            # meaningfully pulls toward the free tier, while BALANCED and
            # INTELLIGENCE both largely defer to the rank prior.
            mode_bias = 1.0 / (1.0 + math.exp(-1.2 * (routing_mode - 3)))
            want_quality = mode_bias * 0.85 + complexity * 0.15
            price = get_price(cfg["model"])
            price_signal = min((price["input"] + price["output"]) / 20.0, 1.0)
            reluctance = 1.0 - want_quality  # 0..1, how much this call resists paying
            score -= reluctance * (3.0 + 2.0 * price_signal)

        return score

    def resolve_route(
        self,
        query_type,
        provider_keys: Optional[Dict[str, str]] = None,
        prompt: Optional[str] = None,
        routing_mode: Any = None,
    ) -> List[ModelProvider]:
        """Ordered provider chain for a query type.

        Type-specific preferences (QUERY_TYPE_ROUTES) seed the chain and
        every remaining configured provider is appended afterwards, so a
        query type can never exhaust the router's fallback resilience.
        ``provider_keys`` (optional request-scoped BYOK map) makes a
        provider available even when no platform env key is set.

        When ``prompt`` is given, the seeded chain is then re-scored by
        :meth:`_score_provider` using a Compass-style complexity estimate
        of that prompt, live provider health, and ``routing_mode`` (an int
        0-10 or a RoutingMode preset name) - see the module docstring above
        LLMRouter for how this mirrors Cursor Router / OpenRouter Auto
        Router. Without a prompt, the query type's baseline complexity is
        used instead so routing_mode/health still apply.
        """
        qtype = self._coerce_query_type(query_type) or QueryType.CHAT
        preferred = [
            p for p in QUERY_TYPE_ROUTES.get(qtype, [])
            if self._is_available(p, provider_keys)
        ]
        seen = set(preferred)
        rest = [
            p for p in self.fallback_chain
            if p not in seen and self._is_available(p, provider_keys)
        ]
        chain = preferred + rest

        complexity = (
            estimate_complexity(prompt, qtype) if prompt
            else _COMPLEXITY_BASELINE.get(qtype, 0.25)
        )
        mode = RoutingMode.coerce(routing_mode)
        scored = sorted(
            enumerate(chain),
            key=lambda pair: self._score_provider(pair[1], pair[0], complexity, mode),
            reverse=True,
        )
        return [p for _, p in scored]

    def list_models(self) -> Dict[str, Any]:
        """OpenRouter-style model catalog for this router."""
        return {
            "router": "onramp-query-router",
            "routing_modes": {
                "cost": RoutingMode.COST,
                "balanced": RoutingMode.BALANCED,
                "intelligence": RoutingMode.INTELLIGENCE,
            },
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

    def router_health(self) -> Dict[str, Any]:
        """Live per-provider reliability snapshot (circuit-breaker state and
        rolling success rate) - for an admin/observability panel, not used
        in the routing hot path itself."""
        return {
            "cooldown_seconds": _FAILURE_COOLDOWN_SECONDS,
            "window_size": _HEALTH_WINDOW,
            "providers": self.health.snapshot(),
        }

    # ── OpenAI-compatible routing (OpenRouter-style) ───────────────────────

    def _chain_starting_with(
        self, provider: ModelProvider, provider_keys: Optional[Dict[str, str]] = None
    ) -> List[ModelProvider]:
        """Ordered chain with ``provider`` first, then the configured fallbacks."""
        if not self._is_available(provider, provider_keys):
            return self.resolve_route(QueryType.CHAT, provider_keys=provider_keys)
        return [provider] + [
            p for p in self.fallback_chain
            if p != provider and self._is_available(p, provider_keys)
        ]

    def _is_openrouter_passthrough_model(
        self, model: Optional[str], provider_keys: Optional[Dict[str, str]] = None
    ) -> bool:
        """True when ``model`` names a specific model from OpenRouter's full
        catalog (400+ models across every vendor) rather than one of this
        router's nine hand-picked defaults.

        OpenRouter's own API accepts any of its ``vendor/model`` ids
        directly - it does its own internal validation/routing for those.
        This router doesn't need to enumerate that catalog to support it:
        anything shaped like "vendor/model" that isn't already a known
        query type, provider name, or one of our pinned model ids is
        passed straight through to OpenRouter as-is, as long as an
        OpenRouter key (platform or team BYOK) is configured.
        """
        if not model or "/" not in model:
            return False
        m = model.strip().lower()
        if any(m == provider.value for provider in ModelProvider):
            return False
        if any(cfg["model"] and m == cfg["model"].lower() for cfg in self.providers.values()):
            return False
        try:
            QueryType(m)
            return False
        except ValueError:
            pass
        return self._is_available(ModelProvider.OPENROUTER, provider_keys)

    def provider_chain(
        self,
        model: Optional[str] = None,
        query_type: Optional[QueryType] = None,
        prompt: Optional[str] = None,
        provider_keys: Optional[Dict[str, str]] = None,
        routing_mode: Any = None,
    ) -> List[ModelProvider]:
        """Resolve an OpenAI-style ``model`` string to an ordered provider chain.

        Accepted, in order of precedence:
          - an explicit ``query_type`` (a :class:`QueryType` or its value),
          - a query-type name ("code", "reasoning", "chat", ...),
          - a provider name ("openrouter", "gemini", "groq", ...),
          - a known model id ("gpt-4o-mini", "llama-3.3-70b-versatile", ...),
          - any other "vendor/model" id, routed straight through OpenRouter
            (its full catalog - Llama, DeepSeek, Grok, Qwen, GPT, Claude,
            Gemini, hundreds more - not just our nine pinned defaults),
          - auto-classification of ``prompt`` if provided,
          - otherwise the default CHAT chain.

        ``provider_keys`` (optional request-scoped BYOK map) makes a provider
        routable when no platform env key is set - including for the
        OpenRouter passthrough case above, so a team's own OpenRouter key
        unlocks their whole catalog through this router.``routing_mode``
        (int 0-10 or a RoutingMode preset name) biases how readily the
        resolved chain reaches for a paid provider - see resolve_route /
        _score_provider. An explicit ``model`` naming one specific
        provider/model is always tried first regardless of routing_mode
        (an explicit pick is a stronger signal than the auto-router's
        preference).
        """
        qtype = self._coerce_query_type(query_type)
        if qtype is not None:
            return self.resolve_route(
                qtype, provider_keys=provider_keys, prompt=prompt, routing_mode=routing_mode
            )
        if model:
            m = model.strip().lower()
            try:
                return self.resolve_route(
                    QueryType(m), provider_keys=provider_keys, prompt=prompt, routing_mode=routing_mode
                )
            except ValueError:
                pass
            for provider in ModelProvider:
                if m == provider.value:
                    return self._chain_starting_with(provider, provider_keys=provider_keys)
            for provider, cfg in self.providers.items():
                if cfg["model"] and m == cfg["model"].lower():
                    return self._chain_starting_with(provider, provider_keys=provider_keys)
            if self._is_openrouter_passthrough_model(model, provider_keys):
                return [ModelProvider.OPENROUTER]
        if prompt:
            return self.resolve_route(
                self.classify(prompt), provider_keys=provider_keys, prompt=prompt, routing_mode=routing_mode
            )
        return self.resolve_route(QueryType.CHAT, provider_keys=provider_keys, routing_mode=routing_mode)

    def route_info(
        self,
        provider: ModelProvider,
        query_type: Optional[QueryType] = None,
        complexity: Optional[float] = None,
        routing_mode: Optional[int] = None,
        model_override: Optional[str] = None,
        key_index: Optional[int] = None,
        key_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Attribution dict for a served call (provider, model, free, price).

        Includes the per-1M-token input/output price (USD) from
        :mod:`app.services.llm_costs` so the persisted route record is
        self-contained - cost numbers stay accurate even if the pricing
        table changes after the request. ``complexity``/``routing_mode``
        (when the caller computed them) record what the router's scoring
        actually saw, for observability into *why* this provider was
        chosen - not just which one was. ``model_override`` (an OpenRouter
        passthrough model - see _is_openrouter_passthrough_model) means the
        actual served model isn't this provider's pinned default, so
        price/free are derived from the override id instead: OpenRouter
        marks its own free models with a ":free" suffix, and get_price()
        falls back to a conservative default for anything not in the local
        pricing table - cost tracking never silently claims $0 for an
        arbitrary paid model just because OpenRouter itself is configured
        as a "free" provider in this router.

        ``key_index``/``key_id`` (both set only when a team key pool served
        this call) identify *which* key handled it: the positional index into
        the pool at selection time, and the pool key's stable ``key_id`` (see
        app.services.team_provider_keys.get_team_key_pool_ids) — ``key_id`` is
        the durable identifier; ``key_index`` survives as a debugging aid.
        """
        cfg = self.providers[provider]
        model_id = model_override or cfg["model"]
        price = get_price(model_id)
        is_free = model_id.endswith(":free") if model_override else bool(cfg.get("free"))
        route = {
            "provider": provider.value,
            "model": model_id,
            "served": f"{provider.value}/{model_id}",
            "free": is_free,
            "query_type": query_type.value if query_type is not None else None,
            "price_in": price["input"],
            "price_out": price["output"],
        }
        if complexity is not None:
            route["complexity"] = round(complexity, 4)
        if routing_mode is not None:
            route["routing_mode"] = routing_mode
        if key_index is not None:
            route["key_index"] = key_index
        if key_id is not None:
            route["key_id"] = key_id
        return route

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

    def served_model(self, provider: ModelProvider, model_override: Optional[str] = None) -> str:
        """Human-readable model id actually served (OpenRouter-style)."""
        return f"{provider.value}/{model_override or self.providers[provider]['model']}"

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
        they are recorded with zero price - the cost-savings reports then
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
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        routing_mode: Any = None,
    ) -> tuple[str, str, Dict[str, Any]]:
        """OpenAI-compatible completion with caching and graceful degradation.

        Features:
        - Two-tier caching: exact-match (Redis) and near-duplicate (semantic)
        - Provider fallback chain for high availability
        - Configurable timeouts to prevent hanging requests
        - Graceful degradation to local/Ollama providers when cloud services unavailable

        ``cache_scope`` isolates the response cache per tenant (org/uid) so
        one customer's cached answers are never served to another.
        ``routing_mode`` (int 0-10 or a RoutingMode preset) biases the
        cost/quality trade-off for this call - see resolve_route. A
        ``model`` naming a specific OpenRouter-catalog model (not one of
        this router's nine pinned defaults) is passed straight through to
        OpenRouter as that exact model - see provider_chain /
        _is_openrouter_passthrough_model.
        """
        qtype = self._effective_query_type(model, query_type, prompt)
        passthrough_model = (
            model if self._is_openrouter_passthrough_model(model, provider_keys) else None
        )
        # A passthrough call must key the cache by the exact model
        # requested - otherwise two different explicit models with the
        # same prompt would incorrectly share one cached answer.
        cache_key_type = passthrough_model or _qtype_value(qtype)
        cached = await llm_cache_get(cache_key_type, prompt, system, max_tokens, scope=cache_scope)
        if cached is not None:
            route = self._cache_route(qtype)
            self.last_route = route
            self.last_cache_hit = True
            self.last_similarity = None
            _record_cache("hit", tier="redis")
            logger.debug("LLM cache hit (%s): %s...", qtype.value if qtype else "auto", cached[:60])
            return cached, "cache/redis", route
        # Semantic tier: near-duplicate questions (same content words, high
        # lexical overlap) are served from the cache without a provider
        # call. Safe by construction - get_semantic only serves an answer
        # when the new question introduces no new content words.
        semantic = await llm_cache_get_semantic(
            cache_key_type, prompt, system, max_tokens, scope=cache_scope
        )
        if semantic is not None:
            text, similarity = semantic
            route = self._cache_route(qtype, semantic=True, similarity=similarity)
            self.last_route = route
            self.last_cache_hit = True
            self.last_similarity = similarity
            _record_cache("hit", tier="semantic")
            logger.debug(
                "LLM semantic cache hit (%s, sim=%.3f): %s...",
                qtype.value if qtype else "auto", similarity, text[:60],
            )
            return text, "cache/semantic", route
        chain = self.provider_chain(
            model=model, query_type=query_type, prompt=prompt, provider_keys=provider_keys,
            routing_mode=routing_mode,
        )
        complete_kwargs: Dict[str, Any] = {"model_override": passthrough_model}
        if key_pools:
            complete_kwargs["key_pools"] = key_pools
        if key_pool_ids:
            complete_kwargs["key_pool_ids"] = key_pool_ids
        response, provider = await self._complete(
            chain, prompt, system, max_tokens, provider_keys, **complete_kwargs
        )
        complexity = estimate_complexity(prompt, qtype) if qtype else None
        route = self.route_info(
            provider, query_type=qtype, complexity=complexity, routing_mode=RoutingMode.coerce(routing_mode),
            model_override=passthrough_model,
            key_index=self._last_key_index.get(provider.value) if key_pools else None,
            key_id=self._last_key_id.get(provider.value) if key_pools else None,
        )
        self.last_route = route
        self.last_cache_hit = False
        self.last_similarity = None
        _record_cache("miss")
        _record_llm_call(provider.value, route["free"])
        await llm_cache_set(cache_key_type, prompt, system, max_tokens, response, scope=cache_scope)
        await llm_cache_set_semantic(cache_key_type, prompt, system, max_tokens, response, scope=cache_scope)
        return response, self.served_model(provider, passthrough_model), route

    async def openai_chat_stream(
        self,
        prompt: str,
        system: str = None,
        max_tokens: int = 2000,
        model: Optional[str] = None,
        query_type: Optional[QueryType] = None,
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        routing_mode: Any = None,
    ):
        """OpenAI-compatible streaming completion. Yields
        ``(token, served_model_id, route)``. A ``model`` naming a specific
        OpenRouter-catalog model is passed through as-is - see openai_chat.
        When ``key_pools`` is given the router rotates round-robin across the
        team's keys for the served provider (multi-key load balancing), and
        ``key_pool_ids`` (aligned with it) lets the route record name the
        exact key that served.
        """
        chain = self.provider_chain(
            model=model, query_type=query_type, prompt=prompt, provider_keys=provider_keys,
            routing_mode=routing_mode,
        )
        passthrough_model = (
            model if self._is_openrouter_passthrough_model(model, provider_keys) else None
        )
        route_qtype = self._effective_query_type(model, query_type, prompt)
        complexity = estimate_complexity(prompt, route_qtype) if route_qtype else None
        mode = RoutingMode.coerce(routing_mode)
        served_provider = None
        stream_kwargs: Dict[str, Any] = {"model_override": passthrough_model}
        if key_pools:
            stream_kwargs["key_pools"] = key_pools
        if key_pool_ids:
            stream_kwargs["key_pool_ids"] = key_pool_ids
        # Capture the round-robin key index AND stable key_id once per
        # provider, at that provider's first token — the shared
        # _last_key_index/_last_key_id can be rotated by a concurrent request
        # mid-stream, which would otherwise make the per-token attribution
        # flap. served_provider tracks the LAST provider so the final route
        # matches the final per-token attribution.
        key_index_seen: Dict[str, int] = {}
        key_id_seen: Dict[str, str] = {}
        async for token, provider in self._stream_complete(
            chain, prompt, system, max_tokens, provider_keys, **stream_kwargs
        ):
            served_provider = provider
            key_index = None
            key_id = None
            if key_pools:
                key_index = key_index_seen.setdefault(
                    provider.value, self._last_key_index.get(provider.value)
                )
                key_id = key_id_seen.setdefault(
                    provider.value, self._last_key_id.get(provider.value)
                )
            yield token, self.served_model(provider, passthrough_model), self.route_info(
                provider, query_type=route_qtype, complexity=complexity, routing_mode=mode,
                model_override=passthrough_model, key_index=key_index, key_id=key_id,
            )
        if served_provider is not None:
            self.last_route = self.route_info(
                served_provider, query_type=route_qtype, complexity=complexity, routing_mode=mode,
                model_override=passthrough_model,
                key_index=key_index_seen.get(served_provider.value) if key_pools else None,
                key_id=key_id_seen.get(served_provider.value) if key_pools else None,
            )

    # ── Chat ───────────────────────────────────────────────────────────────

    async def chat(
        self,
        prompt: str,
        system: str = None,
        max_tokens: int = 2000,
        query_type: Optional[QueryType] = None,
        cache_scope: str = "global",
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        routing_mode: Any = None,
        model: Optional[str] = None,
    ) -> str:
        """Call LLM with automatic fallback, caching, and graceful degradation.

        Features:
        - Two-tier caching: exact-match (Redis) and near-duplicate (semantic)
        - Provider fallback chain ensures service availability
        - Configurable timeouts prevent hanging requests
        - Automatic fallback from free → paid → local providers
        - Graceful degradation preserves functionality during provider issues

        ``query_type`` may be a :class:`QueryType` or its string value; when
        omitted the prompt is classified automatically. ``cache_scope``
        isolates the response cache per tenant (org/uid) - pass the caller's
        org name for user-facing prompts so cached answers never cross
        tenants. Repeats are served from the exact-match Redis cache, and
        near-duplicates from the semantic tier (see
        :mod:`app.services.llm_cache`) - both record a free ``cache/*``
        route with zero price. ``routing_mode`` (int 0-10 or a RoutingMode
        preset) biases the cost/quality trade-off - see resolve_route.

        ``model`` (optional) names an explicit model and wins over
        ``query_type`` — the same strings :meth:`provider_chain` accepts
        (query-type name, provider name, pinned model id, or any
        OpenRouter-catalog "vendor/model" id). An OpenRouter-catalog model
        keys the cache by that exact id so two different explicit models
        never share one cached answer.
        """
        qtype = self._effective_query_type(model, query_type, prompt)
        # An explicit OpenRouter-catalog model must key the cache by that exact
        # model — two different explicit models with the same prompt would
        # otherwise share one cached answer (same policy as openai_chat).
        passthrough_model = (
            model if self._is_openrouter_passthrough_model(model, provider_keys) else None
        )
        cache_key_type = passthrough_model or _qtype_value(qtype)
        cached = await llm_cache_get(cache_key_type, prompt, system, max_tokens, scope=cache_scope)
        if cached is not None:
            self.last_route = self._cache_route(qtype)
            self.last_cache_hit = True
            self.last_similarity = None
            _record_cache("hit", tier="redis")
            return cached
        # Semantic tier (see openai_chat for the rationale).
        semantic = await llm_cache_get_semantic(
            cache_key_type, prompt, system, max_tokens, scope=cache_scope
        )
        if semantic is not None:
            text, similarity = semantic
            route = self._cache_route(qtype, semantic=True, similarity=similarity)
            self.last_route = route
            self.last_cache_hit = True
            self.last_similarity = similarity
            _record_cache("hit", tier="semantic")
            logger.debug(
                "LLM semantic cache hit (%s, sim=%.3f): %s...",
                qtype.value if qtype else "auto", similarity, text[:60],
            )
            return text
        complete_kwargs: Dict[str, Any] = {}
        if key_pools:
            complete_kwargs["key_pools"] = key_pools
        if key_pool_ids:
            complete_kwargs["key_pool_ids"] = key_pool_ids
        if passthrough_model:
            complete_kwargs["model_override"] = passthrough_model
        # An explicit ``model`` is a stronger signal than the caller's declared
        # query_type — pass query_type only when no model was picked.
        chain = self.provider_chain(
            model=model,
            query_type=None if model else query_type,
            prompt=prompt,
            provider_keys=provider_keys,
            routing_mode=routing_mode,
        )
        response, provider = await self._complete(
            chain, prompt, system, max_tokens, provider_keys, **complete_kwargs,
        )
        # Single assignment (no set-then-patch) so concurrent requests can't
        # clobber the attribution mid-update.
        self.last_route = self.route_info(
            provider, query_type=qtype,
            complexity=estimate_complexity(prompt, qtype),
            routing_mode=RoutingMode.coerce(routing_mode),
            key_index=self._last_key_index.get(provider.value) if key_pools else None,
            key_id=self._last_key_id.get(provider.value) if key_pools else None,
            model_override=passthrough_model,
        )
        self.last_cache_hit = False
        self.last_similarity = None
        _record_cache("miss")
        _record_llm_call(provider.value, self.last_route["free"])
        await llm_cache_set(cache_key_type, prompt, system, max_tokens, response, scope=cache_scope)
        await llm_cache_set_semantic(cache_key_type, prompt, system, max_tokens, response, scope=cache_scope)
        return response

    async def _complete(
        self,
        chain: List[ModelProvider],
        prompt: str,
        system: str,
        max_tokens: int,
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        model_override: Optional[str] = None,
    ) -> tuple[str, ModelProvider]:
        """Run a completion over an explicit provider chain with fallback.

        ``model_override`` (set for an OpenRouter passthrough call - see
        _is_openrouter_passthrough_model) calls that exact model id instead
        of the provider's pinned default. ``key_pools`` enables multi-key
        round-robin across a team's keys for each provider; ``key_pool_ids``
        (aligned index-for-index) names each key for route attribution (see
        _effective_api_key).
        """
        errors = []
        for provider in chain:
            if not self._is_available(provider, provider_keys):
                continue

            try:
                # Pass optional kwargs only when set so existing call stubs
                # (monkeypatched _call_provider in tests) keep working.
                call_kwargs: Dict[str, Any] = {}
                if provider_keys:
                    call_kwargs["provider_keys"] = provider_keys
                if key_pools:
                    call_kwargs["key_pools"] = key_pools
                if key_pool_ids:
                    call_kwargs["key_pool_ids"] = key_pool_ids
                if model_override:
                    call_kwargs["model_override"] = model_override
                response = await self._call_provider(
                    provider, prompt, system, max_tokens, **call_kwargs
                )
                self.health.record(provider, True)
                if self.current_provider != provider:
                    logger.info(f"Switched to provider: {provider.value}")
                    self.current_provider = provider
                return response, provider
            except Exception as e:
                self.health.record(provider, False)
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
        # Strip <think>...</think> blocks emitted by reasoning models (e.g. Qwen)
        import re as _re
        response = _re.sub(r"<think>.*?</think>", "", response, flags=_re.DOTALL).strip()
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
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        model_override: Optional[str] = None,
    ) -> str:
        """Dispatch to the right SDK for this provider type."""
        config = dict(self.providers[provider])
        config["api_key"] = self._effective_api_key(provider, provider_keys, key_pools, key_pool_ids)
        if model_override:
            config["model"] = model_override
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
        """OpenAI Python SDK - covers OpenAI, OpenRouter, Groq, NVIDIA (OpenAI-compatible)."""
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
            timeout=self.openai_timeout,
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

        client = AsyncAnthropic(api_key=config["api_key"], timeout=self.anthropic_timeout)

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
        routing_mode: Any = None,
        model: Optional[str] = None,
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        cache_scope: Optional[str] = None,
    ):
        """Stream a response token-by-token with provider fallback.

        Fallback only applies *before* the first token of a provider is emitted;
        once a provider starts streaming we commit to it (can't cleanly resume
        a half-emitted answer on another provider).

        ``model`` (optional) names an explicit model and wins over
        ``query_type`` — the same strings :meth:`provider_chain` accepts
        (query-type name, provider name, pinned model id, or any
        OpenRouter-catalog "vendor/model" id).

        ``provider_keys`` / ``key_pools`` / ``key_pool_ids`` are request-scoped
        team BYOK overrides (see :meth:`openai_chat_stream`) — multi-key pools
        rotate round-robin and the route record names the exact key that
        served. ``cache_scope`` is accepted for interface parity with
        :meth:`chat` / the agent wrapper; streaming responses are not cached,
        so it is intentionally unused here.
        """
        qtype = self._effective_query_type(model, query_type, prompt)
        served_provider = None
        passthrough_model = (
            model if self._is_openrouter_passthrough_model(model, provider_keys) else None
        )
        chain = self.provider_chain(
            model=model,
            query_type=None if model else query_type,
            prompt=prompt,
            provider_keys=provider_keys,
            routing_mode=routing_mode,
        )
        stream_kwargs: Dict[str, Any] = {}
        if provider_keys:
            stream_kwargs["provider_keys"] = provider_keys
        if key_pools:
            stream_kwargs["key_pools"] = key_pools
        if key_pool_ids:
            stream_kwargs["key_pool_ids"] = key_pool_ids
        if passthrough_model:
            stream_kwargs["model_override"] = passthrough_model
        # Capture the round-robin key index AND stable key_id once per
        # provider, at that provider's first token — the shared
        # _last_key_index/_last_key_id can be rotated by a concurrent request
        # mid-stream, which would otherwise make the final attribution flap.
        key_index_seen: Dict[str, int] = {}
        key_id_seen: Dict[str, str] = {}
        async for token, provider in self._stream_complete(
            chain, prompt, system, max_tokens, **stream_kwargs
        ):
            if served_provider is None:
                served_provider = provider
            if key_pools:
                key_index_seen.setdefault(
                    provider.value, self._last_key_index.get(provider.value)
                )
                key_id_seen.setdefault(
                    provider.value, self._last_key_id.get(provider.value)
                )
            yield token
        if served_provider is not None:
            self.last_route = self.route_info(
                served_provider, query_type=qtype,
                complexity=estimate_complexity(prompt, qtype),
                routing_mode=RoutingMode.coerce(routing_mode),
                model_override=passthrough_model,
                key_index=key_index_seen.get(served_provider.value) if key_pools else None,
                key_id=key_id_seen.get(served_provider.value) if key_pools else None,
            )

    async def _stream_complete(
        self,
        chain: List[ModelProvider],
        prompt: str,
        system: str,
        max_tokens: int,
        provider_keys: Optional[Dict[str, str]] = None,
        key_pools: Optional[Dict[str, List[str]]] = None,
        key_pool_ids: Optional[Dict[str, List[str]]] = None,
        model_override: Optional[str] = None,
    ):
        """Shared streaming generator over an explicit provider chain.

        Failover semantics: a provider that fails *before* its first token is
        skipped and the next provider is tried (the existing behavior). A
        failure *after* tokens started streaming raises by default — the
        documented mid-stream limitation. When ``LLM_STREAM_CONTINUE`` is set
        (1/true/yes) and a later provider exists, the partial output is instead
        replayed to the next provider as a "continue from here" prompt so the
        client keeps receiving tokens without an error. The provider switch is
        visible to the caller because each yielded token carries its provider.
        """
        errors = []
        continue_enabled = os.getenv("LLM_STREAM_CONTINUE", "").strip().lower() in (
            "1", "true", "yes",
        )
        continue_from = None
        for index, provider in enumerate(chain):
            if not self._is_available(provider, provider_keys):
                continue
            has_next = any(
                self._is_available(p, provider_keys) for p in chain[index + 1:]
            )
            yielded = False
            partial: List[str] = []
            try:
                stream_kwargs: Dict[str, Any] = {}
                if provider_keys:
                    stream_kwargs["provider_keys"] = provider_keys
                if key_pools:
                    stream_kwargs["key_pools"] = key_pools
                if key_pool_ids:
                    stream_kwargs["key_pool_ids"] = key_pool_ids
                if model_override:
                    stream_kwargs["model_override"] = model_override
                if continue_from:
                    stream_kwargs["continue_from"] = continue_from
                async for token in self._stream_provider(
                    provider, prompt, system, max_tokens, **stream_kwargs
                ):
                    yielded = True
                    partial.append(token)
                    yield token, provider
                self.health.record(provider, True)
                if self.current_provider != provider:
                    logger.info(f"Switched to provider (stream): {provider.value}")
                    self.current_provider = provider
                return
            except Exception as e:
                self.health.record(provider, False)
                if yielded:
                    if not (continue_enabled and has_next):
                        raise
                    partial_text = "".join(partial)
                    logger.warning(
                        "Stream interrupted mid-flight on %s (%d tokens emitted); "
                        "continuing on next provider",
                        provider.value, len(partial),
                    )
                    # Next provider picks up where this one stopped.
                    continue_from = partial_text
                    continue
                err_msg = f"{provider.value} failed: {str(e)}"
                logger.warning(err_msg)
                errors.append(err_msg)
                continue_from = None
        raise RuntimeError(f"All LLM providers exhausted (stream). Errors: {'; '.join(errors)}")

    async def _stream_provider(
        self, provider, prompt, system, max_tokens, provider_keys=None,
        key_pools=None, key_pool_ids=None, model_override=None, continue_from=None,
    ):
        config = dict(self.providers[provider])
        config["api_key"] = self._effective_api_key(provider, provider_keys, key_pools, key_pool_ids)
        if model_override:
            config["model"] = model_override
        if continue_from:
            prompt = _build_continue_prompt(prompt, continue_from)
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
            timeout=self.openai_stream_timeout,
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

        client = AsyncAnthropic(api_key=config["api_key"], timeout=self.anthropic_stream_timeout)
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
