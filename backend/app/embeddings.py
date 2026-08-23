"""Pluggable multi-provider embedding router with fallback chain.

Mirrors :mod:`app.llm` (LLMRouter): an enum of providers, a config dict per
provider, a free-first fallback chain, lazy SDK imports (so a missing optional
SDK only disables that one provider), and USD+INR pricing attribution.

Providers are skipped when their API key is unset. HuggingFace comes in two
flavors: a cloud provider (``HF_INFERENCE``, the OpenAI-compatible Inference
API, keyed by ``HUGGINGFACE_API_KEY``) and a local provider (``HUGGINGFACE``,
available only when ``sentence-transformers`` is installed). Ollama is always
in the chain (checked at call time, like the LLM router). With nothing
configured the router still constructs — ``is_available`` is then ``False``
and callers fall back to keyword search.
"""

import os
import logging
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from app import metrics

logger = logging.getLogger("onramp.embeddings")


def _record_embedding_call(provider) -> None:
    """Record a served embedding provider call (best-effort)."""
    try:
        metrics.record_embedding_call(provider.value if hasattr(provider, "value") else str(provider))
    except Exception:
        pass


class EmbeddingProvider(Enum):
    """Available embedding providers ordered by priority (free first)."""
    GEMINI = "gemini"
    NVIDIA = "nvidia"
    OPENAI = "openai"
    COHERE = "cohere"
    VOYAGE = "voyage"
    HF_INFERENCE = "huggingface_inference"  # HuggingFace Inference API (cloud, OpenAI-compatible)
    OLLAMA = "ollama"
    HUGGINGFACE = "huggingface"  # Local sentence-transformers (no API key)


