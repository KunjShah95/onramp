"""Regression tests for provider-level LLM observability hooks."""

import pytest

from app import metrics
from app.llm import LLMRouter, ModelProvider


@pytest.mark.asyncio
async def test_failed_completion_records_error_and_latency(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
    router = LLMRouter()

    async def fail(*_args, **_kwargs):
        raise TimeoutError("provider timed out")

    monkeypatch.setattr(router, "_call_provider", fail)
    with pytest.raises(RuntimeError, match="All LLM providers exhausted"):
        await router._complete([ModelProvider.GROQ], "hello", None, 100)

    text = metrics.generate_metrics()
    assert 'onramp_llm_errors_total{error_type="TimeoutError",operation="completion",provider="groq"}' in text
    assert 'onramp_llm_request_duration_seconds_count{operation="completion",provider="groq",status="error"}' in text
