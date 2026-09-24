"""Tests for repository-index tenant grants and Ask authorization."""

import pytest
from unittest.mock import AsyncMock
from fastapi import HTTPException

from app.services.repo_index_access import (
    COLLECTION,
    find_registered_repository,
    get_index_job,
    grant_index_access,
    has_index_access,
    parse_github_repo,
    record_index_job,
    revoke_index_access,
)


@pytest.mark.asyncio
async def test_index_grants_are_scoped_to_team(storage):
    await grant_index_access("index-a", "team-a", "https://github.com/acme/app", "main")

    assert await has_index_access("index-a", "team-a") is True
    assert await has_index_access("index-a", "team-b") is False
    records = await storage.query_documents(COLLECTION, [("index_id", "==", "index-a")])
    assert len(records) == 1
    assert records[0]["team_id"] == "team-a"
    assert await revoke_index_access("index-a", "team-a") == 1
    assert await has_index_access("index-a", "team-a") is False


@pytest.mark.asyncio
async def test_index_job_binding_is_durable(storage):
    await record_index_job("task-a", "user-a", "team-a", "index-a", "https://github.com/acme/app")
    job = await get_index_job("task-a")
    assert job["requested_by"] == "user-a"
    assert job["team_id"] == "team-a"
    assert await get_index_job("task-b") is None


@pytest.mark.asyncio
async def test_registered_repository_lookup_normalizes_url(storage):
    await storage.create_document(
        "repositories",
        "repo-a",
        {
            "owner": "acme",
            "name": "app",
            "url": "https://github.com/acme/app/",
            "team_id": "team-a",
        },
    )

    found = await find_registered_repository("https://github.com/acme/app")
    assert found is not None
    assert found["id"] == "repo-a"
    assert await find_registered_repository("https://github.com/other/app") is None


def test_github_url_parser_rejects_non_https_and_local_paths():
    assert parse_github_repo("https://github.com/acme/app") == ("acme", "app")
    assert parse_github_repo("http://github.com/acme/app") is None
    assert parse_github_repo("https://github.com/acme/app/../../secret") is None
    assert parse_github_repo("C:/Users/test/repo") is None


@pytest.mark.asyncio
async def test_registered_repository_authorizer_rejects_wrong_team(monkeypatch, storage):
    from app.api.v1.index_access import authorize_registered_repo
    await storage.create_document(
        "repositories",
        "repo-a",
        {"owner": "acme", "name": "app", "url": "https://github.com/acme/app", "team_id": "team-a"},
    )
    monkeypatch.setattr("app.services.team_service.get_user_teams", AsyncMock(return_value=[{"id": "team-b"}]))

    with pytest.raises(HTTPException) as exc:
        await authorize_registered_repo({"uid": "user-b"}, "https://github.com/acme/app")

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_ask_authorize_index_requires_matching_grant(monkeypatch):
    from app.api.v1 import ask

    monkeypatch.setattr(ask, "_accessible_team_ids", AsyncMock(return_value={"team-a"}))
    monkeypatch.setattr(
        ask,
        "list_index_grants",
        AsyncMock(return_value=[{"index_id": "index-a", "team_id": "team-a"}]),
    )

    assert await ask._authorize_index({"uid": "user-a"}, "index-a") == "team-a"
    with pytest.raises(HTTPException) as exc:
        await ask._authorize_index({"uid": "user-a"}, "index-a", "team-b")
    assert exc.value.status_code == 403
