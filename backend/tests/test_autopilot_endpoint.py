"""HTTP tests for the autopilot pipeline endpoints (/api/v1/autopilot)."""

from fastapi import FastAPI
from fastapi.testclient import TestClient


class _FakeAutopilotService:
    """Stand-in for AutopilotService — no network, no LLM, no git."""

    def __init__(self, analyze_result=None, run_result=None, analyze_error=None):
        self.analyze_result = analyze_result
        self.run_result = run_result
        self.analyze_error = analyze_error
        self.analyze_calls = []
        self.run_calls = []

    async def analyze(self, repo_url, branch="main", max_issues=5, routing_mode="balanced",
                      team_id=None, created_by=None, create_tasks=True):
        self.analyze_calls.append((repo_url, branch, max_issues, routing_mode,
                                   team_id, created_by, create_tasks))
        if self.analyze_error:
            raise self.analyze_error
        return self.analyze_result or {
            "repo": {"label": "acme/app", "url": repo_url, "branch": branch},
            "stats": {"file_count": 12, "graph_nodes": 20, "graph_edges": 15},
            "graph": {"architecture_pattern": "monolith"},
            "relationships": {"node_count": 50, "edge_count": 60},
            "issues": [
                {
                    "title": "Fix null pointer in auth",
                    "description": "NPE when token is missing",
                    "category": "bug",
                    "severity": "high",
                    "difficulty": "easy",
                    "files": ["src/auth.py"],
                    "assigned_role": "intern",
                    "source": "ai-analysis",
                }
            ],
            "tasks": [
                {
                    "task_id": "task-123",
                    "title": "Fix null pointer in auth",
                    "state": "assigned",
                    "priority": "high",
                    "assigned_to": "u-newdev",
                    "team_role": "new_dev",
                }
            ],
            "llm_routes": [
                {"step": "analysis", "query_type": "reasoning", "provider": "groq",
                 "model": "llama-3.3-70b-versatile", "free": True}
            ],
        }

    async def run(self, repo_url, branch="main", max_issues=5, max_solve=None,
                  routing_mode="balanced", validate=True, max_retry=1,
                  team_id=None, created_by=None, create_tasks=True):
        self.run_calls.append((repo_url, branch, max_issues, team_id, created_by, create_tasks))
        return {
            "repo": {"label": "acme/app", "url": repo_url, "branch": branch},
            "stats": {"file_count": 12, "graph_nodes": 20, "graph_edges": 15},
            "graph": {"architecture_pattern": "monolith"},
            "relationships": {"node_count": 50, "edge_count": 60},
            "issues": [],
            "tasks": [],
            "llm_routes": [],
            "solutions": [
                {
                    "success": True,
                    "issue": "Fix null pointer in auth",
                    "assigned_role": "senior_dev",
                    "pr_number": 42,
                    "pr_url": "https://github.com/acme/app/pull/42",
                    "validation": {
                        "status": "validated",
                        "ai": {"resolved": True, "confidence": 0.9,
                               "root_cause": "missing token guard",
                               "risks": ["edge case"], "tests_recommended": ["unit test"]},
                    },
                }
            ],
            "review_md": "# Senior Developer Review\n\n- PR: https://github.com/acme/app/pull/42",
        }


def _make_app(monkeypatch, fake_service=None, with_auth=True):
    from app.api.v1 import autopilot

    if fake_service is None:
        fake_service = _FakeAutopilotService()
    monkeypatch.setattr(autopilot, "AutopilotService", lambda llm=None, github_token=None: fake_service)

    application = FastAPI()
    application.state.llm = None

    if with_auth:
        @application.middleware("http")
        async def _auth(request, call_next):
            request.state.user = {"uid": "test-user", "email": "t@onramp.dev"}
            return await call_next(request)

    application.include_router(autopilot.router, prefix="/api/v1")
    return application


def _client(monkeypatch, fake_service=None, with_auth=True, raise_server_exceptions=False):
    """TestClient for the autopilot mini-app.

    ``raise_server_exceptions=False`` lets assertions see real error bodies
    instead of re-raising server-side exceptions.
    """
    return TestClient(_make_app(monkeypatch, fake_service, with_auth),
                      raise_server_exceptions=raise_server_exceptions)


