"""Health scoring a registered-but-never-indexed repo builds the index instead of 404ing."""
import pytest
from fastapi import HTTPException

from app.api.v1 import health
from app.services import postgres_db, repo_context


class _Storage:
    def __init__(self, rows):
        self.rows = rows

    async def query_documents(self, collection, filters):
        assert collection == "repositories"
        return self.rows


class _Service:
    built: list[str] = []
    docs: dict = {}

    async def get(self, index_id):
        return self.docs.get(index_id)

    async def build(self, repo_url, branch="main", max_files=1000, force=False):
        self.built.append(repo_url)
        self.docs[repo_context.index_id_for(repo_url)] = {"repo_url": repo_url}
        return {}


class _Scorer:
    def __init__(self, *a, **k):
        pass

    async def execute(self, **kwargs):
        return {"overall_score": 80, "index_id": kwargs.get("index_id")}


class _Req:
    class app:
        class state:
            llm = None


@pytest.fixture
def patched(monkeypatch):
    _Service.built, _Service.docs = [], {}
    monkeypatch.setattr(postgres_db, "get_storage", lambda: _Storage([{"url": "https://github.com/facebook/react"}]))
    monkeypatch.setattr(repo_context, "RepoContextService", _Service)
    monkeypatch.setattr(health, "HealthScorer", _Scorer)
    monkeypatch.setattr(health, "get_session", _none)
    monkeypatch.setattr(health, "complete_session", _none)

    async def _team(*a, **k):
        return "team-1"

    monkeypatch.setattr(health, "authorize_registered_repo", _team)
    monkeypatch.setattr(health, "authorize_repo_index", _team)


async def _none(*a, **k):
    return None


async def test_builds_index_when_missing(patched):
    body = health.HealthRequest(owner="facebook", repo="react")
    result = await health.get_health("facebook", "react", body, _Req(), user={"uid": "u1"})
    assert _Service.built == ["https://github.com/facebook/react"]
    assert result["overall_score"] == 80


async def test_unregistered_repo_gets_actionable_400(monkeypatch, patched):
    monkeypatch.setattr(postgres_db, "get_storage", lambda: _Storage([]))
    body = health.HealthRequest(owner="nobody", repo="nothing")
    with pytest.raises(HTTPException) as exc:
        await health.get_health("nobody", "nothing", body, _Req(), user={"uid": "u1"})
    assert exc.value.status_code == 400
    assert "not registered" in exc.value.detail
