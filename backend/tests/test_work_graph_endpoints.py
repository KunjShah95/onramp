"""Work graph endpoints only expose graphs for repos registered to the caller's team."""
import pytest
from fastapi import HTTPException

from app.api.v1 import dashboard, health, index_access
from app.services import postgres_db


class _Storage:
    def __init__(self, docs):
        self.docs = docs

    async def list_documents(self, collection):
        assert collection == "repo_work_graphs"
        return list(self.docs.values())

    async def get_document(self, collection, doc_id):
        assert collection == "repo_work_graphs"
        return self.docs.get(doc_id)


DOCS = {
    "acme/app": {"owner": "acme", "repo": "app", "generated_at": "2026-09-01T00:00:00+00:00", "commit": "abc"},
    "other/secret": {"owner": "other", "repo": "secret", "generated_at": "2026-09-02T00:00:00+00:00", "commit": "def"},
}


async def _authorize(user, repo_url, requested_team_id=None):
    if repo_url != "https://github.com/acme/app":
        raise HTTPException(status_code=403, detail="Repository is not registered for an accessible team")
    return "team-1"


@pytest.fixture
def patched(monkeypatch):
    monkeypatch.setattr(postgres_db, "get_storage", lambda: _Storage(DOCS))
    monkeypatch.setattr(index_access, "authorize_registered_repo", _authorize)
    monkeypatch.setattr(health, "authorize_registered_repo", _authorize)


async def test_list_filters_to_accessible_repos(patched):
    result = await dashboard.list_work_graphs(user={"uid": "u1"})
    assert result == {"graphs": [{"owner": "acme", "repo": "app", "generated_at": "2026-09-01T00:00:00+00:00", "commit": "abc"}]}


async def test_get_returns_doc_for_team_repo(patched):
    doc = await health.get_work_graph("acme", "app", user={"uid": "u1"})
    assert doc["commit"] == "abc"


async def test_get_rejects_other_team_repo(patched):
    with pytest.raises(HTTPException) as exc:
        await health.get_work_graph("other", "secret", user={"uid": "u1"})
    assert exc.value.status_code == 403


async def test_get_404_when_not_generated(patched, monkeypatch):
    monkeypatch.setattr(postgres_db, "get_storage", lambda: _Storage({}))
    with pytest.raises(HTTPException) as exc:
        await health.get_work_graph("acme", "app", user={"uid": "u1"})
    assert exc.value.status_code == 404
