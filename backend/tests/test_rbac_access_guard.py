"""RBAC matrix for require_minimum_role (features_mvp.md 1.2 priority item),
exercised through the real team_service -> storage.query_documents("in", ...)
path — this is also the regression test for fix 2.2 (JSONB/"in" filter was a
silent no-op before it was implemented).
"""
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.middleware.access_guard import require_minimum_role


def _make_request(path_params: dict, user: dict | None):
    scope = {
        "type": "http",
        "path_params": path_params,
        "query_string": b"",
        "headers": [],
    }
    request = Request(scope)
    if user is not None:
        request.state.user = user
    return request


async def _seed_team(storage, team_id: str, user_id: str, role: str):
    await storage.create_document("teams", team_id, {"id": team_id, "name": "T"})
    await storage.create_document(
        "team_members", f"{team_id}:{user_id}",
        {"team_id": team_id, "user_id": user_id, "role": role},
    )


async def _run_guard(min_role: str, team_id: str, user: dict):
    guard_dep = require_minimum_role(min_role)
    request = _make_request({"team_id": team_id}, user)
    await guard_dep.dependency(request)


@pytest.mark.parametrize("user_role,min_role,should_pass", [
    ("owner", "member", True),
    ("owner", "senior", True),
    ("owner", "owner", True),
    ("senior", "member", True),
    ("senior", "senior", True),
    ("senior", "owner", False),
    ("member", "member", True),
    ("member", "senior", False),
    ("member", "owner", False),
])
async def test_role_hierarchy_matrix(storage, user_role, min_role, should_pass):
    await _seed_team(storage, "team-1", "user-1", user_role)
    user = {"uid": "user-1"}

    if should_pass:
        await _run_guard(min_role, "team-1", user)
    else:
        with pytest.raises(HTTPException) as exc_info:
            await _run_guard(min_role, "team-1", user)
        assert exc_info.value.status_code == 403


async def test_non_member_rejected(storage):
    await _seed_team(storage, "team-1", "someone-else", "owner")
    user = {"uid": "user-not-in-team"}

    with pytest.raises(HTTPException) as exc_info:
        await _run_guard("member", "team-1", user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "NOT_A_MEMBER"


async def test_unauthenticated_request_rejected(storage):
    with pytest.raises(HTTPException) as exc_info:
        await _run_guard("member", "team-1", None)
    assert exc_info.value.status_code == 401


async def test_missing_team_id_rejected(storage):
    guard_dep = require_minimum_role("member")
    request = _make_request({}, {"uid": "user-1"})
    with pytest.raises(HTTPException) as exc_info:
        await guard_dep.dependency(request)
    assert exc_info.value.status_code == 400


async def test_membership_in_other_team_does_not_leak_access(storage):
    """A user who is owner of team-2 must not pass a check scoped to team-1."""
    await _seed_team(storage, "team-1", "someone-else", "owner")
    await _seed_team(storage, "team-2", "user-1", "owner")
    user = {"uid": "user-1"}

    with pytest.raises(HTTPException) as exc_info:
        await _run_guard("member", "team-1", user)
    assert exc_info.value.status_code == 403
