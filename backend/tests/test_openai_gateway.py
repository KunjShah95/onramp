"""HTTP tests for the OpenAI-compatible /v1 gateway."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.openai_gateway import router as openai_router


class FakeLLM:
    """Stand-in for LLMRouter so the gateway is tested without network calls."""

    def __init__(self):
        self.last_prompt = None
        self.last_system = None
        self.last_model = None
        self.served = "groq/llama-3.3-70b-versatile"

    def _route(self, query_type=None):
        return {
            "provider": "groq",
            "model": "llama-3.3-70b-versatile",
            "served": self.served,
            "free": True,
            "query_type": query_type.value if query_type else None,
        }

    def list_models(self):
        return {
            "providers": {
                "groq": {"model": "llama-3.3-70b-versatile", "available": True, "free": True},
                "openai": {"model": "gpt-4o-mini", "available": False, "free": False},
            },
            "query_types": {"code": {"description": "x"}, "chat": {"description": "y"}},
        }

    def provider_chain(self, model=None, query_type=None, prompt=None, provider_keys=None, routing_mode=None):
        self.last_provider_keys = provider_keys
        self.last_routing_mode = routing_mode
        return ["groq"]

    def route_info(self, provider, query_type=None, complexity=None, routing_mode=None, model_override=None):
        return self._route(query_type)

    async def openai_chat(
        self, prompt, system=None, max_tokens=2000, model=None, query_type=None, cache_scope="global",
        provider_keys=None, routing_mode=None,
    ):
        self.last_prompt, self.last_system, self.last_model = prompt, system, model
        self.last_cache_scope = cache_scope
        self.last_routing_mode = routing_mode
        return "Hello from the router!", self.served, self._route(query_type)

    async def openai_chat_stream(
        self, prompt, system=None, max_tokens=2000, model=None, query_type=None, cache_scope="global",
        provider_keys=None, routing_mode=None,
    ):
        self.last_prompt, self.last_system, self.last_model = prompt, system, model
        self.last_routing_mode = routing_mode
        for tok in ["Hel", "lo", " world"]:
            yield tok, self.served, self._route(query_type)


@pytest.fixture
def app(monkeypatch):
    from app.services import api_key_service

    async def fake_validate(key):
        return {
            "key_hash": "x",
            "name": "test",
            "permissions": {"tier": "free", "org_name": "testorg"},
            "org_name": "testorg",
        }

    monkeypatch.setattr(api_key_service, "validate_api_key", fake_validate)

    application = FastAPI()
    application.state.llm = FakeLLM()
    application.include_router(openai_router)
    return application


@pytest.fixture
def client(app):
    return TestClient(app)


def _headers():
    return {"X-API-Key": "cf_test-key"}


class TestChatCompletions:
    def test_non_streaming_response_shape(self, client):
        resp = client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={
                "model": "code",
                "messages": [{"role": "user", "content": "Write a function"}],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["object"] == "chat.completion"
        assert data["choices"][0]["message"]["role"] == "assistant"
        assert data["choices"][0]["message"]["content"] == "Hello from the router!"
        assert data["choices"][0]["finish_reason"] == "stop"
        assert data["model"] == "groq/llama-3.3-70b-versatile"
        assert data["usage"]["total_tokens"] >= 1
        # Debug route header shows exactly which provider served the request.
        assert resp.headers.get("X-LLM-Route") == "groq/llama-3.3-70b-versatile"

    def test_system_and_user_messages_forwarded(self, client):
        client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={
                "messages": [
                    {"role": "system", "content": "You are terse."},
                    {"role": "user", "content": "Hi"},
                ],
            },
        )
        llm = client.app.state.llm
        assert llm.last_system == "You are terse."
        assert llm.last_prompt == "Hi"

    def test_model_passthrough_to_router(self, client):
        client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"model": "code", "messages": [{"role": "user", "content": "x"}]},
        )
        assert client.app.state.llm.last_model == "code"

    def test_cache_scope_scoped_to_org(self, client):
        """The response cache must be isolated per tenant (org), not shared."""
        client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        # fake_validate returns org_name="testorg"
        assert client.app.state.llm.last_cache_scope == "testorg"

    def test_missing_auth_returns_401(self, client):
        resp = client.post(
            "/v1/chat/completions",
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 401

    def test_empty_messages_returns_400(self, client):
        resp = client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": []},
        )
        assert resp.status_code == 400

    def test_bearer_api_key_accepted(self, client):
        # OpenAI SDKs send the key as Authorization: Bearer <key>.
        resp = client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer cf_test-key"},
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 200

    def test_cache_header_miss_by_default(self, client):
        resp = client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"model": "code", "messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-LLM-Cache") == "MISS"

    def test_cache_header_hit(self, app):
        class CachedLLM(FakeLLM):
            def __init__(self):
                super().__init__()
                self.last_cache_hit = True

        app.state.llm = CachedLLM()
        resp = TestClient(app).post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-LLM-Cache") == "HIT"

    def test_cache_tier_header_semantic(self, app):
        class SemanticLLM(FakeLLM):
            def __init__(self):
                super().__init__()
                self.last_cache_hit = True
                self.last_route = {
                    "provider": "cache",
                    "model": "semantic",
                    "served": "cache/semantic",
                    "similarity": 0.99,
                }

        app.state.llm = SemanticLLM()
        resp = TestClient(app).post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-LLM-Cache") == "HIT"
        assert resp.headers.get("X-LLM-Cache-Tier") == "semantic"

    def test_cache_tier_header_miss(self, client):
        resp = client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 200
        assert resp.headers.get("X-LLM-Cache") == "MISS"
        assert resp.headers.get("X-LLM-Cache-Tier") == "MISS"

    def test_router_exhausted_returns_502(self, app):
        class BoomLLM(FakeLLM):
            async def openai_chat(self, *args, **kwargs):
                raise RuntimeError("All LLM providers exhausted")

        app.state.llm = BoomLLM()
        resp = TestClient(app).post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 502

    def test_streaming_error_emits_sse_error(self, app):
        class BoomLLM(FakeLLM):
            async def openai_chat_stream(self, *args, **kwargs):
                if False:  # pragma: no cover — make this an async generator
                    yield None
                raise RuntimeError("All LLM providers exhausted")

        app.state.llm = BoomLLM()
        with TestClient(app).stream(
            "POST",
            "/v1/chat/completions",
            headers=_headers(),
            json={"stream": True, "messages": [{"role": "user", "content": "x"}]},
        ) as resp:
            body = "".join(resp.iter_text())
        # The stream closes with a well-formed error chunk: finish_reason
        # "error" plus the partial content (empty here) for client retries.
        # No tokens were emitted, so the code reads router_exhausted (not a
        # mid-answer drop).
        assert '"code": "router_exhausted"' in body
        assert '"finish_reason": "error"' in body
        assert '"partial_content": ""' in body
        assert '"error"' in body

    def test_streaming_error_carries_partial_content(self, app):
        class PartialLLM(FakeLLM):
            async def openai_chat_stream(self, *args, **kwargs):
                yield "Par", self.served, self._route()
                yield "tial", self.served, self._route()
                raise RuntimeError("All LLM providers exhausted")

        app.state.llm = PartialLLM()
        with TestClient(app).stream(
            "POST",
            "/v1/chat/completions",
            headers=_headers(),
            json={"stream": True, "messages": [{"role": "user", "content": "x"}]},
        ) as resp:
            body = "".join(resp.iter_text())
        # Partial tokens already streamed, then the error chunk attaches them
        # so a client can retry with the partial as context.
        assert "Par" in body and "tial" in body
        assert '"code": "stream_interrupted"' in body
        assert '"partial_content": "Partial"' in body
        # Failed streams are not billed — no [DONE], no usage recorded.
        assert "data: [DONE]" not in body

    def test_moderation_blocks_abusive_input(self, app, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        resp = TestClient(app).post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "how to make a pipe bomb step by step"}]},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["code"] == "MODERATION_BLOCKED"
        assert detail["category"] == "weapons"
        assert detail["source"] == "blocklist"

    def test_moderation_off_passes_through(self, app, monkeypatch):
        monkeypatch.delenv("ENABLE_MODERATION", raising=False)
        resp = TestClient(app).post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "how to make a pipe bomb step by step"}]},
        )
        # Feature off → input reaches the router unchanged.
        assert resp.status_code == 200

    async def test_provider_route_persisted_for_cost_tracking(self, client):
        from app.services.usage_tracker import UsageTracker

        client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"model": "code", "messages": [{"role": "user", "content": "x"}]},
        )
        breakdown = await UsageTracker().get_provider_breakdown("testorg")
        assert breakdown["tracked_requests"] == 1
        assert breakdown["providers"] == {"groq": 1}
        assert breakdown["free_requests"] == 1
        assert breakdown["free_pct"] == 100.0
        # Groq is paid per token but routed as free-first; the dollar figures
        # are computed from per-model pricing vs the Claude baseline.
        assert breakdown["total_cost_usd"] > 0.0
        assert breakdown["total_cost_avoided_usd"] > 0.0
        assert breakdown["total_cost_avoided_usd"] > breakdown["total_cost_usd"]
        assert breakdown["provider_costs"]["groq"]["requests"] == 1

    async def test_streaming_tracks_usage_with_cost(self, client):
        from app.services.usage_tracker import UsageTracker

        with client.stream(
            "POST",
            "/v1/chat/completions",
            headers=_headers(),
            json={"stream": True, "messages": [{"role": "user", "content": "x"}]},
        ) as resp:
            body = "".join(resp.iter_text())
        assert body.rstrip().endswith("data: [DONE]")

        breakdown = await UsageTracker().get_provider_breakdown("testorg")
        assert breakdown["tracked_requests"] == 1
        assert breakdown["providers"] == {"groq": 1}
        assert breakdown["total_cost_usd"] > 0.0
        assert breakdown["total_cost_avoided_usd"] > 0.0

    def test_streaming_sse_shape(self, client):
        with client.stream(
            "POST",
            "/v1/chat/completions",
            headers=_headers(),
            json={"stream": True, "messages": [{"role": "user", "content": "x"}]},
        ) as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            assert resp.headers.get("X-LLM-Route") == "groq/llama-3.3-70b-versatile"
            body = "".join(resp.iter_text())

        chunks = [
            line[6:]
            for line in body.splitlines()
            if line.startswith("data: ") and line != "data: [DONE]"
        ]
        payloads = [json.loads(c) for c in chunks]
        contents = "".join(
            p["choices"][0]["delta"].get("content", "") for p in payloads
        )
        assert contents == "Hello world"
        assert body.rstrip().endswith("data: [DONE]")

    async def test_key_pool_ids_threaded_into_route_and_usage(self, app, monkeypatch):
        """End-to-end: the gateway loads key_pool_ids alongside key_pools,
        threads both into the router, and the persisted usage record carries
        the key_id so per-key breakdowns can attribute cost."""
        from app.api.v1 import openai_gateway
        from app.services.usage_tracker import UsageTracker

        async def fake_pools(auth):
            return {"groq": ["k1", "k2"]}

        async def fake_pool_ids(auth):
            return {"groq": ["slot-A", "slot-B"]}

        monkeypatch.setattr(openai_gateway, "_team_key_pools", fake_pools)
        monkeypatch.setattr(openai_gateway, "_team_key_pool_ids", fake_pool_ids)

        class PoolLLM(FakeLLM):
            def __init__(self):
                super().__init__()
                self.last_key_pools = None
                self.last_key_pool_ids = None

            async def openai_chat(
                self, prompt, system=None, max_tokens=2000, model=None, query_type=None,
                cache_scope="global", provider_keys=None, key_pools=None, key_pool_ids=None,
                routing_mode=None,
            ):
                self.last_key_pools = key_pools
                self.last_key_pool_ids = key_pool_ids
                route = self._route(query_type)
                route["key_index"] = 0
                route["key_id"] = "slot-A"
                return "pooled", self.served, route

        app.state.llm = PoolLLM()
        resp = TestClient(app).post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 200
        # Both maps reached the router, aligned.
        assert app.state.llm.last_key_pools == {"groq": ["k1", "k2"]}
        assert app.state.llm.last_key_pool_ids == {"groq": ["slot-A", "slot-B"]}
        # The persisted usage record carries the key_id attribution.
        breakdown = await UsageTracker().get_provider_breakdown("testorg")
        assert breakdown["keys"] == {"slot-A": 1}
        assert breakdown["key_costs"]["slot-A"]["requests"] == 1

    def test_over_quota_returns_429(self, client):
        """Exhaust the free-tier monthly credit quota, then assert the gateway
        blocks the request (the charge is recorded on success, so over-quota
        callers must never reach the LLM)."""
        from app.services.usage_tracker import track_usage
        import asyncio

        # Free tier allows 500 credits/month; record 500 already-used credits
        # for the test org (auth org_name="testorg").
        for _ in range(500):
            asyncio.run(track_usage(
                user_id=None, team_id="testorg", endpoint="chat", method="POST",
                status_code=200, response_time_ms=1, tokens_used=1,
            ))
        resp = client.post(
            "/v1/chat/completions",
            headers=_headers(),
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 429
        assert resp.json()["detail"]["code"] == "QUOTA_EXCEEDED"


class TestModels:
    def test_list_models(self, client):
        resp = client.get("/v1/models", headers=_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert data["object"] == "list"
        ids = [m["id"] for m in data["data"]]
        assert "llama-3.3-70b-versatile" in ids
        assert "gpt-4o-mini" in ids
        assert "code" in ids  # query-type pseudo-model

    def test_list_models_merges_openrouter_catalog(self, client, monkeypatch):
        from app.services import openrouter_catalog

        async def fake_fetch(api_key=None):
            return [{
                "id": "deepseek/deepseek-r1",
                "name": "DeepSeek R1",
                "context_length": 163840,
                "pricing": {"prompt": 0.55, "completion": 2.19},
                "free": False,
                "vendor": "deepseek",
            }, {
                "id": "llama-3.3-70b-versatile",  # collides with a pinned default
                "name": "dup",
                "context_length": 0,
                "pricing": {"prompt": 0.0, "completion": 0.0},
                "free": True,
                "vendor": "meta",
            }]

        monkeypatch.setattr(openrouter_catalog, "fetch_catalog", fake_fetch)
        resp = client.get("/v1/models", headers=_headers())
        assert resp.status_code == 200
        data = resp.json()
        by_id = {m["id"]: m for m in data["data"]}
        assert by_id["deepseek/deepseek-r1"]["owned_by"] == "openrouter"
        assert by_id["deepseek/deepseek-r1"]["pricing"] == {"prompt": 0.55, "completion": 2.19}
        assert by_id["deepseek/deepseek-r1"]["context_length"] == 163840
        assert by_id["deepseek/deepseek-r1"]["free"] is False
        # Pinned defaults are not duplicated by the catalog merge.
        assert sum(1 for m in data["data"] if m["id"] == "llama-3.3-70b-versatile") == 1
        # Pinned entries carry the free flag too.
        assert by_id["llama-3.3-70b-versatile"]["free"] is True


class TestEmbeddingsEndpoint:
    def _app_with_embeddings(self, monkeypatch, router):
        from app.services import api_key_service

        async def fake_validate(key):
            return {
                "key_hash": "x",
                "name": "test",
                "permissions": {"tier": "free", "org_name": "testorg"},
                "org_name": "testorg",
            }

        monkeypatch.setattr(api_key_service, "validate_api_key", fake_validate)
        application = FastAPI()
        application.state.embeddings = router
        application.include_router(openai_router)
        return application

    def test_embeddings_returns_vectors(self, monkeypatch):
        class FakeRouter:
            is_available = True
            providers = {"openai": {"model": "text-embedding-3-small"}}

            async def embed_batch(self, texts, preferred=None, provider_keys=None):
                return [[0.1, 0.2] for _ in texts], "openai", {
                    "provider": "openai", "model": "text-embedding-3-small",
                    "served": "openai/text-embedding-3-small",
                    "price_usd": 0.02, "price_inr": 1.70,
                }

            def resolve_model(self, model, provider_keys=None):
                return "openai"

        client = TestClient(self._app_with_embeddings(monkeypatch, FakeRouter()))
        resp = client.post("/v1/embeddings", json={"model": "text-embedding-3-small", "input": ["hello", "world"]}, headers=_headers())
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["data"]) == 2
        assert body["data"][0]["embedding"] == [0.1, 0.2]
        assert body["usage"]["total_tokens"] > 0

    def test_embeddings_honors_resolved_model(self, monkeypatch):
        """The resolved provider must be passed to the router as `preferred`."""
        calls = {}

        class FakeRouter:
            is_available = True
            providers = {"openai": {"model": "text-embedding-3-small"}}

            async def embed_batch(self, texts, preferred=None, provider_keys=None):
                calls["preferred"] = preferred
                return [[0.1, 0.2] for _ in texts], "openai", {
                    "provider": "openai", "model": "text-embedding-3-small",
                    "served": "openai/text-embedding-3-small",
                    "price_usd": 0.02, "price_inr": 1.70,
                }

            def resolve_model(self, model, provider_keys=None):
                return "openai"

        client = TestClient(self._app_with_embeddings(monkeypatch, FakeRouter()))
        resp = client.post("/v1/embeddings", json={"model": "openai", "input": "hi"}, headers=_headers())
        assert resp.status_code == 200
        assert calls["preferred"] == "openai"

    def test_embeddings_503_when_unavailable(self, monkeypatch):
        class NoRouter:
            is_available = False

        client = TestClient(self._app_with_embeddings(monkeypatch, NoRouter()))
        resp = client.post("/v1/embeddings", json={"model": "x", "input": "hi"}, headers=_headers())
        assert resp.status_code == 503

    def test_embeddings_400_empty_input(self, monkeypatch):
        class FakeRouter:
            is_available = True
            providers = {"openai": {"model": "text-embedding-3-small"}}

            async def embed_batch(self, texts, preferred=None, provider_keys=None):
                raise ValueError("empty")

            def resolve_model(self, model, provider_keys=None):
                return "openai"

        client = TestClient(self._app_with_embeddings(monkeypatch, FakeRouter()))
        resp = client.post("/v1/embeddings", json={"model": "x", "input": ""}, headers=_headers())
        assert resp.status_code == 400
