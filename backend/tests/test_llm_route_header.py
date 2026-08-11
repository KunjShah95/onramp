"""Tests for the X-LLM-Route debug header on internal LLM-backed endpoints.

Covers the shared helpers in app/api/v1/llm_route.py and their wiring into
``/ask`` (query + query/stream) and ``/explore/analyze``.
"""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.llm import QueryType
from app.api.v1.llm_route import attach_served_route_header, primary_route_header

_SERVED = "groq/llama-3.3-70b-versatile"


class FakeRouter:
    """Stand-in for LLMRouter: records a *fresh* last_route on every call."""

    def __init__(self):
        self.last_route = None
        self.last_chat_kwargs = {}
        self.last_stream_kwargs = {}

    @staticmethod
    def _route(query_type=None):
        return {
            "provider": "groq",
            "model": "llama-3.3-70b-versatile",
            "served": _SERVED,
            "free": True,
            "query_type": query_type.value if query_type else None,
        }

    async def chat(self, prompt, system=None, max_tokens=2000, query_type=None, **kwargs):
        self.last_chat_kwargs = kwargs
        self.last_route = self._route(query_type)
        return "patched-answer"

    def chat_stream(self, prompt, system=None, max_tokens=2000, query_type=None, **kwargs):
        self.last_stream_kwargs = kwargs

        async def _gen():
            self.last_route = self._route(query_type)
            yield "tok1"
            yield "tok2"

        return _gen()

    def resolve_route(self, query_type=None):
        return ["groq"]

    def provider_chain(self, model=None, query_type=None, prompt=None):
        return ["groq"]

    def route_info(self, provider, query_type=None):
        return self._route(query_type)


class TestPrimaryRouteHeader:
    """Best-effort header for pre-stream requests."""

    def test_uses_explicit_query_type(self):
        assert primary_route_header(FakeRouter(), QueryType.REASONING) == _SERVED

    def test_uses_prompt_classification_when_no_query_type(self):
        assert primary_route_header(FakeRouter(), prompt="write a python function") == _SERVED

    def test_none_llm_falls_back(self):
        assert primary_route_header(None) == "onramp"

    def test_llm_without_route_methods_falls_back(self):
        class Bare:
            def resolve_route(self, query_type=None):
                raise RuntimeError("boom")

        assert primary_route_header(Bare()) == "onramp"


class TestAttachServedRouteHeader:
    """Authoritative header set only when a fresh route was recorded."""

    def test_sets_header_when_route_changed(self):
        llm = FakeRouter()
        llm.last_route = {"served": "stale/previous-request"}
        before = llm.last_route
        # A real call replaces last_route with a fresh dict.
        llm.last_route = {"served": _SERVED}
        response = SimpleNamespace(headers={})
        assert attach_served_route_header(llm, before, response) is True
        assert response.headers["X-LLM-Route"] == _SERVED

    def test_skips_when_route_unchanged(self):
        # No LLM call happened (e.g. fallback path) → don't report a stale route.
        llm = FakeRouter()
        llm.last_route = {"served": "stale/previous-request"}
        before = llm.last_route
        response = SimpleNamespace(headers={})
        assert attach_served_route_header(llm, before, response) is False
        assert "X-LLM-Route" not in response.headers

    def test_skips_when_no_route_at_all(self):
        response = SimpleNamespace(headers={})
        assert attach_served_route_header(FakeRouter(), None, response) is False

    def test_none_llm_never_raises(self):
        response = SimpleNamespace(headers={})
        assert attach_served_route_header(None, None, response) is False


# ── Endpoint integration ─────────────────────────────────────────────────────

def _build_app(monkeypatch, docs):
    """FastAPI app with the /ask + /explore routers and a stubbed LLM."""
    from app.api.v1 import ask as ask_module
    from app.api.v1 import explore as explore_module
    from app.services.embeddings_service import EmbeddingsService

    async def _noop(*args, **kwargs):
        return None

    async def _search(self, *args, **kwargs):
        return docs

    # Conversation service stub (get_relevant + add_turn)
    monkeypatch.setattr(
        ask_module, "_conversation",
        SimpleNamespace(get_relevant=_noop, add_turn=_noop),
    )
    monkeypatch.setattr(EmbeddingsService, "search", _search)

    class FakeExplorer:
        query_type = QueryType.REASONING

        def __init__(self, llm, github_token=None):
            self.llm = llm

        async def execute(self, **kwargs):
            await self.llm.chat("analyze this repo")
            return {"repo": kwargs.get("repo_url"), "services": []}

    monkeypatch.setattr(explore_module, "ArchitectureExplorer", FakeExplorer)

    application = FastAPI()
    application.state.llm = FakeRouter()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {
                "uid": "testuser",
                "email": "t@test.com",
                "name": "Test",
            }
            return await call_next(request)

    application.add_middleware(_SetUser)
    application.include_router(ask_module.router, prefix="/api/v1")
    application.include_router(explore_module.router, prefix="/api/v1")
    return application


