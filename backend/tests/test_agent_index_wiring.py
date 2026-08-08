"""Tests for repo-context index wiring into the remaining agents.

Verifies that agents accept an optional ``index_id`` and resolve their
repo structure from the cached context index (requirement-sliced + token
budgeted) instead of a full ``repo_structure`` body — while remaining
backward compatible when only ``repo_structure`` is passed.
"""

import pytest

from app.services import repo_context
from app.services.repo_context import resolve_for_agent, index_id_for

SAMPLE_ENTITIES = {
    "files": [
        {
            "path": "src/auth/login.py",
            "language": "python",
            "classes": [{"name": "LoginHandler"}],
            "functions": [{"name": "validate_credentials"}],
            "imports": ["flask"],
            "exports": [],
            "dependencies": ["flask"],
        },
        {
            "path": "src/auth/token.py",
            "language": "python",
            "classes": [{"name": "TokenService"}],
            "functions": [{"name": "issue_token"}],
            "imports": ["jwt"],
            "exports": [],
            "dependencies": ["jwt"],
        },
        {
            "path": "tests/test_auth.py",
            "language": "python",
            "classes": [{"name": "TestAuth"}],
            "functions": [{"name": "test_login"}],
            "imports": ["pytest"],
            "exports": [],
            "dependencies": ["pytest"],
        },
        {
            "path": "README.md",
            "language": "markdown",
            "classes": [],
            "functions": [],
            "imports": [],
            "exports": [],
            "dependencies": [],
        },
    ],
    "classes": [
        {"name": "LoginHandler", "file": "src/auth/login.py", "language": "python"},
        {"name": "TokenService", "file": "src/auth/token.py", "language": "python"},
        {"name": "TestAuth", "file": "tests/test_auth.py", "language": "python"},
    ],
    "functions": [
        {"name": "validate_credentials", "file": "src/auth/login.py", "language": "python"},
        {"name": "issue_token", "file": "src/auth/token.py", "language": "python"},
        {"name": "test_login", "file": "tests/test_auth.py", "language": "python"},
    ],
    "imports": [
        {"module": "flask", "file": "src/auth/login.py", "language": "python"},
        {"module": "jwt", "file": "src/auth/token.py", "language": "python"},
        {"module": "pytest", "file": "tests/test_auth.py", "language": "python"},
    ],
    "exports": [],
    "module_map": {"login": "src/auth/login.py", "token": "src/auth/token.py"},
}

SAMPLE_DOC = {
    "index_id": "abc123",
    "repo_url": "https://github.com/acme/app",
    "branch": "main",
    "commit": "abc123",
    "built_at": "2026-08-08T00:00:00+00:00",
    "cached": False,
    "stats": {"file_count": 4, "class_count": 3, "function_count": 3, "import_count": 3},
    "entities": SAMPLE_ENTITIES,
    "graph": {
        "modules": ["src/auth/login.py", "tests/test_auth.py"],
        "dependencies": {"src/auth/login.py": ["flask"]},
        "circular_dependencies": [["src/auth/login.py", "src/auth/token.py"]],
        "services": [],
        "architecture_pattern": "monolith",
        "architecture_diagram": "graph TD",
        "is_collapsed": False,
    },
}


@pytest.fixture(autouse=True)
def _seed_index(monkeypatch):
    """Seed the in-process repo-context cache and clear it after each test."""
    import app.services.repo_context as rc

    async def fake_get(index_id):
        if index_id == "abc123":
            return SAMPLE_DOC
        return None

    monkeypatch.setattr(rc.repo_context_service, "get", fake_get)
    yield
    rc._LOCAL_CACHE.clear()


