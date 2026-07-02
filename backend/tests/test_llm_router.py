"""LLM router self-healing tests: fallback, retry on transient errors, breaker ejection.

All network calls are stubbed — no provider SDK is exercised.
"""

import pytest

from app.llm import LLMRouter, ModelProvider, _is_transient

ALL_KEY_VARS = (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
)


@pytest.fixture
def router(monkeypatch):
    for var in ALL_KEY_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BREAKER_THRESHOLD", "2")
    monkeypatch.setenv("LLM_BREAKER_WINDOW_SECONDS", "120")
    monkeypatch.setenv("LLM_BREAKER_COOLDOWN_SECONDS", "300")
    return LLMRouter()


def stub_providers(router, behaviors):
    """Replace _call_provider with a stub; `behaviors` maps provider -> callable or value."""
    calls = []

    async def fake_call(provider, prompt, system, max_tokens):
        calls.append(provider)
        behavior = behaviors[provider]
        if callable(behavior):
            return behavior()
        return behavior

    router._call_provider = fake_call
    return calls


def test_is_transient_classification():
    assert _is_transient(TimeoutError("request timed out"))
    assert _is_transient(RuntimeError("429 Too Many Requests"))
    assert _is_transient(ConnectionError("connection reset"))
    assert not _is_transient(ValueError("invalid api key"))
    assert not _is_transient(RuntimeError("model not found"))


@pytest.mark.asyncio
async def test_fallback_to_next_provider_on_failure(router):
    def fail():
        raise ValueError("invalid api key")  # non-transient: no retry, straight fallback

    calls = stub_providers(router, {
        ModelProvider.OPENROUTER: fail,
        ModelProvider.GROQ: "answer from groq",
    })
    assert await router.chat("hi") == "answer from groq"
    assert calls == [ModelProvider.OPENROUTER, ModelProvider.GROQ]


@pytest.mark.asyncio
async def test_transient_error_is_retried_on_same_provider(router):
    attempts = {"n": 0}

    def flaky():
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise TimeoutError("request timed out")
        return "recovered"

    calls = stub_providers(router, {
        ModelProvider.OPENROUTER: flaky,
        ModelProvider.GROQ: "unused",
    })
    assert await router.chat("hi") == "recovered"
    # Both attempts hit openrouter; groq never called
    assert calls == [ModelProvider.OPENROUTER, ModelProvider.OPENROUTER]


@pytest.mark.asyncio
async def test_breaker_ejects_failing_provider(router):
    def fail():
        raise ValueError("invalid api key")

    calls = stub_providers(router, {
        ModelProvider.OPENROUTER: fail,
        ModelProvider.GROQ: "ok",
    })
    # Threshold is 2: two failed chats open openrouter's circuit
    await router.chat("one")
    await router.chat("two")
    assert router.breaker.state(ModelProvider.OPENROUTER.value) == "open"

    calls.clear()
    assert await router.chat("three") == "ok"
    assert calls == [ModelProvider.GROQ]  # openrouter skipped while ejected


@pytest.mark.asyncio
async def test_all_providers_exhausted_raises(router):
    def fail():
        raise ValueError("invalid api key")

    stub_providers(router, {
        ModelProvider.OPENROUTER: fail,
        ModelProvider.GROQ: fail,
    })
    with pytest.raises(RuntimeError, match="exhausted"):
        await router.chat("hi")


def test_provider_status_reports_breaker_state(router):
    status = router.provider_status()
    assert status["openrouter"]["configured"] is True
    assert status["openai"]["configured"] is False
    assert status["openrouter"]["circuit"]["state"] == "closed"
