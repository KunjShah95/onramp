"""Tests for OpenRouter-style query-type routing in the LLM router."""

from app.llm import LLMRouter, ModelProvider, QueryType, RoutingMode, classify_query


_PROVIDER_KEY_VARS = (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "DEEPSEEK_API_KEY", "QWEN_API_KEY",
    "ZHIPU_API_KEY", "MOONSHOT_API_KEY", "MISTRAL_API_KEY",
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY",
)


def _set_all_keys(monkeypatch):
    """Configure every cloud provider so routing preferences are observable."""
    for var in _PROVIDER_KEY_VARS:
        monkeypatch.setenv(var, f"sk-{var.lower()}-test")


def _clear_all_keys(monkeypatch):
    """Remove every cloud provider key so tests are immune to the dev env."""
    for var in _PROVIDER_KEY_VARS:
        monkeypatch.delenv(var, raising=False)


class TestClassification:
    """classify_query() — prompt → query type heuristics."""

    def test_code_query(self):
        assert classify_query("Write a python function to sort an array") == QueryType.CODE

    def test_reasoning_query(self):
        assert classify_query("Explain why the sky is blue") == QueryType.REASONING

    def test_structured_query(self):
        assert classify_query("Return a JSON object with fields name and age") == QueryType.STRUCTURED

    def test_summarization_query(self):
        assert classify_query("Summarize the key points of this article") == QueryType.SUMMARIZATION

    def test_translation_query(self):
        assert classify_query("Translate this sentence to french") == QueryType.TRANSLATION

    def test_creative_query(self):
        assert classify_query("Write a short story about a dragon") == QueryType.CREATIVE

    def test_generic_falls_back_to_chat(self):
        assert classify_query("Hello, how are you today?") == QueryType.CHAT

    def test_code_marker_boost(self):
        # A bare code snippet with no code keywords still classifies as CODE
        # thanks to syntactic markers (def, =>, const).
        assert classify_query("def foo():\n  return 42") == QueryType.CODE
        assert classify_query("const add = (a, b) => a + b") == QueryType.CODE


