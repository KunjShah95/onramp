"""Tests for core AI agents — fallback paths and execution flow."""

import pytest
from unittest.mock import AsyncMock
from app.llm import LLMRouter
from app.agents.base_agent import BaseAgent
from app.agents.silent_pair_programming import SilentPairProgramming
from app.agents.quiz_generator import QuizGenerator
from app.agents.repo_qa import RepoQA


class TestBaseAgent:
    """BaseAgent abstract class — instantiation and shared methods."""

    async def test_cannot_instantiate_base(self):
        """BaseAgent is abstract and cannot be instantiated directly."""
        with pytest.raises(TypeError):
            BaseAgent(llm_client=None)

    async def test_concrete_agent_has_llm_and_cache(self):
        """Concrete agents get an llm client and cache dict."""
        agent = SilentPairProgramming(None)
        assert agent.llm is None
        assert agent.cache == {}

    async def test_call_claude(self):
        """_call_claude delegates to llm.chat with combined prompt."""
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.chat = AsyncMock(return_value="Claude response")
        agent = SilentPairProgramming(mock_llm)
        result = await agent._call_claude("What is Python?", context="Context about Python")
        assert result == "Claude response"
        mock_llm.chat.assert_awaited_once()
        args = mock_llm.chat.await_args[0][0]
        assert "Context about Python" in args
        assert "What is Python?" in args


class TestSilentPairProgramming:
    """SilentPairProgramming agent — issue walkthrough generation."""

    @pytest.fixture
    def agent(self):
        return SilentPairProgramming(None)

    async def test_execute_returns_walkthrough(self, agent):
        """execute() returns the fallback walkthrough when no LLM is available."""
        result = await agent.execute(
            issue_title="Fix login bug",
            issue_body="Users cannot log in with Google OAuth",
            repo_structure={"files": [{"path": "src/auth.py"}, {"path": "src/main.py"}]},
        )
        assert "thought_process" in result
        assert "files_to_examine" in result
        assert "solution_steps" in result
        assert len(result["files_to_examine"]) > 0
        assert "Fix login bug" in result["thought_process"]

    async def test_execute_with_llm_fallback(self, agent):
        """When LLM call fails, falls back to default response."""
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.json_chat = AsyncMock(side_effect=Exception("API error"))
        agent.llm = mock_llm

        result = await agent.execute(
            issue_title="API rate limiting",
            issue_body="Too many requests",
            repo_structure={"files": [{"path": "app.py"}]},
        )
        assert "thought_process" in result
        assert "API rate limiting" in result["thought_process"]

    async def test_execute_with_llm_success(self):
        """When LLM succeeds, returns the parsed JSON result."""
        mock_llm = AsyncMock(spec=LLMRouter)
        mock_llm.json_chat = AsyncMock(return_value={
            "thought_process": "Let me analyze this...",
            "files_to_examine": ["src/core.py"],
            "key_insights": ["The issue is in the auth module"],
            "solution_steps": ["Add validation", "Update tests"],
            "code_changes": [],
            "testing_approach": "Run unit tests",
        })
        agent = SilentPairProgramming(mock_llm)

        result = await agent.execute(
            issue_title="Auth bug",
            issue_body="Token validation fails",
            repo_structure={"files": [{"path": "src/core.py"}]},
        )
        assert result["thought_process"] == "Let me analyze this..."
        assert "src/core.py" in result["files_to_examine"]


class TestQuizGenerator:
    """QuizGenerator agent — quiz generation and evaluation."""

    @pytest.fixture
    def agent(self):
        return QuizGenerator(None)

    async def test_execute_dispatches_to_generate_for_module(self, agent):
        """execute() routes to generate_for_module when mode=module."""
        result = await agent.execute(
            mode="module",
            module_name="src",
            repo_structure={"files": [{"path": "src/main.py"}, {"path": "src/app.py"}], "classes": [], "functions": []},
        )
        assert isinstance(result, dict)
        assert len(result.get("questions", [])) > 0

    async def test_generate_for_module_returns_questions(self, agent):
        result = await agent.generate_for_module(
            module_name="src",
            repo_structure={"files": [{"path": "src/Dockerfile"}], "classes": [], "functions": []},
        )
        assert "quiz" in result or "questions" in result
        questions = result.get("questions") or result.get("quiz", {}).get("questions", [])
        assert len(questions) > 0

    async def test_evaluate_default_returns_results(self, agent):
        quiz = {"questions": [{"question_id": "q1", "question": "What is Docker?", "options": ["A", "B", "C", "D"], "correct_answer": "A"}]}
        answers = {"q1": "A"}
        result = agent._evaluate_default(quiz, answers)
        assert result["score"] > 0

    async def test_evaluate_default_with_wrong_answer(self, agent):
        quiz = {"questions": [{"question_id": "q1", "question": "What is Docker?", "options": ["A", "B", "C", "D"], "correct_answer": "A"}]}
        answers = {"q1": "B"}
        result = agent._evaluate_default(quiz, answers)
        assert result["score"] == 0


class TestRepoQA:
    """RepoQA agent — question answering over repository context."""

    @pytest.fixture
    def agent(self):
        return RepoQA(None)

    async def test_execute_returns_ok_stub(self, agent):
        """execute() returns a minimal status stub."""
        result = await agent.execute(repo_path="/tmp/test")
        assert result == {"status": "ok"}

    async def test_ask_without_llm_returns_fallback(self, agent):
        """ask() returns fallback message when no LLM is available and embeddings return nothing."""
        result = await agent.ask(index_id="test_idx", question="How does auth work?")
        assert result == "No relevant documents found in the indexed codebase."

    async def test_build_prompt_generates_roast_mode(self, agent):
        prompt = agent._build_prompt(
            question="Why is my code slow?",
            context="def fib(n): return n",
            memory="",
            mode="roast",
        )
        assert "roast" in prompt.lower() or "senior" in prompt.lower()

    async def test_build_prompt_normal_mode(self, agent):
        prompt = agent._build_prompt(
            question="What does this function do?",
            context="def add(a, b): return a + b",
            mode="normal",
        )
        assert "What does this function do?" in prompt
        assert "def add" in prompt
