"""HTTP tests for the repo-context index endpoints (/repos/index)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.repo_context import index_id_for


def _make_app(monkeypatch, fake_service):
    """App with the repo_index router and a stubbed service instance."""
    from app.api.v1 import repo_index

    repo_index._service = fake_service
    application = FastAPI()

    @application.middleware("http")
    async def _auth(request, call_next):
        request.state.user = {"uid": "test-user", "email": "t@onramp.dev"}
        return await call_next(request)

    application.include_router(repo_index.router)
    return application


class _FakeService:
    def __init__(self, doc=None, build_result=None, evict_result=False, select_result=None):
        self.doc = doc
        self.build_result = build_result
        self.evict_result = evict_result
        self.select_result = select_result
        self.build_calls = []

    async def build(self, repo_url, branch="main", max_files=1000, force=False):
        self.build_calls.append((repo_url, branch, force))
        return self.build_result or {
            "index_id": index_id_for(repo_url, branch),
            "repo_url": repo_url,
            "branch": branch,
            "commit": "abc123",
            "built_at": "2026-08-08T00:00:00+00:00",
            "cached": False,
            "stats": {"file_count": 4},
            "entities": {"files": [], "classes": [], "functions": [], "imports": [], "exports": [], "module_map": {}},
            "graph": {},
        }

    async def get(self, index_id):
        return self.doc

    async def select_context(self, index_id, requirement, max_tokens=4000):
        return self.select_result

    async def evict(self, index_id):
        return self.evict_result


class TestBuildIndex:
    def test_build_returns_document(self, monkeypatch):
        service = _FakeService()
        client = TestClient(_make_app(monkeypatch, service))

        resp = client.post("/repos/index", json={"repo_url": "https://github.com/acme/app"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is False
        assert data["repo_url"] == "https://github.com/acme/app"
        assert data["stats"]["file_count"] == 4
        assert service.build_calls[0][0] == "https://github.com/acme/app"

    def test_build_force_passthrough(self, monkeypatch):
        service = _FakeService()
        client = TestClient(_make_app(monkeypatch, service))
        client.post(
            "/repos/index",
            json={"repo_url": "https://github.com/acme/app", "force": True, "branch": "dev"},
        )
        assert service.build_calls[0] == ("https://github.com/acme/app", "dev", True)

    def test_build_rejects_bad_url(self, monkeypatch):
        class _BadService(_FakeService):
            async def build(self, repo_url, branch="main", max_files=1000, force=False):
                raise ValueError("Invalid repository URL")

        client = TestClient(_make_app(monkeypatch, _BadService()))
        resp = client.post("/repos/index", json={"repo_url": "not-a-url"})
        assert resp.status_code == 400

    def test_build_async_dispatches_celery_task(self, monkeypatch):
        """async_build=true returns 202 + task id instead of building inline."""
        from types import SimpleNamespace

        from app.tasks import repo_index_tasks

        dispatched = {}

        class _FakeTask:
            def delay(self, repo_url, branch="main", max_files=1000, force=False):
                dispatched.update(
                    repo_url=repo_url, branch=branch, max_files=max_files, force=force
                )
                return SimpleNamespace(id="task-abc123")

        # Patch the MODULE attribute, not the Task instance — the handler
        # re-imports it at request time, so this is the stable interception
        # point (a Celery Task's instance dict is not reliable across the
        # TestClient portal thread).
        monkeypatch.setattr(repo_index_tasks, "build_repo_index", _FakeTask())
        client = TestClient(_make_app(monkeypatch, _FakeService()))

        resp = client.post(
            "/repos/index",
            json={
                "repo_url": "https://github.com/acme/app",
                "branch": "dev",
                "async_build": True,
            },
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["queued"] is True
        assert data["task_id"] == "task-abc123"
        assert data["repo_url"] == "https://github.com/acme/app"
        assert dispatched["branch"] == "dev"


class TestGetIndex:
    def test_get_returns_document(self, monkeypatch):
        doc = {
            "index_id": "abc123",
            "repo_url": "https://github.com/acme/app",
            "entities": {"files": [{"path": "src/main.py", "language": "python"}], "classes": [], "functions": [], "imports": [], "exports": [], "module_map": {}},
            "graph": {},
        }
        service = _FakeService(doc=doc)
        client = TestClient(_make_app(monkeypatch, service))

        resp = client.get("/repos/index/abc123")
        assert resp.status_code == 200
        assert resp.json()["index_id"] == "abc123"

    def test_get_missing_returns_404(self, monkeypatch):
        service = _FakeService(doc=None)
        client = TestClient(_make_app(monkeypatch, service))
        assert client.get("/repos/index/nope").status_code == 404


class TestSelect:
    def test_select_requires_requirement(self, monkeypatch):
        service = _FakeService(select_result={})
        client = TestClient(_make_app(monkeypatch, service))
        resp = client.get("/repos/index/abc123/context")
        assert resp.status_code == 400

    def test_select_returns_slice(self, monkeypatch):
        service = _FakeService(
            select_result={
                "index_id": "abc123",
                "requirement": "auth",
                "max_tokens": 4000,
                "selected_files": ["src/auth/login.py"],
                "file_count": 1,
                "entities": {},
                "graph": {},
                "context_text": "src/auth/login.py (python)",
                "token_estimate": 10,
                "truncated": False,
            }
        )
        client = TestClient(_make_app(monkeypatch, service))
        resp = client.get("/repos/index/abc123/context", params={"requirement": "auth login"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["selected_files"] == ["src/auth/login.py"]
        assert data["requirement"] == "auth"

    def test_select_missing_index_404(self, monkeypatch):
        service = _FakeService(select_result=None)
        client = TestClient(_make_app(monkeypatch, service))
        resp = client.get("/repos/index/nope/context", params={"requirement": "auth"})
        assert resp.status_code == 404


class TestEvict:
    def test_evict(self, monkeypatch):
        service = _FakeService(evict_result=True)
        client = TestClient(_make_app(monkeypatch, service))
        resp = client.delete("/repos/index/abc123")
        assert resp.status_code == 200
        assert resp.json() == {"evicted": "abc123"}

    def test_evict_missing_404(self, monkeypatch):
        service = _FakeService(evict_result=False)
        client = TestClient(_make_app(monkeypatch, service))
        assert client.delete("/repos/index/abc123").status_code == 404

    def test_unauthenticated_returns_401(self, monkeypatch):
        from app.api.v1 import repo_index

        repo_index._service = _FakeService()
        application = FastAPI()
        application.include_router(repo_index.router)
        client = TestClient(application)
        assert client.get("/repos/index/abc123").status_code == 401