class TestResolveForAgent:
    @pytest.mark.asyncio
    async def test_index_resolves_full_slice_and_context(self):
        full, sliced, context_text = await resolve_for_agent(
            "abc123", None, requirement="auth login tokens"
        )
        assert "files" in full
        assert full["file_count"] if "file_count" in full else len(full["files"]) >= 4
        # Slice only keeps relevant files.
        paths = {f["path"] for f in sliced.get("files", [])}
        assert "src/auth/login.py" in paths
        assert "src/ui/whatever.py" not in paths
        assert context_text  # non-empty budgeted context

    @pytest.mark.asyncio
    async def test_index_merges_circular_dependencies(self):
        full, _, _ = await resolve_for_agent("abc123", None, requirement="health")
        assert full.get("circular_dependencies") == [["src/auth/login.py", "src/auth/token.py"]]

    @pytest.mark.asyncio
    async def test_missing_index_falls_back_to_structure(self):
        base = {"files": [{"path": "x.py"}], "classes": [], "functions": []}
        full, sliced, context = await resolve_for_agent(None, base, requirement="x")
        assert full is base
        assert sliced is base
        assert context == ""

    @pytest.mark.asyncio
    async def test_unknown_index_id_falls_back(self):
        base = {"files": [], "classes": [], "functions": []}
        full, _, _ = await resolve_for_agent("nope", base, requirement="x")
        assert full is base

    @pytest.mark.asyncio
    async def test_resolved_index_pins_llm_cache_scope(self):
        """A resolved index id pins the routed LLM's cache scope per repo."""
        from app.agents.base_agent import _RoutedLLM
        from app.llm import LLMRouter

        routed = _RoutedLLM(LLMRouter(), None)
        assert routed.cache_scope is None

        await resolve_for_agent("abc123", None, requirement="health", llm=routed)
        assert routed.cache_scope == "abc123"

    @pytest.mark.asyncio
    async def test_unresolved_index_leaves_scope_untouched(self):
        """Fallback path (no index) never pins a bogus cache scope."""
        from app.agents.base_agent import _RoutedLLM
        from app.llm import LLMRouter

        routed = _RoutedLLM(LLMRouter(), None)
        await resolve_for_agent(None, {"files": []}, requirement="x", llm=routed)
        assert routed.cache_scope is None

    @pytest.mark.asyncio
    async def test_stale_scope_resets_on_fallback(self):
        """A fallback request clears a scope pinned by an earlier index call.

        Agents are long-lived: if the same instance served repo A (scope
        pinned) then a structure-only request, the second call must NOT
        cache under repo A's scope — the wrong repo's push would evict it.
        """
        from app.agents.base_agent import _RoutedLLM
        from app.llm import LLMRouter

        routed = _RoutedLLM(LLMRouter(), None)

        # Repo-backed call pins the scope...
        await resolve_for_agent("abc123", None, requirement="health", llm=routed)
        assert routed.cache_scope == "abc123"

        # ...then a structure-only fallback clears it.
        await resolve_for_agent(None, {"files": []}, requirement="x", llm=routed)
        assert routed.cache_scope is None


class TestHealthScorerIndex:
    @pytest.mark.asyncio
    async def test_execute_with_index_id_scores_full_repo(self):
        from app.agents.health_scorer import HealthScorer

        scorer = HealthScorer(None)
        result = await scorer.execute(index_id="abc123", mode="normal")
        assert result["total_files"] == 4
        # Circular deps surfaced from the graph index.
        assert result["circular_dependencies"] == 1
        assert result["test_coverage"] == 25.0  # 1 of 4 files is a test

    @pytest.mark.asyncio
    async def test_execute_with_structure_still_works(self):
        from app.agents.health_scorer import HealthScorer

        scorer = HealthScorer(None)
        structure = {
            "files": [{"path": "a.py"}, {"path": "tests/test_a.py"}],
            "classes": [],
            "functions": [],
            "imports": [],
        }
        result = await scorer.execute(repo_structure=structure, mode="normal")
        assert result["total_files"] == 2
        assert result["test_coverage"] == 50.0

    @pytest.mark.asyncio
    async def test_roast_uses_budgeted_context(self):
        from app.agents.health_scorer import HealthScorer

        class _LLM:
            async def json_chat(self, prompt, system=None, query_type=None, **kw):
                # For a "health" requirement the index slice selects the test
                # file — the roast prompt embeds the slice, not the whole repo.
                assert "tests/test_auth.py" in prompt
                assert "src/auth/login.py" not in prompt
                return {"roast_summary": "brutal", "roast_intensity": "dark"}

        scorer = HealthScorer(_LLM())
        result = await scorer.execute(index_id="abc123", mode="roast")
        assert result.get("roast") == "brutal"


