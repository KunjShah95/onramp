"""Tests for repositories.py access control (IDOR prevention)."""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from app.services.postgres_db import get_storage, generate_id


@pytest.fixture
async def seeded_storage():
    """Return a storage with two repos, each in a different team."""
    s = get_storage()
    await s.create_document("repositories", generate_id(), {
        "name": "repo-a", "owner": "org", "team_id": "team_a", "status": "tracked",
    })
    await s.create_document("repositories", generate_id(), {
        "name": "repo-b", "owner": "org", "team_id": "team_b", "status": "tracked",
    })
    return s


@pytest.mark.asyncio
async def test_verify_repo_access_allows_team_member(seeded_storage):
    """A user who belongs to the repo's team can access it."""
    from app.api.v1.repositories import _verify_repo_access

    mock_user = {"uid": "user_a"}
    with patch("app.api.v1.repositories._storage", seeded_storage), \
         patch("app.services.team_service.get_user_teams", new=AsyncMock(return_value=[
             {"team_id": "team_a", "role": "member"}
         ])):
        repo = await _verify_repo_access("org", "repo-a", mock_user)
    assert repo["name"] == "repo-a"


@pytest.mark.asyncio
async def test_verify_repo_access_denies_non_member(seeded_storage):
    """A user who does NOT belong to the repo's team gets 403."""
    from app.api.v1.repositories import _verify_repo_access

    mock_user = {"uid": "user_b"}
    with patch("app.api.v1.repositories._storage", seeded_storage), \
         patch("app.services.team_service.get_user_teams", new=AsyncMock(return_value=[
             {"team_id": "team_b", "role": "member"}
         ])):
        with pytest.raises(HTTPException) as exc:
            await _verify_repo_access("org", "repo-a", mock_user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_repo_access_404_on_missing_repo(seeded_storage):
    """Accessing a non-existent repo returns 404, not 403."""
    from app.api.v1.repositories import _verify_repo_access

    mock_user = {"uid": "user_a"}
    with patch("app.api.v1.repositories._storage", seeded_storage), \
         patch("app.services.team_service.get_user_teams", new=AsyncMock(return_value=[])):
        with pytest.raises(HTTPException) as exc:
            await _verify_repo_access("org", "nonexistent", mock_user)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_user_in_multiple_teams_can_access_any(seeded_storage):
    """A user who belongs to multiple teams can access repos in any of them."""
    from app.api.v1.repositories import _verify_repo_access

    mock_user = {"uid": "multi_user"}
    with patch("app.api.v1.repositories._storage", seeded_storage), \
         patch("app.services.team_service.get_user_teams", new=AsyncMock(return_value=[
             {"team_id": "team_a", "role": "member"},
             {"team_id": "team_b", "role": "member"},
         ])):
        repo_a = await _verify_repo_access("org", "repo-a", mock_user)
        repo_b = await _verify_repo_access("org", "repo-b", mock_user)
    assert repo_a["name"] == "repo-a"
    assert repo_b["name"] == "repo-b"


@pytest.mark.asyncio
async def test_delete_repo_requires_ownership(seeded_storage):
    """A user can only delete repos belonging to their team."""
    from app.api.v1.repositories import _verify_repo_access

    mock_user = {"uid": "user_a"}
    with patch("app.api.v1.repositories._storage", seeded_storage), \
         patch("app.services.team_service.get_user_teams", new=AsyncMock(return_value=[
             {"team_id": "team_a", "role": "member"}
         ])):
        with pytest.raises(HTTPException) as exc:
            await _verify_repo_access("org", "repo-b", mock_user)
    assert exc.value.status_code == 403
