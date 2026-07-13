"""Tests for the multi-provider LLM router with fallback chain."""

import pytest
from unittest.mock import AsyncMock
from app.llm import LLMRouter, ModelProvider


class TestInit:
    """LLMRouter initialization — key detection and provider selection."""

    async def test_raises_with_no_api_keys(self, monkeypatch):
        for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
                     "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
            monkeypatch.delenv(var, raising=False)
        with pytest.raises(RuntimeError, match="No LLM provider API keys configured"):
            LLMRouter()

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
                     "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
            monkeypatch.setenv(var, f"sk-{var.lower()}-test")
        router = LLMRouter()
        assert router.current_provider == ModelProvider.OPENROUTER

    async def test_fallback_list_logged(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or")
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-anthropic")
        router = LLMRouter()
        assert len(router.fallback_chain) == 6


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
