"""Tests for the semantic (near-duplicate) LLM cache tier.

Stage 3b: on top of exact-match caching, near-duplicate questions are
served from the cache via local hashed n-gram embeddings plus a content-word
subset gate. Both gates must pass:

- cosine similarity >= ``LLM_SEMANTIC_THRESHOLD`` (default 0.85), AND
- the new question's content words are a **subset** of the stored prompt's.

The subset gate is what blocks one-word adversarial rewrites ("sort" vs
"reverse", "auth" vs "payment") that pure lexical similarity cannot tell
apart (those pairs score ~0.9 by n-gram overlap alone).
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


class TestEmbedding:
    def test_embedding_is_deterministic_and_normalized(self):
        a = llm_cache._embed("  write   a python function")
        b = llm_cache._embed("write a python function")
        assert a == b
        assert len(a) == llm_cache.EMBED_DIM

    def test_content_words_strip_punctuation_and_stopwords(self):
        assert llm_cache._content_words("How do I parse JSON in Python?") == frozenset(
            {"parse", "json", "python"}
        )
        assert llm_cache._content_words("what the") == frozenset()  # all stopwords

    def test_cosine_ranges_over_identical_and_unrelated(self):
        same = llm_cache._cosine(
            llm_cache._embed("parse json in python"),
            llm_cache._embed("parse json in python"),
        )
        assert same == pytest.approx(1.0, abs=1e-6)
        unrelated = llm_cache._cosine(
            llm_cache._embed("banana yogurt smoothie"),
            llm_cache._embed("kernel panic bluescreen"),
        )
        assert unrelated < 0.5


class TestSemanticStore:
    @pytest.mark.asyncio
    async def test_near_duplicate_hits(self):
        await llm_cache.set_semantic(
            "chat", "write a python function to sort a list", None, 2000, "sorted!"
        )
        hit = await llm_cache.get_semantic(
            "chat", "write a function to sort a list in python", None, 2000
        )
        assert hit is not None
        text, sim = hit
        assert text == "sorted!"
        assert sim >= llm_cache.DEFAULT_SEMANTIC_THRESHOLD

    @pytest.mark.asyncio
    async def test_adversarial_one_word_rewrites_miss(self):
        # Same template, one different word — the subset gate must reject,
        # even though n-gram similarity alone would score these ~0.9.
        await llm_cache.set_semantic(
            "chat", "write a python function to sort a list", None, 2000, "sorted!"
        )
        assert await llm_cache.get_semantic(
            "chat", "write a python function to reverse a list", None, 2000
        ) is None

        await llm_cache.set_semantic("chat", "how to generate json in python", None, 2000, "gen!")
        assert await llm_cache.get_semantic(
            "chat", "how to parse json in python", None, 2000
        ) is None

        await llm_cache.set_semantic("chat", "what is the capital of spain", None, 2000, "madrid")
        assert await llm_cache.get_semantic(
            "chat", "what is the capital of france", None, 2000
        ) is None

    @pytest.mark.asyncio
    async def test_low_similarity_misses_even_when_subset_passes(self):
        # Same content words but heavy rephrasing drops below the cosine
        # threshold (measured ~0.83 < 0.85) — a safe conservative miss.
        await llm_cache.set_semantic("chat", "How do I parse JSON in Python?", None, 2000, "answer")
        assert await llm_cache.get_semantic(
            "chat", "how to parse json with python", None, 2000
        ) is None

    @pytest.mark.asyncio
    async def test_scope_and_query_type_isolate_buckets(self):
        await llm_cache.set_semantic("chat", "explain the auth flow", None, 2000, "a", scope="org-a")
        assert await llm_cache.get_semantic(
            "chat", "explain the auth flow", None, 2000, scope="org-b"
        ) is None

        await llm_cache.set_semantic("code", "explain the auth flow", None, 2000, "b")
        assert await llm_cache.get_semantic("chat", "explain the auth flow", None, 2000) is None

    @pytest.mark.asyncio
    async def test_evict_semantic(self):
        await llm_cache.set_semantic("chat", "explain the auth flow", None, 2000, "answer")
        assert await llm_cache.get_semantic("chat", "explain the auth flow", None, 2000) is not None
        assert await llm_cache.evict_semantic("chat", "explain the auth flow", None, 2000) is True
        assert await llm_cache.get_semantic("chat", "explain the auth flow", None, 2000) is None
        assert await llm_cache.evict_semantic("chat", "explain the auth flow", None, 2000) is False

    @pytest.mark.asyncio
    async def test_disabled_flag_never_serves(self, monkeypatch):
        await llm_cache.set_semantic("chat", "explain the auth flow", None, 2000, "answer")
        assert await llm_cache.get_semantic("chat", "explain the auth flow", None, 2000) is not None
        monkeypatch.setattr(llm_cache, "SEMANTIC_ENABLED", False)
        assert await llm_cache.get_semantic("chat", "explain the auth flow", None, 2000) is None

    @pytest.mark.asyncio
    async def test_empty_response_not_stored(self):
        await llm_cache.set_semantic("chat", "explain the auth flow", None, 2000, "")
        assert await llm_cache.get_semantic("chat", "explain the auth flow", None, 2000) is None

    @pytest.mark.asyncio
    async def test_tiny_prompts_skipped(self):
        await llm_cache.set_semantic("chat", "hi", None, 2000, "x")
        assert await llm_cache.get_semantic("chat", "hi", None, 2000) is None

    @pytest.mark.asyncio
    async def test_system_and_max_tokens_participate_in_bucket(self):
        await llm_cache.set_semantic("chat", "explain the auth flow", "sys-a", 2000, "answer")
        # Different system prompt → different bucket → miss.
        assert await llm_cache.get_semantic(
            "chat", "explain the auth flow", "sys-b", 2000
        ) is None
        # Different max_tokens → different bucket → miss.
        assert await llm_cache.get_semantic(
            "chat", "explain the auth flow", "sys-a", 1000
        ) is None
        # Same everything → hit.
        assert await llm_cache.get_semantic(
            "chat", "explain the auth flow", "sys-a", 2000
        ) is not None

    @pytest.mark.asyncio
    async def test_bucket_cap_evicts_oldest(self, monkeypatch):
        monkeypatch.setattr(llm_cache, "BUCKET_CAP", 3)
        for i in range(5):
            await llm_cache.set_semantic(
                "chat", f"topic about number {i}", None, 2000, f"reply-{i}"
            )
        bucket = llm_cache._semantic_bucket_key("chat", None, 2000, "global")
        entries = llm_cache._LOCAL_SEM[bucket]
        assert len(entries) == 3
        # Oldest two were dropped, newest three remain.
        for i in (3, 4):
            assert any(f"reply-{i}" == e["r"] for _, e in entries.values())
        assert not any(e["r"] == "reply-0" for _, e in entries.values())

    @pytest.mark.asyncio
    async def test_expired_entries_pruned_on_read(self, monkeypatch):
        await llm_cache.set_semantic(
            "chat", "explain the auth flow", None, 2000, "answer", ttl=60
        )
        bucket = llm_cache._semantic_bucket_key("chat", None, 2000, "global")
        assert len(llm_cache._LOCAL_SEM.get(bucket, {})) == 1

        # Freeze time far past the TTL — the entry is pruned and missed.
        monkeypatch.setattr(llm_cache.time, "time", lambda: 10**12)
        assert await llm_cache.get_semantic(
            "chat", "explain the auth flow", None, 2000
        ) is None
        assert llm_cache._LOCAL_SEM.get(bucket) == {}

    @pytest.mark.asyncio
    async def test_exact_evict_cascades_to_semantic(self):
        prompt = "explain the auth flow"
        await llm_cache.set_cached("chat", prompt, None, 2000, "exact-answer")
        await llm_cache.set_semantic("chat", prompt, None, 2000, "sem-answer")
        assert await llm_cache.get_semantic("chat", prompt, None, 2000) is not None

        await llm_cache.evict("chat", prompt, None, 2000)
        assert await llm_cache.get_cached("chat", prompt, None, 2000) is None
        # Invalidation must not leave a stale near-duplicate answer behind.
        assert await llm_cache.get_semantic("chat", prompt, None, 2000) is None


class TestRouterSemanticIntegration:
    """Real LLMRouter: near-duplicates hit the semantic tier, exact repeats
    the exact tier, and adversarial rewrites fall through to the provider."""

    def _router_with_fake_complete(self, monkeypatch, answer="Paris is the capital of France"):
        router = LLMRouter()

        async def fake_complete(chain, prompt, system, max_tokens):
            return answer, chain[0]

        monkeypatch.setattr(router, "_complete", fake_complete)
        monkeypatch.setattr(router, "_initialize_providers", lambda: None)
        return router

    @pytest.mark.asyncio
    async def test_chat_near_duplicate_served_without_provider(self, monkeypatch):
        router = self._router_with_fake_complete(monkeypatch)

        r1 = await router.chat("What is the capital of France?", query_type=QueryType.CHAT)
        assert r1 == "Paris is the capital of France"
        assert router.last_cache_hit is False

        # Near-duplicate (case/punctuation noise): semantic hit, no provider.
        r2 = await router.chat("what is the capital of france", query_type=QueryType.CHAT)
        assert r2 == "Paris is the capital of France"
        assert router.last_cache_hit is True
        assert router.last_route["served"] == "cache/semantic"
        assert router.last_route["provider"] == "cache"
        assert router.last_route["price_in"] == 0.0
        assert router.last_route["similarity"] >= llm_cache.DEFAULT_SEMANTIC_THRESHOLD
        # last_similarity keeps the raw cosine; the route rounds to 4dp.
        assert round(router.last_similarity, 4) == router.last_route["similarity"]

        # One-word rewrite: falls through to the provider again.
        r3 = await router.chat("what is the capital of spain", query_type=QueryType.CHAT)
        assert r3 == "Paris is the capital of France"
        assert router.last_cache_hit is False
        assert router.last_route["provider"] != "cache"

    @pytest.mark.asyncio
    async def test_exact_repeat_still_prefers_exact_tier(self, monkeypatch):
        router = self._router_with_fake_complete(monkeypatch)

        await router.chat("What is the capital of France?", query_type=QueryType.CHAT)
        r2 = await router.chat("What is the capital of France?", query_type=QueryType.CHAT)
        assert r2 == "Paris is the capital of France"
        assert router.last_cache_hit is True
        assert router.last_route["served"] == "cache/redis"  # exact tier wins

    @pytest.mark.asyncio
    async def test_openai_chat_semantic_hit_shape(self, monkeypatch):
        router = self._router_with_fake_complete(monkeypatch)

        content, served, route = await router.openai_chat("What is the capital of France?", model="chat")
        assert served != "cache/semantic"
        assert router.last_cache_hit is False

        content2, served2, route2 = await router.openai_chat("what is the capital of france", model="chat")
        assert content2 == "Paris is the capital of France"
        assert served2 == "cache/semantic"
        assert route2["provider"] == "cache"
        assert route2["similarity"] >= llm_cache.DEFAULT_SEMANTIC_THRESHOLD
        assert router.last_cache_hit is True
