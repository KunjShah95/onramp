"""Tests for query-type routing wired into the agents."""

import pytest
from unittest.mock import AsyncMock

from app.llm import LLMRouter, QueryType
from app.agents.base_agent import BaseAgent, _RoutedLLM
from app.agents.architecture_explorer import ArchitectureExplorer
from app.agents.health_scorer import HealthScorer
from app.agents.pattern_recognition import PatternRecognition
from app.agents.learning_path_generator import LearningPathGenerator
from app.agents.pr_review import PRReviewAgent
from app.agents.first_pr_accelerator import FirstPRAccelerator
from app.agents.drift_detector import DriftDetector
from app.agents.codebase_trailer import CodebaseTrailer
from app.agents.coding_agent import AutonomousCodingAgent
from app.agents.silent_pair_programming import SilentPairProgramming
from app.agents.task_qa import TaskQA
from app.agents.repo_qa import RepoQA
from app.agents.quiz_generator import QuizGenerator
from app.agents.regression_test_generator import RegressionTestGenerator


class TestAgentQueryTypeDeclarations:
    """Every agent declares the query type that matches its task."""

    @pytest.mark.parametrize(
        "agent_cls, expected",
        [
            (ArchitectureExplorer, QueryType.REASONING),
            (HealthScorer, QueryType.STRUCTURED),
            (PatternRecognition, QueryType.REASONING),
            (LearningPathGenerator, QueryType.REASONING),
            (PRReviewAgent, QueryType.CODE),
            (FirstPRAccelerator, QueryType.CODE),
            (DriftDetector, QueryType.REASONING),
            (CodebaseTrailer, QueryType.CREATIVE),
            (AutonomousCodingAgent, QueryType.CODE),
            (SilentPairProgramming, QueryType.CODE),
            (TaskQA, QueryType.CODE),
            (RepoQA, QueryType.REASONING),
            (QuizGenerator, QueryType.STRUCTURED),
            (RegressionTestGenerator, QueryType.CODE),
        ],
    )
    def test_agent_declares_query_type(self, agent_cls, expected):
        assert agent_cls.query_type == expected


class TestRoutedLLMWrapper:
    """BaseAgent wraps the router so LLM calls carry the agent's query type."""

    def test_llm_none_stays_none(self):
        agent = SilentPairProgramming(None)
        assert agent.llm is None

    def test_llm_wrapped_in_routed_proxy(self):
        mock_llm = AsyncMock(spec=LLMRouter)
        agent = SilentPairProgramming(mock_llm)
        assert isinstance(agent.llm, _RoutedLLM)

    async def test_call_claude_injects_query_type(self):
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.chat = AsyncMock(return_value="ok")
        agent = SilentPairProgramming(mock_llm)
        await agent._call_claude("Fix this bug")
        mock_llm.chat.assert_awaited_once()
        assert mock_llm.chat.await_args.kwargs["query_type"] == QueryType.CODE

    async def test_json_chat_injects_query_type(self):
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.json_chat = AsyncMock(return_value={"ok": True})
        agent = QuizGenerator(mock_llm)
        result = await agent.llm.json_chat("Generate a quiz")
        assert result == {"ok": True}
        assert mock_llm.json_chat.await_args.kwargs["query_type"] == QueryType.STRUCTURED

    async def test_explicit_query_type_override_wins(self):
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.chat = AsyncMock(return_value="ok")
        agent = SilentPairProgramming(mock_llm)
        await agent.llm.chat("Hello", query_type=QueryType.CHAT)
        assert mock_llm.chat.await_args.kwargs["query_type"] == QueryType.CHAT

    async def test_chat_stream_returns_async_generator(self):
        async def fake_stream(prompt, system=None, max_tokens=2000, query_type=None, **kwargs):
            yield "tok"

        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.chat_stream = fake_stream
        agent = RepoQA(mock_llm)
        tokens = []
        async for token in agent.llm.chat_stream("question?"):
            tokens.append(token)
        assert tokens == ["tok"]

    async def test_wrapper_chat_stream_matches_real_router_signature(self, monkeypatch):
        """Regression: _RoutedLLM.chat_stream injects cache_scope (+ optional
        BYOK kwargs) into the router call, but LLMRouter.chat_stream used to
        reject cache_scope with a TypeError — which silently sent every agent
        stream to the fallback path. The wrapper must work against the real
        signature (cache_scope accepted, provider_keys/key_pools threaded)."""
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-test")
        router = LLMRouter()

        async def fake_stream(self_, provider, prompt, system, max_tokens,
                              provider_keys=None, key_pools=None, key_pool_ids=None,
                              model_override=None):
            # Prove team BYOK keys reach the streamed provider call.
            assert key_pools == {"groq": ["pool-1"]}
            assert provider_keys == {"groq": "primary"}
            yield "tok"

        monkeypatch.setattr(LLMRouter, "_stream_provider", fake_stream)
        agent = RepoQA(router)
        tokens = []
        async for token in agent.llm.chat_stream(
            "question?",
            provider_keys={"groq": "primary"},
            key_pools={"groq": ["pool-1"]},
        ):
            tokens.append(token)
        assert tokens == ["tok"]

    async def test_default_query_type_passes_none(self):
        class PlainAgent(BaseAgent):
            query_type = None

            async def execute(self, **kwargs):
                return {}

        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.chat = AsyncMock(return_value="ok")
        agent = PlainAgent(mock_llm)
        await agent.llm.chat("hello")
        assert mock_llm.chat.await_args.kwargs["query_type"] is None

    async def test_pr_review_routes_code(self):
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.chat = AsyncMock(return_value='{"summary": "ok"}')
        agent = PRReviewAgent(mock_llm, github_token="x")
        await agent._analyze_diff("+def foo()", mode="normal")
        assert mock_llm.chat.await_args.kwargs["query_type"] == QueryType.CODE

    async def test_agents_with_self_built_routers_wrap_them(self, monkeypatch):
        # LearningPathGenerator builds its own router when none is injected.
        router = LLMRouter()
        monkeypatch.setattr("app.agents.learning_path_generator.LLMRouter", lambda: router)
        agent = LearningPathGenerator()
        assert isinstance(agent.llm, _RoutedLLM)
        assert agent.query_type == QueryType.REASONING
