"""Tests for the pluggable multi-provider embedding router."""

import pytest

from app.embeddings import EmbeddingProvider, EmbeddingRouter

_ALL_KEYS = {
    "OPENAI_API_KEY": "sk-openai",
    "GEMINI_API_KEY": "sk-gemini",
    "NVIDIA_API_KEY": "nvkey",
    "COHERE_API_KEY": "cohere-key",
    "VOYAGE_API_KEY": "voyage-key",
}


class TestInit:
    async def test_no_keys_never_raises(self, monkeypatch):
        for var in list(_ALL_KEYS) + ["OLLAMA_BASE_URL"]:
            monkeypatch.delenv(var, raising=False)
        router = EmbeddingRouter()
        assert router.is_available is False
        assert router.primary is None

    async def test_picks_free_provider_first(self, monkeypatch):
        for var in list(_ALL_KEYS):
            monkeypatch.setenv(var, _ALL_KEYS[var])
        monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
        router = EmbeddingRouter()
        assert router.primary == EmbeddingProvider.GEMINI

    async def test_openai_only(self, monkeypatch):
        for var in list(_ALL_KEYS) + ["OLLAMA_BASE_URL"]:
            monkeypatch.delenv(var, raising=False)
        monkeypatch.setenv("OPENAI_API_KEY", "sk-openai")
        router = EmbeddingRouter()
        assert router.primary == EmbeddingProvider.OPENAI

    async def test_embeddings_provider_override(self, monkeypatch):
        for var in list(_ALL_KEYS):
            monkeypatch.setenv(var, _ALL_KEYS[var])
        monkeypatch.setenv("EMBEDDINGS_PROVIDER", "voyage")
        router = EmbeddingRouter()
        assert router.primary == EmbeddingProvider.VOYAGE


class TestListModels:
    async def test_returns_all_providers(self, monkeypatch):
        router = EmbeddingRouter()
        catalog = router.list_models()
        assert set(catalog["providers"]) == {
            p.value for p in EmbeddingProvider
        }
        assert catalog["providers"]["openai"]["dimensions"] == 1536
        assert catalog["providers"]["huggingface_inference"]["dimensions"] == 384


class TestHuggingFaceInference:
    """HF Inference API (cloud, OpenAI-compatible) vs local sentence-transformers."""

    async def test_hf_inference_is_cloud_openai_compatible(self, monkeypatch):
        for var in list(_ALL_KEYS) + ["OLLAMA_BASE_URL"]:
            monkeypatch.delenv(var, raising=False)
        monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_test_token")
        monkeypatch.setattr(
            EmbeddingRouter, "_hf_installed", staticmethod(lambda: False)
        )
        router = EmbeddingRouter()
        assert router.primary == EmbeddingProvider.HF_INFERENCE
        cfg = router.providers[EmbeddingProvider.HF_INFERENCE]
        assert cfg["type"] == "openai_sdk"
        assert cfg["base_url"] == "https://router.huggingface.co/v1"
        assert cfg["model"] == "sentence-transformers/all-MiniLM-L6-v2"
        assert cfg["api_key"] == "hf_test_token"
        assert cfg["free"] is True

    async def test_hf_inference_unavailable_without_key(self, monkeypatch):
        for var in list(_ALL_KEYS) + ["HUGGINGFACE_API_KEY", "OLLAMA_BASE_URL"]:
            monkeypatch.delenv(var, raising=False)
        router = EmbeddingRouter()
        catalog = router.list_models()
        assert catalog["providers"]["huggingface_inference"]["available"] is False

    async def test_local_huggingface_still_local_sdk(self, monkeypatch):
        router = EmbeddingRouter()
        cfg = router.providers[EmbeddingProvider.HUGGINGFACE]
        assert cfg["type"] == "local_sdk"
        assert cfg["api_key"] is None


class TestRouteInfo:
    async def test_route_info_has_usd_and_inr(self, monkeypatch):
        router = EmbeddingRouter()
        route = router.route_info(EmbeddingProvider.OPENAI)
        assert route["provider"] == "openai"
        assert route["price_usd"] > 0
        assert route["price_inr"] > 0
        assert route["dimensions"] == 1536


class TestEmbedBatch:
    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-openai")
        return EmbeddingRouter()

    async def test_uses_primary_provider(self, router, monkeypatch):
        async def fake(self_, provider, texts, provider_keys=None):
            return [[0.1, 0.2] for _ in texts]

        monkeypatch.setattr(EmbeddingRouter, "_call_provider", fake)
        vectors, provider, route = await router.embed_batch(["hello", "world"])
        assert provider == EmbeddingProvider.OPENAI
        assert len(vectors) == 2

    async def test_falls_back_on_first_provider_failure(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-openai")
        monkeypatch.setenv("GEMINI_API_KEY", "sk-gemini")
        monkeypatch.setenv("EMBEDDINGS_PROVIDER", "openai")
        router = EmbeddingRouter()
        calls = []

        async def fake(self_, provider, texts, provider_keys=None):
            calls.append(provider)
            if provider == EmbeddingProvider.OPENAI:
                raise Exception("openai down")
            return [[0.1] for _ in texts]

        monkeypatch.setattr(EmbeddingRouter, "_call_provider", fake)
        vectors, provider, route = await router.embed_batch(["hi"])
        assert provider == EmbeddingProvider.GEMINI
        assert len(calls) == 2

    async def test_all_providers_exhausted_raises(self, router, monkeypatch):
        async def fake(self_, provider, texts, provider_keys=None):
            raise Exception(f"{provider.value} down")

        monkeypatch.setattr(EmbeddingRouter, "_call_provider", fake)
        with pytest.raises(RuntimeError):
            await router.embed_batch(["hi"])

    async def test_empty_batch_raises(self, router):
        with pytest.raises(ValueError):
            await router.embed_batch([])

    async def test_embed_single(self, router, monkeypatch):
        async def fake(self_, provider, texts, provider_keys=None):
            return [[0.5, 0.5] for _ in texts]

        monkeypatch.setattr(EmbeddingRouter, "_call_provider", fake)
        vector, provider, route = await router.embed("hello")
        assert vector == [0.5, 0.5]

    async def test_hf_inference_embeds_via_openai_sdk(self, monkeypatch):
        """HF Inference reuses the OpenAI-compatible path with the HF token."""
        for var in list(_ALL_KEYS) + ["OLLAMA_BASE_URL"]:
            monkeypatch.delenv(var, raising=False)
        monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_test_token")
        monkeypatch.setattr(
            EmbeddingRouter, "_hf_installed", staticmethod(lambda: False)
        )
        router = EmbeddingRouter()
        captured = {}

        async def fake(self_, provider, config, texts):
            captured["provider"] = provider.value
            captured["api_key"] = config["api_key"]
            captured["base_url"] = config["base_url"]
            captured["model"] = config["model"]
            return [[0.1] * 384 for _ in texts]

        monkeypatch.setattr(EmbeddingRouter, "_call_openai_sdk", fake)
        vectors, provider, route = await router.embed_batch(["hi"])
        assert provider == EmbeddingProvider.HF_INFERENCE
        assert captured["api_key"] == "hf_test_token"
        assert captured["base_url"] == "https://router.huggingface.co/v1"
        assert captured["model"] == "sentence-transformers/all-MiniLM-L6-v2"
        assert len(vectors) == 1
