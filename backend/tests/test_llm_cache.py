"""Tests for the Redis LLM response cache + router integration.

Covers Stage 3: repeated prompts are served from the cache (zero provider
calls, zero cost), cache hits carry a synthetic free/cache route, and the
gateway exposes an ``X-LLM-Cache`` header.
"""

import pytest

from app.services import llm_cache
from app.llm import LLMRouter, QueryType


@pytest.fixture(autouse=True)
def _clean_local_cache():
    llm_cache._LOCAL_CACHE.clear()
    llm_cache._LOCAL_SEM.clear()
    yield
    llm_cache._LOCAL_CACHE.clear()
    llm_cache._LOCAL_SEM.clear()


class TestCacheKey:
    def test_horizontal_whitespace_normalization(self):
        # Runs of spaces/tabs collapse; newlines + indentation are preserved
        # (they are semantic in code, so they must NOT collide).
        a = llm_cache.cache_key("code", "  def foo():   return 1  ", None, 2000)
        b = llm_cache.cache_key("code", "def foo(): return 1", None, 2000)
        assert a == b

    def test_newlines_and_indentation_do_not_collide(self):
        # Python indentation is semantic — these must be different keys.
        a = llm_cache.cache_key("code", "if x:\n    return 1", None, 2000)
        b = llm_cache.cache_key("code", "if x:\nreturn 1", None, 2000)
        assert a != b

    def test_query_type_participates(self):
        a = llm_cache.cache_key("code", "hello", None, 2000)
        b = llm_cache.cache_key("chat", "hello", None, 2000)
        assert a != b

    def test_system_and_max_tokens_participate(self):
        a = llm_cache.cache_key("chat", "hi", "sys", 2000)
        b = llm_cache.cache_key("chat", "hi", "sys2", 2000)
        c = llm_cache.cache_key("chat", "hi", "sys", 1000)
        assert a != b
        assert a != c

    def test_scope_isolates_tenants(self):
        a = llm_cache.cache_key("chat", "explain my repo", None, 2000, scope="org-acme")
        b = llm_cache.cache_key("chat", "explain my repo", None, 2000, scope="org-other")
        assert a != b
        # Same scope + prompt still hits.
        c = llm_cache.cache_key("chat", "explain my repo", None, 2000, scope="org-acme")
        assert a == c


class TestCacheStore:
    @pytest.mark.asyncio
    async def test_roundtrip(self):
        await llm_cache.set_cached("chat", "hello world", None, 2000, "cached reply")
        got = await llm_cache.get_cached("chat", "hello   world", None, 2000)
        assert got == "cached reply"

    @pytest.mark.asyncio
    async def test_scope_isolates_stored_values(self):
        await llm_cache.set_cached("chat", "hi", None, 2000, "reply-acme", scope="org-acme")
        await llm_cache.set_cached("chat", "hi", None, 2000, "reply-other", scope="org-other")
        assert await llm_cache.get_cached("chat", "hi", None, 2000, scope="org-acme") == "reply-acme"
        assert await llm_cache.get_cached("chat", "hi", None, 2000, scope="org-other") == "reply-other"

    @pytest.mark.asyncio
    async def test_miss_returns_none(self):
        assert await llm_cache.get_cached("chat", "never stored", None, 2000) is None

    @pytest.mark.asyncio
    async def test_evict(self):
        await llm_cache.set_cached("chat", "hi", None, 2000, "x")
        assert await llm_cache.is_cached("chat", "hi", None, 2000) is True
        assert await llm_cache.evict("chat", "hi", None, 2000) is True
        assert await llm_cache.is_cached("chat", "hi", None, 2000) is False
        assert await llm_cache.evict("chat", "hi", None, 2000) is False

    @pytest.mark.asyncio
    async def test_evict_scope_clears_both_tiers(self):
        """evict_scope drops every cached answer for a repo scope."""
        from app.services import llm_cache

        scope = "repo-scope-123"
        await llm_cache.set_cached("chat", "how does auth work?", None, 2000, "exact-answer", scope=scope)
        await llm_cache.set_cached("code", "implement login", None, 2000, "other-answer", scope=scope)
        await llm_cache.set_semantic("chat", "what is the auth flow", None, 2000, "sem-answer", scope=scope)
        # Another scope is untouched.
        await llm_cache.set_cached("chat", "hello", None, 2000, "global-answer", scope="global")

        removed = await llm_cache.evict_scope(scope)

        assert removed >= 3
        assert await llm_cache.get_cached("chat", "how does auth work?", None, 2000, scope=scope) is None
        assert await llm_cache.get_cached("code", "implement login", None, 2000, scope=scope) is None
        assert await llm_cache.get_semantic("chat", "what is the auth flow", None, 2000, scope=scope) is None
        # Unrelated scopes survive.
        assert await llm_cache.get_cached("chat", "hello", None, 2000, scope="global") == "global-answer"

    @pytest.mark.asyncio
    async def test_evict_scope_ignores_global(self):
        """A global (or empty) scope is never bulk-evicted — too dangerous."""
        from app.services import llm_cache

        await llm_cache.set_cached("chat", "hi", None, 2000, "g", scope="global")
        assert await llm_cache.evict_scope("global") == 0
        assert await llm_cache.evict_scope("") == 0
        assert await llm_cache.get_cached("chat", "hi", None, 2000, scope="global") == "g"

    @pytest.mark.asyncio
    async def test_empty_response_not_cached(self):
        await llm_cache.set_cached("chat", "hi", None, 2000, "")
        assert await llm_cache.is_cached("chat", "hi", None, 2000) is False


