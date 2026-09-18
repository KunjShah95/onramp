"""Reliability fixes — scoped tests for Remaining Work §1 items.

Covers: explore 502-on-None (1.2), broadcast null-safety (1.4),
repo-context evict warning (1.5), route-header warnings (1.6),
OpenAPI 404 responses (1.7), Gemini timeout + circuit-breaker (1.8),
013 migration chain (1.10).
"""
import importlib.util
import logging
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.llm_route import attach_served_route_header, primary_route_header
from app.llm import ModelProvider, QueryType

_VERSIONS = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _load_revision(filename):
    path = _VERSIONS / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ── 1.2: explore returns 502 (not 200/None) when the explorer yields nothing ─


def _build_explore_app(monkeypatch, explorer_cls):
    from app.api.v1 import explore as explore_module

    monkeypatch.setattr(explore_module, "ArchitectureExplorer", explorer_cls)
    application = FastAPI()
    application.state.llm = SimpleNamespace(last_route=None)

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = {"uid": "u1", "email": "t@t.com", "name": "T"}
            return await call_next(request)

    application.add_middleware(_SetUser)
    application.include_router(explore_module.router, prefix="/api/v1")
    return application


def test_explore_none_result_returns_502(monkeypatch):
    class _NoneExplorer:
        def __init__(self, llm, github_token=None, session_id=None):
            pass

        async def execute(self, **kwargs):
            return None

    client = TestClient(_build_explore_app(monkeypatch, _NoneExplorer))
    resp = client.post(
        "/api/v1/explore/analyze",
        json={"repo_url": "https://github.com/owner/repo"},
    )
    assert resp.status_code == 502
    assert "no result" in resp.json()["detail"]


# ── 1.4: broadcast is null-safe ───────────────────────────────────────────


async def test_broadcast_none_task_no_raise():
    from app.services import task_service as ts

    await ts._broadcast_task_update(None)
    await ts._broadcast_task_update({})
    await ts._broadcast_task_update({"task_id": "t", "assigned_to": None})


# ── 1.5: repo-context evict logs Redis failures ───────────────────────────


async def test_evict_redis_failure_warns_with_key(monkeypatch, caplog):
    import app.services.repo_context as rc

    class _FailRedis:
        async def delete(self, key):
            raise RuntimeError("redis down")

    async def _fake_redis():
        return _FailRedis()

    monkeypatch.setattr(rc, "_redis", _fake_redis)
    service = rc.RepoContextService()
    with caplog.at_level(logging.WARNING, logger="onramp.repo_context"):
        assert await service.evict("some-index") is False
    assert any(
        "repo:ctx:some-index" in r.message for r in caplog.records
    ), "evict must log the failing key at WARNING"


# ── 1.6: route-header failures warn (with route context) ──────────────────


def test_primary_route_header_failure_warns(caplog):
    class _Boom:
        def resolve_route(self, query_type=None):
            raise RuntimeError("boom")

    with caplog.at_level(logging.WARNING, logger="onramp.llm_route"):
        assert primary_route_header(_Boom(), QueryType.CHAT) == "onramp"
    assert any(
        "Failed to resolve primary route header" in r.message
        and "CHAT" in r.message
        for r in caplog.records
    )


def test_attach_route_header_failure_warns(caplog):
    class _BoomLLM:
        @property
        def last_route(self):
            raise RuntimeError("boom")

    with caplog.at_level(logging.WARNING, logger="onramp.llm_route"):
        assert attach_served_route_header(_BoomLLM(), None, SimpleNamespace(headers={})) is False
    assert any("Failed to attach served route header" in r.message for r in caplog.records)


# ── 1.7: explicit 404s in OpenAPI ─────────────────────────────────────────


def _route_has_404(router, suffix, method):
    for route in router.routes:
        if route.path.endswith(suffix) and method in (route.methods or set()):
            return 404 in (route.responses or {})
    raise AssertionError(f"route {method} {suffix} not found on {router.prefix}")


def test_openapi_404_playbooks():
    from app.api.v1.playbooks import router

    for method in ("GET", "PATCH", "DELETE"):
        assert _route_has_404(router, "/{playbook_id}", method)


def test_openapi_404_tasks():
    from app.api.v1.tasks import router

    for method in ("GET", "PATCH", "DELETE"):
        assert _route_has_404(router, "/{task_id}", method)
    for method in ("PATCH", "DELETE"):
        assert _route_has_404(router, "/templates/{template_id}", method)


def test_openapi_404_teams():
    from app.api.v1.teams import router

    assert _route_has_404(router, "/{team_id}", "GET")
    assert _route_has_404(router, "/{team_id}/subscription", "GET")


def test_openapi_404_keys():
    from app.api.v1.ai_gateway import router

    assert _route_has_404(router, "/keys/{key_id}", "DELETE")
    assert _route_has_404(router, "/keys/{key_id}/rotate", "POST")
    assert _route_has_404(router, "/keys/{org_name}/providers/{provider}", "DELETE")
    assert _route_has_404(
        router, "/keys/{org_name}/providers/{provider}/keys/{key_id}", "DELETE"
    )


# ── 1.8: Gemini timeout + circuit-breaker ─────────────────────────────────


def test_gemini_timeouts_configured():
    from app.llm import LLMRouter

    router = LLMRouter()
    assert router.gemini_timeout > 0
    assert router.gemini_stream_timeout > 0


async def test_gemini_call_enforces_timeout(monkeypatch):
    import asyncio

    from app.llm import LLMRouter

    async def _hang(**kwargs):
        await asyncio.sleep(30)
        return SimpleNamespace(text="never")

    fake_models = SimpleNamespace(generate_content=_hang)
    fake_aio = SimpleNamespace(models=fake_models)
    fake_genai = types.SimpleNamespace(
        Client=lambda api_key: SimpleNamespace(aio=fake_aio),
    )
    fake_types = types.SimpleNamespace(
        GenerateContentConfig=lambda **kwargs: object(),
    )
    fake_genai.types = fake_types
    fake_google = types.ModuleType("google")
    fake_google.genai = fake_genai
    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai)
    monkeypatch.setitem(sys.modules, "google.genai.types", fake_types)

    router = LLMRouter()
    router.gemini_timeout = 0.05
    with pytest.raises(Exception):
        await router._call_gemini_sdk(
            {"api_key": "k", "model": "m"}, "hello", None, 10
        )


async def test_complete_records_circuit_breaker_health(monkeypatch):
    from app.llm import LLMRouter

    router = LLMRouter()

    async def _always_fail(provider, *args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(router, "_call_provider", _always_fail)
    with pytest.raises(RuntimeError, match="exhausted"):
        await router._complete([ModelProvider.GROQ], "hi", None, 10)
    snapshot = router.health.snapshot()
    assert snapshot["groq"]["sample_size"] == 1
    assert snapshot["groq"]["success_rate"] < 0.7


# ── 1.10: 013 placeholder slots the chain ─────────────────────────────────


def test_migration_chain_012_013_014():
    m12 = _load_revision("012_add_hr_role_to_team_members.py")
    m13 = _load_revision("013_placeholder.py")
    m14 = _load_revision("014_add_owner_role_to_team_members.py")
    assert m12.revision == "012_add_hr_role"
    assert m13.revision == "013_placeholder"
    assert m13.down_revision == "012_add_hr_role"
    assert m14.down_revision == "013_placeholder"
