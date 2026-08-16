"""
Tests for the Review Operations service (v1.5 — load balancing + consistency).

Runs against InMemoryStorage by default (STORAGE_BACKEND=memory from
conftest). Covers: the reviewer load board, the least-loaded suggestion
(excluding the task assignee, tie-breaking on rework), consistency scoring
(turnaround + calibration, null below the data floor), the reviewer
attribution fix in task_service, and endpoint authz.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.services import review_ops_service as ops
from app.services import task_service
from app.services.postgres_db import get_storage, generate_id


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _seed_team(storage, team_id="team-ro-1") -> str:
    await storage.create_document("teams", team_id, {
        "id": team_id,
        "name": "Review Ops Team",
        "description": "",
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
    })
    return team_id


async def _seed_user(storage, uid: str, name: str) -> None:
    await storage.create_document("users", uid, {
        "id": uid,
        "name": name,
        "email": f"{uid}@test.com",
        "provider": "password",
        "is_active": True,
    })


async def _seed_member(storage, team_id: str, uid: str, role: str) -> None:
    await storage.create_document("team_members", generate_id(), {
        "user_id": uid,
        "team_id": team_id,
        "role": role,
        "joined_at": _now() - timedelta(days=200),
    })


async def _seed_task(
    storage,
    team_id: str,
    state: str,
    created_by: str,
    reviewed_by: str | None = None,
    peer_reviewed_by: str | None = None,
    submitted_days_ago: int | None = 3,
    reviewed_days_ago: int | None = 1,
    review_cycles: int = 0,
    title: str = "Task",
) -> dict:
    task = {
        "task_id": generate_id(),
        "team_id": team_id,
        "created_by": created_by,
        "assigned_to": "trainee-1",
        "title": title,
        "module": "core",
        "state": state,
        "review_cycles": review_cycles,
        "reviewed_by": reviewed_by,
        "peer_reviewed_by": peer_reviewed_by,
        "created_at": _now() - timedelta(days=10),
        "updated_at": _now(),
        "started_at": None,
        "submitted_at": (
            _now() - timedelta(days=submitted_days_ago)
            if submitted_days_ago is not None else None
        ),
        "reviewed_at": (
            _now() - timedelta(days=reviewed_days_ago)
            if reviewed_days_ago is not None else None
        ),
        "completed_at": None,
    }
    await storage.create_document("onramp_tasks", task["task_id"], task)
    return task


# ── Load board ─────────────────────────────────────────────────────────────


async def test_reviewer_load_counts_and_scores():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_user(storage, "senior-2", "Tom")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    await _seed_member(storage, "team-ro-1", "senior-2", "senior_dev")

    # senior-1 is the creator of 3 submitted tasks (pending) + 1 claimed.
    for i in range(3):
        await _seed_task(storage, "team-ro-1", "submitted", created_by="senior-1",
                         title=f"P{i}")
    await _seed_task(storage, "team-ro-1", "under_review", created_by="senior-1",
                     reviewed_by="senior-1", title="claimed")
    # senior-2 has one approved task (no pending load).
    await _seed_task(storage, "team-ro-1", "approved", created_by="senior-2",
                     reviewed_by="senior-2", title="done")

    board = await ops.reviewer_load("team-ro-1")
    by_id = {r["user_id"]: r for r in board["reviewers"]}

    assert by_id["senior-1"]["pending"] == 4  # 3 created + 1 claimed
    assert by_id["senior-1"]["in_review"] == 1
    assert by_id["senior-1"]["load_score"] == min(100, 4 * 25 + 1 * 12)
    assert by_id["senior-2"]["pending"] == 0
    assert by_id["senior-2"]["load_score"] == 0
    # Busiest reviewer sorts first.
    assert board["reviewers"][0]["user_id"] == "senior-1"


async def test_reviewer_load_does_not_double_count_resubmitted_task():
    """Regression: a re-submitted task keeps its previous cycle's reviewed_by,
    but pending load must attribute to the creator only — otherwise the
    prior-cycle reviewer's load is inflated."""
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_user(storage, "senior-2", "Tom")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    await _seed_member(storage, "team-ro-1", "senior-2", "senior_dev")

    # senior-2 reviewed a task (needs_changes) in cycle 1; the trainee fixed
    # it and re-submitted. reviewed_by still holds senior-2 from cycle 1.
    task = await _seed_task(storage, "team-ro-1", "submitted", created_by="senior-1",
                            reviewed_by="senior-2", title="recycled")

    board = await ops.reviewer_load("team-ro-1")
    by_id = {r["user_id"]: r for r in board["reviewers"]}
    # Only the creator carries the pending load.
    assert by_id["senior-1"]["pending"] == 1
    assert by_id["senior-2"]["pending"] == 0


async def test_reviewer_load_oldest_wait_hours():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    # One task submitted 5 days ago → 120h wait.
    await _seed_task(storage, "team-ro-1", "submitted", created_by="senior-1",
                     submitted_days_ago=5, title="old")

    board = await ops.reviewer_load("team-ro-1")
    entry = board["reviewers"][0]
    assert entry["oldest_wait_hours"] == pytest.approx(120.0, abs=2.0)


# ── Suggestion (load-balanced routing) ─────────────────────────────────────