class TestAnalyzeEndpoint:
    def test_analyze_returns_issues_with_assignment(self, monkeypatch):
        fake = _FakeAutopilotService()
        client = _client(monkeypatch, fake)

        resp = client.post("/api/v1/autopilot/analyze", json={
            "repo_url": "https://github.com/acme/app",
            "max_issues": 3,
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["repo"]["label"] == "acme/app"
        assert len(data["issues"]) == 1
        issue = data["issues"][0]
        assert issue["assigned_role"] == "intern"
        assert issue["source"] == "ai-analysis"
        assert data["llm_routes"][0]["provider"] == "groq"
        # Service received the request parameters.
        assert fake.analyze_calls[0][0] == "https://github.com/acme/app"
        assert fake.analyze_calls[0][2] == 3

    def test_analyze_passes_task_creation_context(self, monkeypatch):
        """create_tasks defaults on; the caller's uid is the task creator and
        their team is resolved for assignment."""
        self._seed_user_team()

        fake = _FakeAutopilotService()
        client = _client(monkeypatch, fake)
        resp = client.post("/api/v1/autopilot/analyze", json={
            "repo_url": "https://github.com/acme/app",
        })
        assert resp.status_code == 200
        _, _, _, _, team_id, created_by, create_tasks = fake.analyze_calls[0]
        assert create_tasks is True
        assert created_by == "test-user"
        assert team_id == "team-1"
        assert resp.json()["tasks"][0]["team_role"] == "new_dev"

    @staticmethod
    def _seed_user_team():
        import asyncio
        from datetime import datetime, timezone
        from app.services.postgres_db import get_storage

        async def _seed():
            storage = get_storage()
            now = datetime.now(timezone.utc)
            await storage.create_document("teams", "team-1", {
                "name": "T", "is_active": True, "created_at": now, "updated_at": now,
            })
            await storage.create_document("users", "test-user", {
                "email": "t@onramp.dev", "name": "T", "provider": "password",
                "password_hash": "h", "is_active": True,
                "created_at": now, "updated_at": now,
            })
            await storage.create_document("team_members", "m1", {
                "user_id": "test-user", "team_id": "team-1", "role": "new_dev",
                "joined_at": now,
            })

        asyncio.run(_seed())

    def test_analyze_can_disable_task_creation(self, monkeypatch):
        fake = _FakeAutopilotService()
        client = _client(monkeypatch, fake)
        resp = client.post("/api/v1/autopilot/analyze", json={
            "repo_url": "https://github.com/acme/app",
            "create_tasks": False,
        })
        assert resp.status_code == 200
        _, _, _, _, team_id, _, create_tasks = fake.analyze_calls[0]
        assert create_tasks is False
        assert team_id is None

    def test_analyze_validates_input(self, monkeypatch):
        fake = _FakeAutopilotService()
        client = _client(monkeypatch, fake)

        resp = client.post("/api/v1/autopilot/analyze", json={
            "repo_url": "https://github.com/acme/app",
            "max_issues": 0,  # below the ge=1 floor
        })
        assert resp.status_code == 422

    def test_analyze_returns_400_on_invalid_repo(self, monkeypatch):
        fake = _FakeAutopilotService(analyze_error=ValueError("Invalid repository URL"))
        client = _client(monkeypatch, fake)

        resp = client.post("/api/v1/autopilot/analyze", json={
            "repo_url": "not-a-github-url",
        })
        assert resp.status_code == 400
        assert "Invalid repository URL" in resp.json()["detail"]

    def test_analyze_requires_auth(self, monkeypatch):
        client = _client(monkeypatch, with_auth=False)
        resp = client.post("/api/v1/autopilot/analyze", json={
            "repo_url": "https://github.com/acme/app",
        })
        assert resp.status_code == 401


class TestRunEndpoint:
    def test_run_returns_prs_and_review(self, monkeypatch):
        fake = _FakeAutopilotService()
        client = _client(monkeypatch, fake)

        resp = client.post("/api/v1/autopilot/run", json={
            "repo_url": "https://github.com/acme/app",
            "max_issues": 3,
            "max_solve": 2,
            "run_validation": True,
            "max_retry": 1,
        })

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["solutions"]) == 1
        sol = data["solutions"][0]
        assert sol["pr_url"] == "https://github.com/acme/app/pull/42"
        assert sol["assigned_role"] == "senior_dev"
        assert sol["validation"]["ai"]["resolved"] is True
        assert "Senior Developer Review" in data["review_md"]
        assert fake.run_calls[0][0] == "https://github.com/acme/app"
        assert fake.run_calls[0][2] == 3

    def test_run_passes_task_creation_context(self, monkeypatch):
        TestAnalyzeEndpoint._seed_user_team()

        fake = _FakeAutopilotService()
        client = _client(monkeypatch, fake)
        resp = client.post("/api/v1/autopilot/run", json={
            "repo_url": "https://github.com/acme/app",
            "max_solve": 2,
        })
        assert resp.status_code == 200
        _, _, _, team_id, created_by, create_tasks = fake.run_calls[0]
        assert create_tasks is True
        assert created_by == "test-user"
        assert team_id == "team-1"

    def test_run_requires_auth(self, monkeypatch):
        client = _client(monkeypatch, with_auth=False)
        resp = client.post("/api/v1/autopilot/run", json={
            "repo_url": "https://github.com/acme/app",
        })
        assert resp.status_code == 401
