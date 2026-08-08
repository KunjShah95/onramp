"""Tests for the AI agent catalog (GET /ai/agents).

The catalog exposes each agent's declared query type and the primary model
that would serve it, so frontends can show the routing map.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.llm import QueryType
from app.api.v1.ai_gateway import _agent_query_type, _query_type_model


class _FakeLLM:
    """Mini router: resolves query types to their primary provider/model."""

    _PRIMARY = {
        QueryType.CODE: "anthropic",
        QueryType.REASONING: "gemini",
        QueryType.STRUCTURED: "groq",
        QueryType.CREATIVE: "anthropic",
    }
    _MODEL = {
        "anthropic": "anthropic/claude-3-5-sonnet-20241022",
        "gemini": "gemini/gemini-2.5-flash",
        "groq": "groq/llama-3.3-70b-versatile",
    }

    def resolve_route(self, query_type):
        provider = self._PRIMARY.get(query_type, "groq")
        return [provider]

    def route_info(self, provider, query_type=None):
        # Real routers compute served from the provider alone.
        return {"provider": provider, "served": self._MODEL.get(provider, "groq/llama-3.3-70b-versatile")}


def _app(llm=None):
    from app.api.v1 import ai_gateway

    application = FastAPI()
    application.state.llm = llm
    application.include_router(ai_gateway.router, prefix="/api/v1")
    return application


class TestAgentQueryTypeHelpers:
    def test_known_agent_resolves_query_type(self):
        info = {"module": "app.agents.pr_review", "class": "PRReviewAgent"}
        assert _agent_query_type(info) == QueryType.CODE.value

    def test_reasoning_agents(self):
        assert _agent_query_type({"module": "app.agents.architecture_explorer", "class": "ArchitectureExplorer"}) == "reasoning"
        assert _agent_query_type({"module": "app.agents.repo_qa", "class": "RepoQA"}) == "reasoning"

    def test_broken_agent_returns_none(self):
        assert _agent_query_type({"module": "no.such.module", "class": "Nope"}) is None

    def test_query_type_model_resolves(self):
        llm = _FakeLLM()
        assert _query_type_model(llm, "code") == "anthropic/claude-3-5-sonnet-20241022"
        assert _query_type_model(llm, "reasoning") == "gemini/gemini-2.5-flash"

    def test_query_type_model_none_without_llm(self):
        assert _query_type_model(None, "code") is None
        assert _query_type_model(_FakeLLM(), None) is None

    def test_query_type_model_guards_empty_chain(self):
        """A configured router with zero available providers must not 500."""

        class _EmptyChainLLM:
            def resolve_route(self, query_type):
                return []  # no API keys configured → no providers

            def route_info(self, provider):
                raise AssertionError("route_info must not be called on an empty chain")

        assert _query_type_model(_EmptyChainLLM(), "code") is None

    def test_query_type_model_guards_unknown_type(self):
        """An unknown query type must not raise on enum coercion."""
        assert _query_type_model(_FakeLLM(), "not-a-real-type") is None


class TestAgentsEndpoint:
    def test_catalog_includes_query_type_and_model(self):
        resp = TestClient(_app(_FakeLLM())).get("/api/v1/ai/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 9
        by_name = {a["name"]: a for a in data["agents"]}

        explore = by_name["explore"]
        assert explore["query_type"] == "reasoning"
        assert explore["model"] == "gemini/gemini-2.5-flash"
        assert explore["credit_cost"] > 0

        pr_review = by_name["pr-review"]
        assert pr_review["query_type"] == "code"
        assert pr_review["model"] == "anthropic/claude-3-5-sonnet-20241022"

        health = by_name["health"]
        assert health["query_type"] == "structured"
        assert health["model"] == "groq/llama-3.3-70b-versatile"

    def test_catalog_graceful_without_llm(self):
        """Without a router, query types still resolve but model is null."""
        resp = TestClient(_app(None)).get("/api/v1/ai/agents")
        assert resp.status_code == 200
        by_name = {a["name"]: a for a in resp.json()["agents"]}
        assert by_name["explore"]["query_type"] == "reasoning"
        assert by_name["explore"]["model"] is None