async def test_suggest_reviewer_picks_least_loaded():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_user(storage, "senior-2", "Tom")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    await _seed_member(storage, "team-ro-1", "senior-2", "senior_dev")

    # senior-1 is buried; senior-2 is free → suggestion must be senior-2.
    for i in range(4):
        await _seed_task(storage, "team-ro-1", "submitted", created_by="senior-1",
                         title=f"P{i}")

    result = await ops.suggest_reviewer("team-ro-1")
    assert result["suggestion"]["user_id"] == "senior-2"
    assert result["suggestion"]["pending"] == 0


async def test_suggest_reviewer_excludes_assignee():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_user(storage, "trainee-1", "Alice")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    await _seed_member(storage, "team-ro-1", "trainee-1", "junior_dev")

    # The only candidate (senior-1) is also the task assignee → no suggestion.
    task = await _seed_task(storage, "team-ro-1", "submitted", created_by="senior-1",
                            title="own work")
    await storage.update_document("onramp_tasks", task["task_id"], {"assigned_to": "senior-1"})

    result = await ops.suggest_reviewer("team-ro-1", task_id=task["task_id"])
    assert result["suggestion"] is None


async def test_suggest_reviewer_tie_breaks_on_rework():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_user(storage, "senior-2", "Tom")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    await _seed_member(storage, "team-ro-1", "senior-2", "senior_dev")

    # Both at zero load; senior-1 has a 100% rework history, senior-2 is clean.
    await _seed_task(storage, "team-ro-1", "needs_changes", created_by="senior-2",
                     reviewed_by="senior-1", title="bounce")
    await _seed_task(storage, "team-ro-1", "approved", created_by="senior-1",
                     reviewed_by="senior-2", title="clean")

    result = await ops.suggest_reviewer("team-ro-1")
    assert result["suggestion"]["user_id"] == "senior-2"
    assert result["suggestion"]["rework_pct"] == 0.0


# ── Consistency scoring ────────────────────────────────────────────────────


async def test_consistency_scores_metrics_and_floor():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")

    # 2 clean approvals, 1 needs_changes → 3 reviews (at the score floor).
    await _seed_task(storage, "team-ro-1", "approved", created_by="trainee-1",
                     reviewed_by="senior-1", submitted_days_ago=2, reviewed_days_ago=1,
                     title="A")
    await _seed_task(storage, "team-ro-1", "completed", created_by="trainee-1",
                     reviewed_by="senior-1", submitted_days_ago=4, reviewed_days_ago=3,
                     title="B")
    await _seed_task(storage, "team-ro-1", "needs_changes", created_by="trainee-1",
                     reviewed_by="senior-1", submitted_days_ago=6, reviewed_days_ago=5,
                     title="C")

    scores = await ops.consistency_scores("team-ro-1")
    entry = scores["reviewers"][0]
    assert entry["reviews"] == 3
    assert entry["approved"] == 2
    assert entry["changes_requested"] == 1
    assert entry["rework_rate_pct"] == pytest.approx(33.3, abs=0.1)
    # 24h turnarounds → avg 24.0h
    assert entry["avg_turnaround_hours"] == pytest.approx(24.0, abs=1.0)
    # 3 reviews meets the floor → scored.
    assert entry["confidence"] == "ok"
    assert entry["score"] is not None and 0 <= entry["score"] <= 100


async def test_consistency_score_insufficient_below_floor():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")

    await _seed_task(storage, "team-ro-1", "approved", created_by="trainee-1",
                     reviewed_by="senior-1", title="only one")

    scores = await ops.consistency_scores("team-ro-1")
    entry = scores["reviewers"][0]
    assert entry["reviews"] == 1
    assert entry["confidence"] == "insufficient"
    assert entry["score"] is None


# ── Reviewer attribution in the state machine ──────────────────────────────


async def test_transition_records_reviewer_on_outcomes():
    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")
    task = await _seed_task(storage, "team-ro-1", "submitted", created_by="senior-1",
                            title="to review")

    # needs_changes records the reviewer.
    bounced = await task_service.review_task(task["task_id"], "senior-1", {}, approve=False)
    assert bounced["reviewed_by"] == "senior-1"

    # Back to submitted → approved records the reviewer too.
    await task_service.transition_task(task["task_id"], "in_progress", "trainee-1")
    await task_service.transition_task(task["task_id"], "submitted", "trainee-1")
    approved = await task_service.review_task(task["task_id"], "senior-1", {}, approve=True)
    assert approved["reviewed_by"] == "senior-1"


# ── API authz ──────────────────────────────────────────────────────────────


async def test_review_ops_authz_non_member_forbidden():
    from fastapi import HTTPException

    from app.api.v1.review_ops import _require_member

    storage = get_storage()
    await _seed_team(storage)
    await _seed_user(storage, "senior-1", "Sara")
    await _seed_user(storage, "outsider", "Oscar")
    await _seed_member(storage, "team-ro-1", "senior-1", "senior_dev")

    with pytest.raises(HTTPException) as exc:
        await _require_member({"uid": "outsider"}, "team-ro-1")
    assert exc.value.status_code == 403

    # A member passes.
    await _require_member({"uid": "senior-1"}, "team-ro-1")


async def test_review_ops_endpoints_unauthenticated_401():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    for path in ("/api/v1/review-ops/load", "/api/v1/review-ops/suggest",
                 "/api/v1/review-ops/consistency"):
        res = client.get(path)
        assert res.status_code == 401, path