class EmbeddingRouter:
    """Multi-provider embeddings with fallback chain.

    ``embed_batch(texts)`` returns ``(vectors, provider, route)`` where
    ``route`` is an attribution dict (provider, model, served id, free flag,
    dimensions, USD + INR prices). ``embed(text)`` is the single-text helper.
    """

    def __init__(self):
        # Free cloud providers first, then paid cloud, then local last-resort
        # (mirrors LLMRouter's free -> paid -> local/Ollama ordering, so a
        # configured cloud key always outranks the local fallback).
        self.fallback_chain = [
            EmbeddingProvider.GEMINI,
            EmbeddingProvider.NVIDIA,
            EmbeddingProvider.HF_INFERENCE,  # free tier for many embedding models
            EmbeddingProvider.OPENAI,
            EmbeddingProvider.COHERE,
            EmbeddingProvider.VOYAGE,
            EmbeddingProvider.OLLAMA,
            EmbeddingProvider.HUGGINGFACE,
        ]

        _ollama_base_url = os.getenv("OLLAMA_BASE_URL", "")
        self.providers: Dict[EmbeddingProvider, Dict[str, Any]] = {
            EmbeddingProvider.OPENAI: {
                "api_key": os.getenv("OPENAI_API_KEY"),
                "model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
                "base_url": "https://api.openai.com/v1",
                "type": "openai_sdk",
                "dimensions": 1536,
                "free": False,
            },
            EmbeddingProvider.GEMINI: {
                "api_key": os.getenv("GEMINI_API_KEY"),
                "model": os.getenv("GEMINI_EMBEDDING_MODEL", "text-embedding-004"),
                "base_url": None,
                "type": "gemini_sdk",
                "dimensions": 768,
                "free": True,
            },
            EmbeddingProvider.NVIDIA: {
                "api_key": os.getenv("NVIDIA_API_KEY"),
                "model": os.getenv("NVIDIA_EMBEDDING_MODEL", "NV-Embed-QA"),
                "base_url": "https://integrate.api.nvidia.com/v1",
                "type": "openai_sdk",
                "dimensions": 1024,
                "free": True,
            },
            EmbeddingProvider.COHERE: {
                "api_key": os.getenv("COHERE_API_KEY"),
                "model": os.getenv("COHERE_EMBEDDING_MODEL", "embed-english-v3.0"),
                "base_url": None,
                "type": "cohere_sdk",
                "dimensions": 1024,
                "free": False,
            },
            EmbeddingProvider.VOYAGE: {
                "api_key": os.getenv("VOYAGE_API_KEY"),
                "model": os.getenv("VOYAGE_EMBEDDING_MODEL", "voyage-code-3"),
                "base_url": None,
                "type": "voyage_sdk",
                "dimensions": 1024,
                "free": False,
            },
            EmbeddingProvider.OLLAMA: {
                "api_key": os.getenv("OLLAMA_API_KEY", "ollama"),
                "model": os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"),
                "base_url": _ollama_base_url or "http://localhost:11434/v1",
                "type": "openai_sdk",
                "dimensions": 768,
                "free": True,
            },
            EmbeddingProvider.HF_INFERENCE: {
                # HuggingFace Inference API — OpenAI-compatible /v1/embeddings
                # (Bearer auth with the standard hf_... token). Shares the
                # HUGGINGFACE_API_KEY used by the LLM router's HF provider.
                # Marked free here because most embedding models are served on
                # HF's free tier with an account token (the LLM router's HF
                # entry is free: False since chat models burn PRO credits).
                "api_key": os.getenv("HUGGINGFACE_API_KEY"),
                "model": os.getenv("HF_INFERENCE_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
                "base_url": "https://router.huggingface.co/v1",
                "type": "openai_sdk",
                "dimensions": 384,
                "free": True,
            },
            EmbeddingProvider.HUGGINGFACE: {
                "api_key": None,
                "model": os.getenv("HF_EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
                "base_url": None,
                "type": "local_sdk",
                "dimensions": 384,
                "free": True,
            },
        }

        # Platform provider keys configured via the Admin Dashboard (stored
        # encrypted in the DB, pushed in at startup / on change). Precedence:
        # per-team BYOK keys > platform keys > env vars above.
        self.platform_keys: Dict[str, str] = {}

        self.current_provider: Optional[EmbeddingProvider] = None
        self.last_route: Optional[Dict[str, Any]] = None
        self._hf_model = None  # cached SentenceTransformer instance
        self._initialize()

    # ── Availability ──────────────────────────────────────────────────────

    _hf_spec_cache: bool | None = None

    @classmethod
    def _hf_installed(cls) -> bool:
        if cls._hf_spec_cache is None:
            import importlib.util

            cls._hf_spec_cache = importlib.util.find_spec("sentence_transformers") is not None
        return cls._hf_spec_cache

    def set_platform_keys(self, keys: Optional[Dict[str, str]] = None) -> None:
        """Apply platform-level keys configured via the Admin Dashboard."""
        self.platform_keys = dict(keys or {})

    def _provider_available(
        self, provider: EmbeddingProvider, provider_keys: Optional[Dict[str, str]] = None
    ) -> bool:
        """Availability, honoring per-request BYOK + platform overrides."""
        if provider == EmbeddingProvider.HUGGINGFACE:
            return self._hf_installed()
        if provider == EmbeddingProvider.OLLAMA:
            # Local provider counts as available only when the user points at
            # an Ollama instance; keeps is_available False with no config.
            return bool(os.getenv("OLLAMA_BASE_URL"))
        if provider_keys and provider_keys.get(provider.value):
            return True
        if self.platform_keys and self.platform_keys.get(provider.value):
            return True
        cfg = self.providers[provider]
        return bool(cfg.get("api_key"))

    def _initialize(self) -> None:
        override = (os.getenv("EMBEDDINGS_PROVIDER") or "").strip().lower()
        if override:
            try:
                forced = EmbeddingProvider(override)
                if self._provider_available(forced):
                    self.current_provider = forced
                    logger.info("EmbeddingRouter primary (forced): %s", forced.value)
                    return
                logger.warning("EMBEDDINGS_PROVIDER=%s not available; using auto", override)
            except ValueError:
                logger.warning("Unknown EMBEDDINGS_PROVIDER=%r", override)
        available = [
            p for p in self.fallback_chain if self._provider_available(p)
        ]
        if not available:
            self.current_provider = None
            logger.info("EmbeddingRouter: no embedding providers configured")
            return
        self.current_provider = available[0]
        logger.info(
            "EmbeddingRouter initialized. Primary: %s, available: %s",
            self.current_provider.value,
            [p.value for p in available],
        )

    @property
    def is_available(self) -> bool:
        return self.current_provider is not None

    @property
    def primary(self) -> Optional[EmbeddingProvider]:
        return self.current_provider

    def _chain(
        self, preferred: Optional[EmbeddingProvider] = None,
        provider_keys: Optional[Dict[str, str]] = None,
    ) -> List[EmbeddingProvider]:
        """Chain starting at ``preferred``, else the router primary, else the
        first available provider (free-first)."""
        if preferred is not None and self._provider_available(preferred, provider_keys):
            start = preferred
        elif self.current_provider is not None and self._provider_available(
            self.current_provider, provider_keys
        ):
            # Honor EMBEDDINGS_PROVIDER / the configured primary provider.
            start = self.current_provider
        else:
            available = [
                p for p in self.fallback_chain if self._provider_available(p, provider_keys)
            ]
            if not available:
                return []
            start = available[0]
        return [start] + [
            p for p in self.fallback_chain
            if p != start and self._provider_available(p, provider_keys)
        ]

    def resolve_model(
        self, model: Optional[str], provider_keys: Optional[Dict[str, str]] = None
    ) -> Optional[EmbeddingProvider]:
        """Resolve a model/provider name to a provider (else primary)."""
        if model:
            m = model.strip().lower()
            for provider in EmbeddingProvider:
                if m == provider.value:
                    return provider if self._provider_available(provider, provider_keys) else self.current_provider
            for provider, cfg in self.providers.items():
                if cfg["model"] and m == cfg["model"].lower():
                    return provider if self._provider_available(provider, provider_keys) else self.current_provider
        return self.current_provider

    # ── Catalog & attribution ─────────────────────────────────────────────

    def list_models(self) -> Dict[str, Any]:
        """OpenRouter-style embedding model catalog."""
        return {
            "router": "onramp-embedding-router",
            "providers": {
                p.value: {
                    "model": cfg["model"],
                    "base_url": cfg["base_url"],
                    "type": cfg["type"],
                    "free": cfg["free"],
                    "dimensions": cfg["dimensions"],
                    "available": self._provider_available(p),
                }
                for p, cfg in self.providers.items()
            },
        }

    def route_info(self, provider: EmbeddingProvider) -> Dict[str, Any]:
        """Attribution dict for a served embedding call (USD + INR pricing)."""
        from app.services.llm_costs import get_price

        cfg = self.providers[provider]
        price = get_price(cfg["model"])
        return {
            "provider": provider.value,
            "model": cfg["model"],
            "served": f"{provider.value}/{cfg['model']}",
            "free": bool(cfg.get("free")),
            "dimensions": cfg["dimensions"],
            "price_usd": price["input"],
            "price_inr": price.get("inr_input", price["input"] * 85.0),
        }

    # ── Embedding calls ───────────────────────────────────────────────────

    async def embed(self, text: str) -> Tuple[List[float], EmbeddingProvider, Dict[str, Any]]:
        """Embed a single text. Returns ``(vector, provider, route)``."""
        if not text or not text.strip():
            raise ValueError("text must not be empty")
        vectors, provider, route = await self.embed_batch([text])
        return vectors[0], provider, route

    async def embed_batch(
        self, texts: List[str], preferred: Optional[EmbeddingProvider] = None,
        provider_keys: Optional[Dict[str, str]] = None,
    ) -> Tuple[List[List[float]], EmbeddingProvider, Dict[str, Any]]:
        """Embed a batch of texts with per-provider fallback.

        ``preferred`` biases the provider chain to start with a specific
        provider (e.g. one resolved from an explicit ``model`` argument).
        ``provider_keys`` (optional request-scoped BYOK map) makes a cloud
        provider available when no platform env key is set, and overrides its
        key for this call. Returns ``(vectors, provider, route)``. Raises
        ``ValueError`` for an empty batch and ``RuntimeError`` when every
        configured provider fails.
        """
        if not texts:
            raise ValueError("texts must not be empty")
        chain = self._chain(preferred, provider_keys)
        if not chain:
            raise RuntimeError(
                "No embedding providers configured. Set OPENAI_API_KEY, "
                "GEMINI_API_KEY, NVIDIA_API_KEY, COHERE_API_KEY, "
                "VOYAGE_API_KEY, HUGGINGFACE_API_KEY, OLLAMA_BASE_URL, "
                "or install sentence-transformers."
            )
        errors = []
        for provider in chain:
            if not self._provider_available(provider, provider_keys):
                continue
            try:
                vectors = await self._call_provider(provider, texts, provider_keys)
                self.current_provider = provider
                self.last_route = self.route_info(provider)
                _record_embedding_call(provider)
                return vectors, provider, self.route_info(provider)
            except Exception as exc:
                err_msg = f"{provider.value} failed: {str(exc)}"
                logger.warning(err_msg)
                errors.append(err_msg)
        raise RuntimeError(f"All embedding providers exhausted. Errors: {'; '.join(errors)}")

    async def _call_provider(
        self, provider: EmbeddingProvider, texts: List[str],
        provider_keys: Optional[Dict[str, str]] = None,
    ) -> List[List[float]]:
        """Dispatch to the right SDK for this provider type."""
        config = dict(self.providers[provider])
        if provider_keys and provider_keys.get(provider.value):
            config["api_key"] = provider_keys[provider.value]
        elif self.platform_keys and self.platform_keys.get(provider.value):
            config["api_key"] = self.platform_keys[provider.value]
        ptype = config["type"]
        if ptype == "openai_sdk":
            return await self._call_openai_sdk(provider, config, texts)
        elif ptype == "gemini_sdk":
            return await self._call_gemini_sdk(config, texts)
        elif ptype == "cohere_sdk":
            return await self._call_cohere_sdk(config, texts)
        elif ptype == "voyage_sdk":
            return await self._call_voyage_sdk(config, texts)
        elif ptype == "local_sdk":
            return await self._call_local_sdk(config, texts)
        raise NotImplementedError(f"Provider type {ptype} not implemented")

    async def _call_openai_sdk(
        self, provider: EmbeddingProvider, config: Dict[str, Any], texts: List[str]
    ) -> List[List[float]]:
        """OpenAI SDK — covers OpenAI, NVIDIA, Ollama, HuggingFace Inference (OpenAI-compatible)."""
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            timeout=30.0,
        )
        resp = await client.embeddings.create(model=config["model"], input=texts)
        return [d.embedding for d in resp.data]

    async def _call_gemini_sdk(
        self, config: Dict[str, Any], texts: List[str]
    ) -> List[List[float]]:
        """Google Gen AI SDK (google-genai)."""
        from google import genai

        client = genai.Client(api_key=config["api_key"])
        resp = await client.aio.models.embed_content(
            model=config["model"], contents=texts
        )
        return [embedding.values for embedding in resp.embeddings]

    async def _call_cohere_sdk(
        self, config: Dict[str, Any], texts: List[str]
    ) -> List[List[float]]:
        """Cohere SDK."""
        import cohere

        client = cohere.AsyncClient(api_key=config["api_key"])
        resp = await client.embed(
            texts=texts, model=config["model"], input_type="search_document"
        )
        return [list(e) for e in resp.embeddings]

    async def _call_voyage_sdk(
        self, config: Dict[str, Any], texts: List[str]
    ) -> List[List[float]]:
        """Voyage AI SDK."""
        import voyageai

        client = voyageai.AsyncClient(api_key=config["api_key"])
        resp = await client.embed(texts, model=config["model"])
        return [list(e) for e in resp.embeddings]

    async def _call_local_sdk(
        self, config: Dict[str, Any], texts: List[str]
    ) -> List[List[float]]:
        """Local sentence-transformers (no API key) — offloaded to thread so event loop is not blocked."""
        import asyncio
        from sentence_transformers import SentenceTransformer

        def _encode() -> List[List[float]]:
            if self._hf_model is None:
                self._hf_model = SentenceTransformer(config["model"])
            embeddings = self._hf_model.encode(texts, normalize_embeddings=True)
            return [e.tolist() for e in embeddings]

        return await asyncio.to_thread(_encode)


# Backward-compatible alias
EmbeddingClient = EmbeddingRouter