class TestLearningPathIndex:
    @pytest.mark.asyncio
    async def test_execute_with_index_id(self, monkeypatch):
        from app.agents.learning_path_generator import LearningPathGenerator

        class _LLM:
            async def json_chat(self, prompt, system=None, query_type=None, **kw):
                return {
                    "user_level": "junior",
                    "total_estimated_hours": 12,
                    "modules": [
                        {"order": 1, "name": "Auth", "files": ["src/auth/login.py"],
                         "time_hours": 2, "objectives": ["o"], "description": "d"},
                    ],
                }

        # LearningPathGenerator builds its own router — stub the wrapped llm.
        gen = LearningPathGenerator()
        gen.llm = _LLM()
        result = await gen.execute(index_id="abc123", user_level="junior")
        assert result["path"][0]["name"] == "Auth"
        assert result["total_estimated_hours"] == 12

    @pytest.mark.asyncio
    async def test_execute_structure_backward_compat(self):
        from app.agents.learning_path_generator import LearningPathGenerator

        gen = LearningPathGenerator()
        gen.llm = None
        result = await gen.execute(
            repo_structure={"files": [{"path": "main.py"}], "classes": [], "functions": []},
            user_level="junior",
        )
        assert len(result["path"]) >= 1

    @pytest.mark.asyncio
    async def test_generate_alias_maps_role(self):
        from app.agents.learning_path_generator import LearningPathGenerator

        gen = LearningPathGenerator()
        gen.llm = None
        result = await gen.generate(
            {"files": [{"path": "main.py"}], "classes": [], "functions": []}, role="architect"
        )
        assert result["user_level"] == "senior"


class TestQuizIndex:
    @pytest.mark.asyncio
    async def test_execute_module_mode_with_index(self):
        from app.agents.quiz_generator import QuizGenerator

        class _LLM:
            async def json_chat(self, prompt, system=None, query_type=None, **kw):
                assert "src/auth/login.py" in prompt
                return {
                    "module": "auth",
                    "difficulty": "mixed",
                    "total_questions": 1,
                    "questions": [{"question_id": "q1", "question_text": "x", "correct_answer": "y"}],
                }

        quiz = QuizGenerator(_LLM())
        result = await quiz.execute(
            mode="module", module_name="auth", index_id="abc123", num_questions=1
        )
        assert result["questions"][0]["question_id"] == "q1"

    @pytest.mark.asyncio
    async def test_execute_repo_mode_with_index(self):
        from app.agents.quiz_generator import QuizGenerator

        class _LLM:
            async def json_chat(self, prompt, system=None, query_type=None, **kw):
                return {"questions": [{"question_id": "q1", "question_text": "x", "correct_answer": "y"}]}

        quiz = QuizGenerator(_LLM())
        result = await quiz.execute(mode="repo", index_id="abc123", num_questions=1)
        assert result["questions"]

    @pytest.mark.asyncio
    async def test_execute_structure_backward_compat(self):
        from app.agents.quiz_generator import QuizGenerator

        quiz = QuizGenerator(None)
        result = await quiz.execute(
            mode="module",
            module_name="src",
            repo_structure={"files": [{"path": "src/main.py"}], "classes": [], "functions": []},
        )
        assert len(result.get("questions", [])) > 0