class TestRouteResolution:
    """resolve_route() — per-query-type provider chains."""

    def test_chat_route_matches_fallback_chain(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        assert router.resolve_route(QueryType.CHAT) == router.fallback_chain

    def test_code_route_prefers_anthropic_first(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        route = router.resolve_route(QueryType.CODE)
        assert route[0] == ModelProvider.ANTHROPIC
        # Every configured provider stays reachable as fallback.
        assert ModelProvider.OPENROUTER in route
        assert len(route) == len(router.fallback_chain)

    def test_structured_route_prefers_groq_first(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        assert router.resolve_route(QueryType.STRUCTURED)[0] == ModelProvider.GROQ

    def test_route_skips_unconfigured_providers(self, monkeypatch):
        # Only GROQ + Ollama (always configured) available.
        _clear_all_keys(monkeypatch)
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq")
        router = LLMRouter()
        route = router.resolve_route(QueryType.CODE)
        assert route == [ModelProvider.GROQ, ModelProvider.OLLAMA]

    def test_string_query_type_coerced(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        assert router.resolve_route("code") == router.resolve_route(QueryType.CODE)

    def test_unknown_query_type_falls_back_to_chat(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        assert router.resolve_route("bogus") == router.resolve_route(QueryType.CHAT)


class TestQueryTypeRouting:
    """chat()/json_chat()/chat_stream() honor the routed provider order."""

    async def test_code_query_hits_anthropic_first(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return f"Response from {provider.value}"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("Write a python function to sort an array")
        assert seen[0] == ModelProvider.ANTHROPIC
        assert "Response from" in result

    async def test_query_type_override_wins_over_classification(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        # "Hello" classifies as CHAT, but the explicit override forces CODE.
        await router.chat("Hello", query_type=QueryType.CODE)
        assert seen[0] == ModelProvider.ANTHROPIC

    async def test_string_query_type_override(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        await router.chat("Hello", query_type="code")
        assert seen[0] == ModelProvider.ANTHROPIC

    async def test_chat_route_still_uses_default_chain(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            if provider == ModelProvider.OPENROUTER:
                raise Exception("OpenRouter down")
            return f"Response from {provider.value}"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.chat("Hello")
        # CHAT keeps the free-first chain: OpenRouter first, then fallback.
        assert seen[0] == ModelProvider.OPENROUTER
        assert seen[1] == ModelProvider.GEMINI
        assert "Response from" in result

    async def test_json_chat_defaults_to_structured_route(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return '{"ok": true}'

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        result = await router.json_chat("Give me the data")
        assert result == {"ok": True}
        # json_chat forces STRUCTURED, which prefers Groq first.
        assert seen[0] == ModelProvider.GROQ

    async def test_stream_respects_query_type(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            yield "hello "
            yield "world"

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        tokens = []
        async for tok in router.chat_stream("Fix this bug", query_type=QueryType.CODE):
            tokens.append(tok)
        assert seen[0] == ModelProvider.ANTHROPIC
        assert "".join(tokens) == "hello world"


class TestModelCatalog:
    """list_models() — OpenRouter-style catalog."""

    def test_catalog_shape(self, monkeypatch):
        _clear_all_keys(monkeypatch)
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq")
        router = LLMRouter()
        catalog = router.list_models()
        assert catalog["router"] == "onramp-query-router"
        assert set(catalog["query_types"].keys()) == {t.value for t in QueryType}
        assert catalog["query_types"]["code"]["preferred_providers"][0] == "anthropic"
        assert catalog["providers"]["groq"]["available"] is True
        assert catalog["providers"]["openai"]["available"] is False
        assert catalog["providers"]["ollama"]["available"] is True


class TestOpenAIModelRouting:
    """provider_chain() / openai_chat() / openai_chat_stream() — OpenAI-style."""

    def test_provider_chain_query_type_name(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        assert router.provider_chain(model="code") == router.resolve_route(QueryType.CODE)

    def test_provider_chain_provider_name_first(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        chain = router.provider_chain(model="groq")
        assert chain[0] == ModelProvider.GROQ
        # Remaining configured providers stay reachable as fallback.
        assert ModelProvider.OPENROUTER in chain

    def test_provider_chain_known_model_id(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        assert router.provider_chain(model="gpt-4o-mini")[0] == ModelProvider.OPENAI

    def test_provider_chain_unconfigured_provider_falls_back(self, monkeypatch):
        _clear_all_keys(monkeypatch)
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq")
        router = LLMRouter()
        # OpenAI isn't configured → falls back to the default CHAT chain.
        chain = router.provider_chain(model="openai")
        assert ModelProvider.OPENAI not in chain
        assert chain == router.resolve_route(QueryType.CHAT)

    def test_provider_chain_unknown_model_classifies_prompt(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        chain = router.provider_chain(
            model="some-random-model", prompt="Write a python function"
        )
        assert chain == router.resolve_route(QueryType.CODE)

    async def test_openai_chat_returns_content_and_served_model(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return f"Response from {provider.value}"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        content, served, route = await router.openai_chat("Write a python function", model="code")
        assert seen[0] == ModelProvider.ANTHROPIC
        assert content == "Response from anthropic"
        assert served == "anthropic/claude-3-5-sonnet-20241022"
        # Route attribution: paid provider (Claude), code query type, with the
        # per-1M-token prices snapshot from the pricing table. Keep the price
        # values in sync with MODEL_PRICING in app/services/llm_costs.py.
        # complexity/routing_mode are the router-scoring observability fields
        # (see RoutingMode / estimate_complexity in app/llm.py) - checked
        # separately below since their exact values aren't the point here.
        route_without_scoring_fields = {
            k: v for k, v in route.items() if k not in ("complexity", "routing_mode")
        }
        assert route_without_scoring_fields == {
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "served": "anthropic/claude-3-5-sonnet-20241022",
            "free": False,
            "query_type": "code",
            "price_in": 3.00,
            "price_out": 15.00,
        }
        assert 0.0 <= route["complexity"] <= 1.0
        assert route["routing_mode"] == RoutingMode.BALANCED

    async def test_openai_chat_provider_override(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()
        seen = []

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            seen.append(provider)
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        _content, served, route = await router.openai_chat("Hello", model="groq")
        assert seen[0] == ModelProvider.GROQ
        assert served == "groq/llama-3.3-70b-versatile"
        assert route["free"] is True  # Groq is a free provider

    async def test_openai_chat_stream_yields_tokens_and_served_model(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()

        async def fake_stream(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            yield "Hel"
            yield "lo"

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        chunks = []
        async for token, served, route in router.openai_chat_stream("Hello", model="groq"):
            chunks.append((token, served, route))
        assert [t for t, _, _ in chunks] == ["Hel", "lo"]
        assert all(s == "groq/llama-3.3-70b-versatile" for _, s, _ in chunks)
        assert all(r["provider"] == "groq" and r["free"] is True for _, _, r in chunks)

    async def test_chat_sets_last_route(self, monkeypatch):
        _set_all_keys(monkeypatch)
        router = LLMRouter()

        async def fake_call(self_, provider, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_provider", fake_call)
        await router.chat("Hello")
        assert router.last_route is not None
        assert router.last_route["provider"] == "openrouter"  # free-first chain
        assert router.last_route["free"] is True
        assert router.last_route["query_type"] == "chat"
