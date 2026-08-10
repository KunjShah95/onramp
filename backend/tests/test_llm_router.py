"""Tests for the multi-provider LLM router with fallback chain."""

import pytest
from unittest.mock import AsyncMock
from app.llm import LLMRouter, ModelProvider


class TestInit:
    """LLMRouter initialization — key detection and provider selection."""

    async def test_falls_back_to_ollama_with_no_api_keys(self, monkeypatch):
        """When no cloud API keys are set, Ollama (local) is the fallback provider."""
        for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
                     "NVIDIA_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY",
                     "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY"):
            monkeypatch.delenv(var, raising=False)
        router = LLMRouter()
        # No RuntimeError — Ollama is always available as the last resort
        assert router.current_provider == ModelProvider.OLLAMA

    async def test_picks_first_available_key(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        router = LLMRouter()
        assert router.current_provider == ModelProvider.OPENROUTER

    async def test_skips_providers_without_keys(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        assert router.current_provider == ModelProvider.GROQ

    async def test_all_providers_available_picks_openrouter(self, monkeypatch):
        for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
                     "NVIDIA_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY",
                     "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY"):
            monkeypatch.setenv(var, f"sk-{var.lower()}-test")
        router = LLMRouter()
        assert router.current_provider == ModelProvider.OPENROUTER

    async def test_timeout_config_defaults(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        assert router.openai_timeout == 30.0
        assert router.anthropic_timeout == 30.0
        assert router.openai_stream_timeout == 60.0
        assert router.anthropic_stream_timeout == 60.0

    async def test_timeout_config_from_env(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        monkeypatch.setenv("LLM_TIMEOUT_OPENROUTER", "15.5")
        monkeypatch.setenv("LLM_TIMEOUT_ANTHROPIC", "20")
        monkeypatch.setenv("LLM_TIMEOUT_OPENROUTER_STREAM", "90")
        monkeypatch.setenv("LLM_TIMEOUT_ANTHROPIC_STREAM", "120")
        router = LLMRouter()
        assert router.openai_timeout == 15.5
        assert router.anthropic_timeout == 20.0
        assert router.openai_stream_timeout == 90.0
        assert router.anthropic_stream_timeout == 120.0

    async def test_fallback_list_logged(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or")
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-anthropic")
        router = LLMRouter()
        assert len(router.fallback_chain) == 9

    async def test_mistral_and_huggingface_are_openai_compatible(self, monkeypatch):
        """Mistral + HuggingFace register as OpenAI-compatible providers."""
        monkeypatch.setenv("MISTRAL_API_KEY", "sk-mistral")
        monkeypatch.setenv("HUGGINGFACE_API_KEY", "hf_test")
        router = LLMRouter()
        # Both sit in the free-first fallback chain (paid tier).
        assert ModelProvider.MISTRAL in router.fallback_chain
        assert ModelProvider.HUGGINGFACE in router.fallback_chain
        mistral_cfg = router.providers[ModelProvider.MISTRAL]
        assert mistral_cfg["api_key"] == "sk-mistral"
        assert mistral_cfg["model"] == "mistral-large-latest"
        assert mistral_cfg["base_url"] == "https://api.mistral.ai/v1"
        assert mistral_cfg["type"] == "openai_sdk"
        assert mistral_cfg["free"] is False
        hf_cfg = router.providers[ModelProvider.HUGGINGFACE]
        assert hf_cfg["api_key"] == "hf_test"
        assert hf_cfg["model"] == "Qwen/Qwen2.5-72B-Instruct"
        assert hf_cfg["base_url"] == "https://router.huggingface.co/v1"
        assert hf_cfg["type"] == "openai_sdk"
        assert hf_cfg["free"] is False
        # provider_chain resolves provider-name / model-id strings to the new providers.
        assert router.provider_chain(model="mistral")[0] == ModelProvider.MISTRAL
        assert router.provider_chain(model="Qwen/Qwen2.5-72B-Instruct")[0] == ModelProvider.HUGGINGFACE


class TestChat:
    """LLMRouter.chat() — primary LLM call with fallback."""

    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        return LLMRouter()

    async def test_chat_returns_response_from_working_provider(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens):
            return f"Response from {provider.value}"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("Hello")
        assert "Response from" in result

    async def test_fallback_on_first_provider_failure(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        call_count = []
        async def fake_call(self_, provider, prompt, system, max_tokens):
            call_count.append(provider)
            if provider == ModelProvider.OPENROUTER:
                raise Exception("OpenRouter down")
            return f"Response from {provider.value}"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("Hello")
        assert len(call_count) > 1
        assert "Response from" in result

    async def test_all_providers_exhausted_raises(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens):
            raise Exception(f"{provider.value} down")
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        with pytest.raises(RuntimeError, match="All LLM providers exhausted"):
            await router.chat("Hello")

    async def test_passes_system_prompt(self, router, monkeypatch):
        captured = {}
        async def fake_call(self_, provider, prompt, system, max_tokens):
            captured["system"] = system
            captured["prompt"] = prompt
            return "ok"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        await router.chat("Hello", system="You are a helpful assistant")
        assert captured["system"] == "You are a helpful assistant"
        assert captured["prompt"] == "Hello"


class TestJsonChat:
    """LLMRouter.json_chat() — JSON response parsing."""

    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        return LLMRouter()

    async def test_valid_json_returns_dict(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens):
            return '{"answer": 42, "city": "NYC"}'
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.json_chat("What is the answer?")
        assert result == {"answer": 42, "city": "NYC"}

    async def test_extracts_json_from_text(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens):
            return 'Here is the result:\n{"result": "success", "count": 3}\nHope this helps!'
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.json_chat("Analyze this")
        assert result == {"result": "success", "count": 3}

    async def test_no_json_found_raises(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens):
            return "This is just plain text without any JSON"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        with pytest.raises(ValueError, match="Could not parse JSON"):
            await router.json_chat("Tell me something")


class TestStreaming:
    """LLMRouter.chat_stream() — token-by-token streaming."""

    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        return LLMRouter()

    async def test_stream_yields_tokens(self, router, monkeypatch):
        async def fake_stream(self_, provider, prompt, system, max_tokens):
            for token in ["Hello", " ", "World"]:
                yield token
        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        tokens = []
        async for token in router.chat_stream("Hi"):
            tokens.append(token)
        assert tokens == ["Hello", " ", "World"]

    async def test_stream_fallback_on_failure(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        call_count = []
        async def fake_stream(self_, provider, prompt, system, max_tokens):
            call_count.append(provider)
            if provider == ModelProvider.OPENROUTER:
                raise Exception("Stream failed")
            for token in ["fallback", " ", "response"]:
                yield token
        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        tokens = []
        async for token in router.chat_stream("Hi"):
            tokens.append(token)
        assert len(call_count) > 1
        assert "".join(tokens) == "fallback response"

    async def test_stream_all_providers_exhausted(self, router, monkeypatch):
        async def fake_stream(self_, provider, prompt, system, max_tokens):
            raise Exception(f"{provider.value} stream down")
        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        with pytest.raises(RuntimeError, match="All LLM providers exhausted"):
            async for _ in router.chat_stream("Hi"):
                pass