class TestDriftIndex:
    @pytest.mark.asyncio
    async def test_execute_with_index_id(self):
        from app.agents.drift_detector import DriftDetector

        detector = DriftDetector(None)
        result = await detector.execute(
            index_id="abc123",
            docs="The app has auth login and token issuance components.",
        )
        assert "drift_score" in result
        # Code identifiers come from the full index.
        assert result["code_component_count"] >= 1

    @pytest.mark.asyncio
    async def test_execute_structure_backward_compat(self):
        from app.agents.drift_detector import DriftDetector

        detector = DriftDetector(None)
        result = await detector.execute(
            repo_structure={
                "files": [{"path": "src/payments/pay.py"}], "classes": [], "functions": []
            },
            docs="The app has payments.",
        )
        assert "drift_score" in result


class TestPatternIndex:
    @pytest.mark.asyncio
    async def test_execute_with_index_id(self):
        from app.agents.pattern_recognition import PatternRecognition

        class _LLM:
            async def json_chat(self, prompt, system=None, query_type=None, **kw):
                return {"pattern": "authentication", "your_approach": {}, "similar_solutions": []}

        agent = PatternRecognition(_LLM())
        result = await agent.execute(pattern="auth", index_id="abc123")
        assert result.get("pattern") == "authentication"

    @pytest.mark.asyncio
    async def test_execute_structure_backward_compat(self):
        from app.agents.pattern_recognition import PatternRecognition

        agent = PatternRecognition(None)
        result = await agent.execute(
            pattern="testing",
            repo_structure={
                "files": [{"path": "tests/test_x.py"}], "classes": [], "functions": []
            },
        )
        assert "pattern" in result


class TestEndpointIndexParams:
    def test_health_accepts_index_id(self, monkeypatch):
        """POST /repos/{owner}/{repo}/health works with index_id only (no body structure)."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from starlette.middleware.base import BaseHTTPMiddleware

        from app.api.v1 import health as health_module
        from app.services import repo_context as rc

        async def fake_get(index_id):
            return SAMPLE_DOC if index_id == "abc123" else None

        monkeypatch.setattr(rc.repo_context_service, "get", fake_get)

        application = FastAPI()
        application.state.llm = None

        @application.middleware("http")
        async def _noop_mw(request, call_next):
            return await call_next(request)

        application.include_router(health_module.router)
        resp = TestClient(application).post(
            "/repos/acme/app/health",
            json={"owner": "acme", "repo": "app", "index_id": "abc123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_files"] == 4
        assert data["owner"] == "acme"

    def test_health_requires_structure_or_index(self, monkeypatch):
        """POST /repos/{owner}/{repo}/health rejects requests with neither."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.api.v1 import health as health_module

        application = FastAPI()
        application.state.llm = None
        application.include_router(health_module.router)
        resp = TestClient(application).post(
            "/repos/acme/app/health",
            json={"owner": "acme", "repo": "app"},
        )
        assert resp.status_code == 400

    def test_ai_gateway_allows_index_id_substitute(self, monkeypatch):
        """execute_agent validates params — index_id substitutes repo_structure."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from app.api.v1.ai_gateway import router as ai_router

        from app.services import api_key_service

        async def fake_validate(key):
            return {
                "key_hash": "x",
                "name": "test",
                "permissions": {"tier": "free", "org_name": "testorg"},
                "org_name": "testorg",
            }

        monkeypatch.setattr(api_key_service, "validate_api_key", fake_validate)

        class _NoopLLM:
            def __init__(self):
                self.last_route = None

        application = FastAPI()
        application.state.llm = _NoopLLM()
        application.include_router(ai_router)

        # index_id-only request for health must pass param validation (the
        # agent itself returns gracefully without repo_structure).
        resp = TestClient(application).post(
            "/ai/agents/health",
            headers={"X-API-Key": "cf_test-key"},
            json={"index_id": "abc123"},
        )
        # Not a 400 missing-param error; the agent runs (its index lookup
        # falls back and scores an empty repo, returning 200).
        assert resp.status_code in (200, 500)
        assert "Missing required parameter" not in resp.text
