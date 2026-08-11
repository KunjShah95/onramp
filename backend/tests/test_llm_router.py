"""Tests for the multi-provider LLM router with fallback chain."""

import pytest
from unittest.mock import AsyncMock
from app.llm import (
    LLMRouter,
    ModelProvider,
    QueryType,
    RoutingMode,
    estimate_complexity,
    _ProviderHealth,
)


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
        assert len(router.fallback_chain) == len(ModelProvider)

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
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return f"Response from {provider.value}"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("Hello")
        assert "Response from" in result

    async def test_fallback_on_first_provider_failure(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        call_count = []
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            call_count.append(provider)
            if provider == ModelProvider.OPENROUTER:
                raise Exception("OpenRouter down")
            return f"Response from {provider.value}"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("Hello")
        assert len(call_count) > 1
        assert "Response from" in result

    async def test_all_providers_exhausted_raises(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            raise Exception(f"{provider.value} down")
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        with pytest.raises(RuntimeError, match="All LLM providers exhausted"):
            await router.chat("Hello")

    async def test_passes_system_prompt(self, router, monkeypatch):
        captured = {}
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            captured["system"] = system
            captured["prompt"] = prompt
            return "ok"
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        await router.chat("Hello", system="You are a helpful assistant")
        assert captured["system"] == "You are a helpful assistant"
        assert captured["prompt"] == "Hello"

    async def test_chat_model_kwarg_is_accepted_without_query_type(self, router, monkeypatch):
        """chat(model=...) must be callable without query_type — the /ask
        endpoint relies on this (RepoQA passes an explicit model instead of
        its declared REASONING type)."""
        seen = {}

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen["provider"] = provider
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("How does auth work?", model="groq")
        assert result == "ok"
        assert seen["provider"] == ModelProvider.GROQ


class TestJsonChat:
    """LLMRouter.json_chat() — JSON response parsing."""

    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        return LLMRouter()

    async def test_valid_json_returns_dict(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return '{"answer": 42, "city": "NYC"}'
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.json_chat("What is the answer?")
        assert result == {"answer": 42, "city": "NYC"}

    async def test_extracts_json_from_text(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return 'Here is the result:\n{"result": "success", "count": 3}\nHope this helps!'
        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.json_chat("Analyze this")
        assert result == {"result": "success", "count": 3}

    async def test_no_json_found_raises(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
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
        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
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
        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
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
        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            raise Exception(f"{provider.value} stream down")
        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        with pytest.raises(RuntimeError, match="All LLM providers exhausted"):
            async for _ in router.chat_stream("Hi"):
                pass


class TestMultiKeyPools:
    """Multi-key load balancing — several team keys per provider, rotated
    round-robin on the real call path (and never on availability checks)."""

    @pytest.fixture
    def router(self, monkeypatch):
        # Isolate: conftest.py defaults GROQ_API_KEY, which outranks OpenAI
        # in the fallback chain — clear everything except the pool provider.
        for var in (
            "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "NVIDIA_API_KEY",
            "DEEPSEEK_API_KEY", "QWEN_API_KEY", "ZHIPU_API_KEY", "MOONSHOT_API_KEY",
            "MISTRAL_API_KEY", "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY",
            "COHERE_API_KEY", "VOYAGE_API_KEY",
        ):
            monkeypatch.delenv(var, raising=False)
        monkeypatch.setenv("OPENAI_API_KEY", "sk-env")
        return LLMRouter()

    def test_effective_api_key_rotates_across_pool(self, router):
        pool = {"openai": ["pool-key-1", "pool-key-2", "pool-key-3"]}
        picked = [
            router._effective_api_key(ModelProvider.OPENAI, key_pools=pool)
            for _ in range(4)
        ]
        assert picked == ["pool-key-1", "pool-key-2", "pool-key-3", "pool-key-1"]

    def test_pool_beats_single_primary_and_env(self, router):
        pool = {"openai": ["pool-key-1", "pool-key-2"]}
        assert router._effective_api_key(
            ModelProvider.OPENAI, provider_keys={"openai": "primary"}, key_pools=pool
        ) in ("pool-key-1", "pool-key-2")

    def test_no_pool_keeps_primary_behavior(self, router):
        assert router._effective_api_key(
            ModelProvider.OPENAI, provider_keys={"openai": "primary"}
        ) == "primary"

    async def test_completion_rotates_keys_on_real_call_path(self, router, monkeypatch):
        captured = []

        async def fake_sdk(self_, provider, config, prompt, system, max_tokens):
            captured.append(config["api_key"])
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_openai_sdk", fake_sdk)
        pool = {"openai": ["pool-key-1", "pool-key-2"]}
        # Distinct prompts so the response cache can't absorb the repeats.
        for i in range(3):
            await router.openai_chat(f"hi {i}", key_pools=pool)
        assert captured == ["pool-key-1", "pool-key-2", "pool-key-1"]

    async def test_route_info_records_key_index(self, router, monkeypatch):
        captured = []

        async def fake_sdk(self_, provider, config, prompt, system, max_tokens):
            captured.append(config["api_key"])
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_openai_sdk", fake_sdk)
        pool = {"openai": ["pool-key-1", "pool-key-2"]}
        _text, _served, route = await router.openai_chat("hi a", key_pools=pool)
        assert route["key_index"] == 0
        _text, _served, route = await router.openai_chat("hi b", key_pools=pool)
        assert route["key_index"] == 1

    async def test_route_info_records_stable_key_id(self, router, monkeypatch):
        """With key_pool_ids aligned to the pool, the route record names the
        exact key_id that served (not just its positional index)."""
        captured = []

        async def fake_sdk(self_, provider, config, prompt, system, max_tokens):
            captured.append(config["api_key"])
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_openai_sdk", fake_sdk)
        pool = {"openai": ["pool-key-1", "pool-key-2"]}
        pool_ids = {"openai": ["key-slot-A", "key-slot-B"]}
        _text, _served, route = await router.openai_chat(
            "hi a", key_pools=pool, key_pool_ids=pool_ids
        )
        assert route["key_index"] == 0
        assert route["key_id"] == "key-slot-A"
        _text, _served, route = await router.openai_chat(
            "hi b", key_pools=pool, key_pool_ids=pool_ids
        )
        assert route["key_index"] == 1
        assert route["key_id"] == "key-slot-B"
        # Without ids, key_id is absent but key_index still works.
        _text, _served, route = await router.openai_chat("hi c", key_pools=pool)
        assert route["key_index"] == 0
        assert "key_id" not in route

    async def test_stream_route_records_key_id(self, router, monkeypatch):
        async def fake_sdk(self_, provider, config, prompt, system, max_tokens):
            yield "tok"

        monkeypatch.setattr(LLMRouter, "_stream_openai_sdk", fake_sdk)
        pool = {"openai": ["pool-key-1", "pool-key-2"]}
        pool_ids = {"openai": ["key-slot-A", "key-slot-B"]}
        routes = []
        async for _t, _m, route in router.openai_chat_stream(
            "hi a", key_pools=pool, key_pool_ids=pool_ids
        ):
            routes.append(route)
        assert all(r["key_id"] == "key-slot-A" for r in routes)
        assert router.last_route["key_id"] == "key-slot-A"

    async def test_stream_rotates_keys(self, router, monkeypatch):
        captured = []

        async def fake_sdk(self_, provider, config, prompt, system, max_tokens):
            captured.append(config["api_key"])
            yield "tok"

        monkeypatch.setattr(LLMRouter, "_stream_openai_sdk", fake_sdk)
        pool = {"openai": ["pool-key-1", "pool-key-2"]}
        async for _ in router.openai_chat_stream("hi a", key_pools=pool):
            pass
        async for _ in router.openai_chat_stream("hi b", key_pools=pool):
            pass
        assert captured == ["pool-key-1", "pool-key-2"]


class TestStreamingContinue:
    """Mid-stream failover — flag-gated continue mode (LLM_STREAM_CONTINUE)."""

    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        return LLMRouter()

    async def test_mid_stream_failure_raises_by_default(self, router, monkeypatch):
        monkeypatch.delenv("LLM_STREAM_CONTINUE", raising=False)

        async def fake_stream(self_, provider, prompt, system, max_tokens, **kwargs):
            yield "partial"
            raise Exception("connection dropped")

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        # The upstream error propagates (mid-stream failover is opt-in).
        with pytest.raises(Exception, match="connection dropped"):
            async for _ in router.chat_stream("hi"):
                pass

    async def test_continue_mode_resumes_on_next_provider(self, router, monkeypatch):
        monkeypatch.setenv("LLM_STREAM_CONTINUE", "true")
        seen = []

        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None,
                              key_pools=None, model_override=None, continue_from=None):
            seen.append((provider, continue_from))
            if provider == ModelProvider.OPENROUTER:
                yield "par"
                yield "tial"
                raise Exception("connection dropped")
            for tok in ["-resumed"]:
                yield tok

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        tokens = []
        async for token in router.chat_stream("hi"):
            tokens.append(token)
        # The second provider received the partial as continue_from context.
        assert tokens == ["par", "tial", "-resumed"]
        assert seen[1][0] == ModelProvider.GROQ
        assert seen[1][1] == "partial"
        # First provider had no continue context.
        assert seen[0][1] is None

    async def test_continue_prompt_includes_partial_text(self, router, monkeypatch):
        from app.llm import _build_continue_prompt

        rewritten = _build_continue_prompt("original question", "half an answer")
        assert "original question" in rewritten
        assert "half an answer" in rewritten
        assert "do not repeat" in rewritten

    async def test_continue_mode_still_fails_when_no_next_provider(self, monkeypatch):
        # Build a router with exactly ONE provider so there is nothing to
        # continue onto (Ollama is nominally always available — disable it).
        monkeypatch.setenv("LLM_STREAM_CONTINUE", "true")
        monkeypatch.delenv("GROQ_API_KEY", raising=False)
        monkeypatch.setenv("OLLAMA_API_KEY", "")
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        router = LLMRouter()

        async def fake_stream(self_, provider, prompt, system, max_tokens, **kwargs):
            yield "partial"
            raise Exception("connection dropped")

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        with pytest.raises(Exception, match="connection dropped"):
            async for _ in router.chat_stream("hi"):
                pass


class TestRoutingMode:
    """RoutingMode.coerce — accepts an int 0-10, a preset name, or None."""

    def test_presets(self):
        assert RoutingMode.coerce("cost") == RoutingMode.COST
        assert RoutingMode.coerce("balanced") == RoutingMode.BALANCED
        assert RoutingMode.coerce("balance") == RoutingMode.BALANCED
        assert RoutingMode.coerce("intelligence") == RoutingMode.INTELLIGENCE
        assert RoutingMode.coerce("INTELLIGENCE") == RoutingMode.INTELLIGENCE

    def test_none_defaults_to_balanced(self):
        assert RoutingMode.coerce(None) == RoutingMode.BALANCED

    def test_int_passthrough_and_clamping(self):
        assert RoutingMode.coerce(7) == 7
        assert RoutingMode.coerce(-3) == 0
        assert RoutingMode.coerce(99) == 10

    def test_unknown_string_defaults_to_balanced(self):
        assert RoutingMode.coerce("nonsense") == RoutingMode.BALANCED

    def test_numeric_string(self):
        assert RoutingMode.coerce("6") == 6


class TestEstimateComplexity:
    """estimate_complexity — heuristic 0..1 difficulty score."""

    def test_short_chat_is_low_complexity(self):
        assert estimate_complexity("hi, how are you?", QueryType.CHAT) < 0.3

    def test_reasoning_baseline_exceeds_chat_baseline(self):
        same_text = "what about this"
        assert estimate_complexity(same_text, QueryType.REASONING) > estimate_complexity(
            same_text, QueryType.CHAT
        )

    def test_hard_markers_raise_score(self):
        hard = (
            "Design a distributed, production-grade, scalable architecture "
            "from scratch. Step by step, handle race conditions and edge "
            "cases across the codebase."
        )
        easy = "fix this typo"
        assert estimate_complexity(hard, QueryType.CODE) > estimate_complexity(easy, QueryType.CODE)

    def test_code_blocks_raise_score(self):
        with_code = "explain this:\n```python\ndef foo(): pass\n```"
        without_code = "explain this function please"
        assert estimate_complexity(with_code, QueryType.CODE) > estimate_complexity(
            without_code, QueryType.CODE
        )

    def test_score_is_clamped_0_to_1(self):
        very_long_hard = " ".join(["architecture distributed scalable optimize"] * 200)
        assert 0.0 <= estimate_complexity(very_long_hard, QueryType.REASONING) <= 1.0


class TestProviderHealth:
    """_ProviderHealth — recent-outage cooldown + rolling success rate."""

    def test_unproven_provider_gets_optimistic_prior(self):
        health = _ProviderHealth()
        assert health.success_rate(ModelProvider.GEMINI) == 0.7
        assert health.is_degraded(ModelProvider.GEMINI) is False

    def test_failure_marks_degraded(self):
        health = _ProviderHealth()
        health.record(ModelProvider.OPENAI, False)
        assert health.is_degraded(ModelProvider.OPENAI) is True

    def test_success_after_failure_does_not_clear_cooldown(self):
        health = _ProviderHealth()
        health.record(ModelProvider.OPENAI, False)
        health.record(ModelProvider.OPENAI, True)
        # still degraded — the cooldown is time-based, not "most recent outcome"
        assert health.is_degraded(ModelProvider.OPENAI) is True

    def test_success_rate_laplace_smoothed(self):
        health = _ProviderHealth()
        for _ in range(8):
            health.record(ModelProvider.GROQ, True)
        for _ in range(2):
            health.record(ModelProvider.GROQ, False)
        # (8 successes + 1) / (10 total + 2) = 0.75
        assert health.success_rate(ModelProvider.GROQ) == pytest.approx(0.75)

    def test_snapshot_shape(self):
        health = _ProviderHealth()
        health.record(ModelProvider.NVIDIA, True)
        snap = health.snapshot()
        assert "nvidia" in snap
        assert set(snap["nvidia"]) == {"success_rate", "degraded", "sample_size"}


class TestScoredRouting:
    """resolve_route — EV-weighted scoring on top of the QUERY_TYPE_ROUTES prior."""

    HARD_CODE_PROMPT = (
        "Design a distributed, production-grade, scalable architecture "
        "from scratch. Step by step, handle race conditions and edge "
        "cases across the codebase."
    )

    @pytest.fixture
    def router(self, monkeypatch):
        for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
            monkeypatch.setenv(var, f"sk-{var.lower()}-test")
        return LLMRouter()

    def test_cost_mode_prefers_free_even_for_hard_prompt(self, router):
        chain = router.resolve_route(
            QueryType.CODE, prompt=self.HARD_CODE_PROMPT, routing_mode="cost"
        )
        assert self.providers_are_free(router, chain[0]) is True

    def test_max_intelligence_lets_domain_expert_paid_provider_win(self, router):
        # QUERY_TYPE_ROUTES[CODE] ranks Anthropic first; at the top of the
        # dial (10) with a genuinely hard prompt, that expert pick should
        # win outright over the free tier.
        chain = router.resolve_route(QueryType.CODE, prompt=self.HARD_CODE_PROMPT, routing_mode=10)
        assert chain[0] == ModelProvider.ANTHROPIC

    def test_intelligence_beats_cost_for_paid_provider_rank(self, router):
        cost_chain = router.resolve_route(
            QueryType.CODE, prompt=self.HARD_CODE_PROMPT, routing_mode="cost"
        )
        intel_chain = router.resolve_route(
            QueryType.CODE, prompt=self.HARD_CODE_PROMPT, routing_mode="intelligence"
        )
        assert intel_chain.index(ModelProvider.ANTHROPIC) < cost_chain.index(ModelProvider.ANTHROPIC)

    def test_degraded_provider_is_deprioritized_even_at_max_intelligence(self, router):
        router.health.record(ModelProvider.ANTHROPIC, False)
        chain = router.resolve_route(QueryType.CODE, prompt=self.HARD_CODE_PROMPT, routing_mode=10)
        assert chain[0] != ModelProvider.ANTHROPIC

    def test_without_prompt_falls_back_to_query_type_baseline_complexity(self, router):
        # No prompt given — should not raise, should still return a full chain.
        chain = router.resolve_route(QueryType.CODE, routing_mode="balanced")
        assert set(chain) >= {ModelProvider.ANTHROPIC, ModelProvider.OPENAI, ModelProvider.GEMINI}

    @staticmethod
    def providers_are_free(router, provider):
        return bool(router.providers[provider]["free"])


class TestRouterHealthObservability:
    """router_health() — admin/observability snapshot."""

    def test_shape(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        router.health.record(ModelProvider.GROQ, True)
        snap = router.router_health()
        assert "cooldown_seconds" in snap
        assert "window_size" in snap
        assert "groq" in snap["providers"]

    def test_list_models_exposes_routing_modes(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()
        catalog = router.list_models()
        assert catalog["routing_modes"] == {"cost": 2, "balanced": 5, "intelligence": 8}


class TestOpenRouterPassthrough:
    """Any OpenRouter-catalog model (not just our nine pinned defaults) is
    reachable by name, as long as an OpenRouter key is configured."""

    @pytest.fixture
    def router(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
        monkeypatch.setenv("GEMINI_API_KEY", "sk-gemini-test")
        return LLMRouter()

    def test_arbitrary_catalog_model_routes_to_openrouter_only(self, router):
        chain = router.provider_chain(model="deepseek/deepseek-r1")
        assert chain == [ModelProvider.OPENROUTER]

    def test_known_pinned_model_is_not_passthrough(self, router):
        assert router._is_openrouter_passthrough_model("gemini-2.5-flash") is False

    def test_provider_name_is_not_passthrough(self, router):
        assert router._is_openrouter_passthrough_model("gemini") is False

    def test_query_type_name_is_not_passthrough(self, router):
        assert router._is_openrouter_passthrough_model("code") is False

    def test_model_without_slash_is_not_passthrough(self, router):
        assert router._is_openrouter_passthrough_model("gpt-4o-mini") is False

    def test_no_openrouter_key_disables_passthrough(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.setenv("GEMINI_API_KEY", "sk-gemini-test")
        router = LLMRouter()
        assert router._is_openrouter_passthrough_model("deepseek/deepseek-r1") is False

    def test_team_byok_openrouter_key_enables_passthrough(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.setenv("GEMINI_API_KEY", "sk-gemini-test")
        router = LLMRouter()
        assert router._is_openrouter_passthrough_model(
            "deepseek/deepseek-r1", provider_keys={"openrouter": "sk-team-or"}
        ) is True

    def test_route_info_reflects_override_model_and_price(self, router):
        info = router.route_info(ModelProvider.OPENROUTER, model_override="anthropic/claude-opus-4")
        assert info["model"] == "anthropic/claude-opus-4"
        assert info["served"] == "openrouter/anthropic/claude-opus-4"
        assert info["free"] is False  # no ":free" suffix

    def test_route_info_recognizes_free_suffix(self, router):
        info = router.route_info(
            ModelProvider.OPENROUTER, model_override="meta-llama/llama-3.1-8b-instruct:free"
        )
        assert info["free"] is True

    def test_served_model_reflects_override(self, router):
        assert router.served_model(ModelProvider.OPENROUTER, "mistralai/mistral-large") == (
            "openrouter/mistralai/mistral-large"
        )

    async def test_openai_chat_calls_the_exact_requested_model(self, router, monkeypatch):
        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        content, served, route = await router.openai_chat(
            "hello", model="deepseek/deepseek-r1"
        )
        assert served == "openrouter/deepseek/deepseek-r1"
        assert route["model"] == "deepseek/deepseek-r1"

    async def test_openai_chat_threads_model_override_into_call_provider(self, router, monkeypatch):
        captured = {}

        async def fake_call_provider(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            captured["model_override"] = model_override
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call_provider)
        await router.openai_chat("hello", model="deepseek/deepseek-r1")
        assert captured["model_override"] == "deepseek/deepseek-r1"

    async def test_chat_with_passthrough_model_threads_override(self, router, monkeypatch):
        """LLMRouter.chat() (the /ask path) must pass an OpenRouter-catalog
        model all the way into the provider call — not just resolve the chain."""
        captured = {}

        async def fake_call_provider(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            captured["model_override"] = model_override
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call_provider)
        result = await router.chat("hello", model="deepseek/deepseek-r1")
        assert result == "ok"
        assert captured["model_override"] == "deepseek/deepseek-r1"
        assert router.last_route["model"] == "deepseek/deepseek-r1"
        assert router.last_route["served"] == "openrouter/deepseek/deepseek-r1"

    async def test_chat_stream_with_passthrough_model_threads_override(self, router, monkeypatch):
        captured = {}

        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None,
                              key_pools=None, model_override=None, continue_from=None):
            captured["model_override"] = model_override
            yield "tok"

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        tokens = []
        async for token in router.chat_stream("hello", model="deepseek/deepseek-r1"):
            tokens.append(token)
        assert tokens == ["tok"]
        assert captured["model_override"] == "deepseek/deepseek-r1"
        assert router.last_route["model"] == "deepseek/deepseek-r1"

    async def test_chat_with_pinned_model_id_routes_to_that_provider(self, router, monkeypatch):
        """An explicit known provider name (e.g. from the catalog's pinned set)
        wins over auto-classification on the /ask chat path."""
        seen = []

        async def fake_call_provider(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call_provider)
        await router.chat("explain this code", model="gemini")
        assert seen == [ModelProvider.GEMINI]


class TestChineseMarketProviders:
    """DeepSeek / Qwen / Zhipu / Moonshot - native OpenAI-compatible providers,
    not just reachable via OpenRouter passthrough."""

    @pytest.mark.parametrize("provider,env_var,model", [
        (ModelProvider.DEEPSEEK, "DEEPSEEK_API_KEY", "deepseek-chat"),
        (ModelProvider.QWEN, "QWEN_API_KEY", "qwen-plus"),
        (ModelProvider.ZHIPU, "ZHIPU_API_KEY", "glm-4-plus"),
        (ModelProvider.MOONSHOT, "MOONSHOT_API_KEY", "moonshot-v1-8k"),
    ])
    def test_configured_as_openai_compatible(self, monkeypatch, provider, env_var, model):
        monkeypatch.setenv(env_var, "sk-test-key")
        router = LLMRouter()
        cfg = router.providers[provider]
        assert cfg["api_key"] == "sk-test-key"
        assert cfg["model"] == model
        assert cfg["type"] == "openai_sdk"
        assert cfg["free"] is False
        assert cfg["base_url"] and cfg["base_url"].startswith("https://")

    def test_qwen_accepts_dashscope_key_alias(self, monkeypatch):
        monkeypatch.delenv("QWEN_API_KEY", raising=False)
        monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-dashscope-test")
        router = LLMRouter()
        assert router.providers[ModelProvider.QWEN]["api_key"] == "sk-dashscope-test"

    def test_model_override_via_env(self, monkeypatch):
        monkeypatch.setenv("ZHIPU_API_KEY", "sk-test")
        monkeypatch.setenv("ZHIPU_MODEL", "glm-4-flash")
        router = LLMRouter()
        assert router.providers[ModelProvider.ZHIPU]["model"] == "glm-4-flash"

    def test_deepseek_and_qwen_are_preferred_for_code(self, monkeypatch):
        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-ds")
        monkeypatch.setenv("QWEN_API_KEY", "sk-qwen")
        router = LLMRouter()
        chain = router.resolve_route(QueryType.CODE)
        assert ModelProvider.DEEPSEEK in chain
        assert ModelProvider.QWEN in chain

    def test_deepseek_reasoner_preferred_for_reasoning(self, monkeypatch):
        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-ds")
        router = LLMRouter()
        chain = router.resolve_route(QueryType.REASONING)
        assert ModelProvider.DEEPSEEK in chain

    def test_fallback_chain_includes_every_provider(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq")
        router = LLMRouter()
        assert set(router.fallback_chain) == set(ModelProvider)