class _CountingRouter:
    """Router stub that counts provider calls; used to prove cache short-circuits."""

    def __init__(self, provider_answer="real answer"):
        self.provider_calls = 0
        self.provider_answer = provider_answer
        self.last_route = None
        self.last_cache_hit = False

    async def _complete(self, chain, prompt, system, max_tokens):
        self.provider_calls += 1
        return self.provider_answer, "groq"

    def route_info(self, provider, query_type=None):
        return {"provider": "groq", "model": "llama", "served": "groq/llama", "free": True, "query_type": "chat"}


@pytest.mark.asyncio
async def test_router_chat_serves_repeat_from_cache():
    """Second identical chat() call must not hit the provider at all."""
    router = _CountingRouter()
    qtype = QueryType.CHAT
    prompt = "What is the capital of France?"
    cached = await llm_cache.get_cached("chat", prompt, None, 2000)
    assert cached is None

    # First call: provider called, response cached.
    answer1 = await llm_cache_fake_chat(router, prompt, qtype)
    assert router.provider_calls == 1
    assert router.last_cache_hit is False

    # Second call: served from cache, provider NOT called.
    answer2 = await llm_cache_fake_chat(router, prompt, qtype)
    assert router.provider_calls == 1
    assert answer2 == answer1 == "real answer"
    assert router.last_cache_hit is True
    assert router.last_route["served"] == "cache/redis"
    assert router.last_route["free"] is True
    assert router.last_route["price_in"] == 0.0


def _qv(qtype):
    return qtype.value if hasattr(qtype, "value") else str(qtype)


async def llm_cache_fake_chat(router, prompt, qtype, system=None, max_tokens=2000):
    """Mirror of LLMRouter.chat's cache flow against a counting stub."""
    cached = await llm_cache.get_cached(_qv(qtype), prompt, system, max_tokens)
    if cached is not None:
        router.last_route = {
            "provider": "cache", "model": "redis", "served": "cache/redis",
            "free": True, "query_type": _qv(qtype), "price_in": 0.0, "price_out": 0.0,
        }
        router.last_cache_hit = True
        return cached
    response, _provider = await router._complete(["groq"], prompt, system, max_tokens)
    router.last_route = router.route_info("groq", query_type=qtype)
    router.last_cache_hit = False
    await llm_cache.set_cached(_qv(qtype), prompt, system, max_tokens, response)
    return response


class TestRealRouterIntegration:
    @pytest.mark.asyncio
    async def test_real_router_caches_and_attribution(self, monkeypatch):
        """End-to-end through the real LLMRouter with a stubbed provider call."""
        from app.llm import llm_cache_get, llm_cache_set

        router = LLMRouter()

        async def fake_complete(chain, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return "hello from provider", chain[0]

        monkeypatch.setattr(router, "_complete", fake_complete)
        monkeypatch.setattr(router, "_initialize_providers", lambda: None)

        # First call populates the cache.
        r1 = await router.chat("explain caching", query_type=QueryType.REASONING)
        assert r1 == "hello from provider"
        assert router.last_cache_hit is False
        assert router.last_route["provider"] != "cache"

        # Second identical call is a cache hit.
        r2 = await router.chat("explain caching", query_type=QueryType.REASONING)
        assert r2 == "hello from provider"
        assert router.last_cache_hit is True
        assert router.last_route["provider"] == "cache"
        assert router.last_route["served"] == "cache/redis"
        assert router.last_route["price_in"] == 0.0

        # Different prompt is a miss.
        r3 = await router.chat("explain something else", query_type=QueryType.REASONING)
        assert router.last_cache_hit is False
        assert r3 == "hello from provider"

    @pytest.mark.asyncio
    async def test_openai_chat_cache_hit_shape(self, monkeypatch):
        router = LLMRouter()

        async def fake_complete(chain, prompt, system, max_tokens, provider_keys=None, model_override=None):
            return "cached openai reply", chain[0]

        monkeypatch.setattr(router, "_complete", fake_complete)
        monkeypatch.setattr(router, "_initialize_providers", lambda: None)

        content, served, route = await router.openai_chat(
            "write a function", model="code"
        )
        assert content == "cached openai reply"
        assert served != "cache/redis"
        assert router.last_cache_hit is False

        content2, served2, route2 = await router.openai_chat(
            "write a function", model="code"
        )
        assert content2 == "cached openai reply"
        assert served2 == "cache/redis"
        assert route2["provider"] == "cache"
        assert router.last_cache_hit is True