def _ask_body():
    return {"index_id": "abc123", "question": "how does auth work?", "use_memory": True}


class TestAskEndpoint:
    def test_query_reports_served_provider(self, monkeypatch):
        doc = SimpleNamespace(filename="app/main.py", doc_type="source", content="print('hi')")
        client = TestClient(_build_app(monkeypatch, [doc]))
        resp = client.post("/api/v1/ask/query", json=_ask_body())
        assert resp.status_code == 200
        assert resp.json()["answer"] == "patched-answer"
        # LLM ran → authoritative header present.
        assert resp.headers.get("X-LLM-Route") == _SERVED

    def test_query_omits_header_on_non_llm_fallback(self, monkeypatch):
        # No documents → RepoQA returns fallback text without calling the LLM.
        client = TestClient(_build_app(monkeypatch, []))
        resp = client.post("/api/v1/ask/query", json=_ask_body())
        assert resp.status_code == 200
        assert "No relevant documents" in resp.json()["answer"]
        assert resp.headers.get("X-LLM-Route") is None

    def test_query_stream_reports_primary_provider(self, monkeypatch):
        doc = SimpleNamespace(filename="app/main.py", doc_type="source", content="print('hi')")
        client = TestClient(_build_app(monkeypatch, [doc]))
        with client.stream("POST", "/api/v1/ask/query/stream", json=_ask_body()) as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            # Best-effort header resolved before the stream starts.
            assert resp.headers.get("X-LLM-Route") == _SERVED
            body = "".join(resp.iter_text())
        assert "tok1" in body and "tok2" in body
        assert body.rstrip().endswith("data: [DONE]")

    def test_query_forwards_explicit_model_to_router(self, monkeypatch):
        """The picker's explicit model id must reach the router's chat call
        (query + stream), so it wins over the agent's REASONING default."""
        doc = SimpleNamespace(filename="app/main.py", doc_type="source", content="print('hi')")
        app = _build_app(monkeypatch, [doc])
        client = TestClient(app)
        body = _ask_body()
        body["model"] = "deepseek/deepseek-r1"

        resp = client.post("/api/v1/ask/query", json=body)
        assert resp.status_code == 200
        assert app.state.llm.last_chat_kwargs.get("model") == "deepseek/deepseek-r1"

    def test_query_without_model_keeps_auto_routing(self, monkeypatch):
        doc = SimpleNamespace(filename="app/main.py", doc_type="source", content="print('hi')")
        app = _build_app(monkeypatch, [doc])
        client = TestClient(app)
        resp = client.post("/api/v1/ask/query", json=_ask_body())
        assert resp.status_code == 200
        assert app.state.llm.last_chat_kwargs.get("model") is None

    def test_query_stream_forwards_explicit_model_to_router(self, monkeypatch):
        """The streaming path must thread the picker's model into ask_stream
        just like the non-streaming path."""
        doc = SimpleNamespace(filename="app/main.py", doc_type="source", content="print('hi')")
        app = _build_app(monkeypatch, [doc])
        client = TestClient(app)
        body = _ask_body()
        body["model"] = "qwen/qwen3-coder:32b"

        with client.stream("POST", "/api/v1/ask/query/stream", json=body) as resp:
            assert resp.status_code == 200
            body_out = "".join(resp.iter_text())
        assert "tok1" in body_out
        assert app.state.llm.last_stream_kwargs.get("model") == "qwen/qwen3-coder:32b"


class TestExploreEndpoint:
    def test_analyze_reports_served_provider(self, monkeypatch):
        client = TestClient(_build_app(monkeypatch, []))
        resp = client.post(
            "/api/v1/explore/analyze",
            json={"repo_url": "https://github.com/owner/repo"},
        )
        assert resp.status_code == 200
        assert resp.json()["repo"] == "https://github.com/owner/repo"
        # FakeExplorer ran an LLM call → authoritative header present.
        assert resp.headers.get("X-LLM-Route") == _SERVED
