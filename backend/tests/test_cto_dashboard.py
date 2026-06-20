"""
End-to-end tests for the CTO Dashboard endpoint.

Seeds real task and member data into the in-memory storage, then hits
GET /api/v1/dashboard/cto via TestClient and verifies every metric:

- Aggregate counts (total, completed, in_progress, pending_review, blocked)
- Completion rate
- Team composition (total_members, total_trainees)
- Per-member progress (tasks per state, modules_unlocked, completion_rate)
- Pending reviews list
- Recent activity ordering
- Derived actions (review, blocked, product sign-off)
"""

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.middleware.auth import AuthMiddleware
from app.api.v1.auth import get_current_user
from app.api.v1.dashboard import router as dashboard_router
from app.services.postgres_db import get_storage, generate_id
from app.services.team_service import add_member
from app.services.task_service import COLLECTION as TASK_COLLECTION

# ── Constants ──────────────────────────────────────────────────────────────

DEV_USER = "dev-user-id"       # the auth'd user (owner / senior)
TRAINEE_A = "trainee-alpha"    # a trainee with tasks
TRAINEE_B = "trainee-beta"    # another trainee
TEAM_ID = "test-dashboard-team"

NOW = "2026-06-19T12:00:00Z"


# ── Test app ──────────────────────────────────────────────────────────────

def _make_app():
    app = FastAPI()
    app.add_middleware(AuthMiddleware)
    app.include_router(dashboard_router, prefix="/api/v1")

    async def _test_user(request: Request = None):
        return {"uid": DEV_USER, "email": "senior@test.com", "name": "Senior Dev"}
    app.dependency_overrides[get_current_user] = _test_user
    return app


def _auth_headers() -> dict:
    return {"Authorization": "Bearer dev_user_token_that_is_long_enough"}


# ── Setup ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    """Enable auth dev bypass and clear all storage before each test."""
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    monkeypatch.setenv("ENV", "development")
    storage = get_storage()
    for coll in list(storage._data.keys()):
        storage._data[coll].clear()


async def _seed_users():
    """Create user records in the 'users' collection for all test users."""
    storage = get_storage()
    users = [
        {"id": DEV_USER,  "name": "Senior Dev",   "email": "senior@test.com"},
        {"id": TRAINEE_A, "name": "Trainee Alpha", "email": "alpha@test.com"},
        {"id": TRAINEE_B, "name": "Trainee Beta",  "email": "beta@test.com"},
    ]
    for u in users:
        await storage.create_document("users", u["id"], u)


async def _seed_team():
    """Create a team and add members (owner + 2 trainees)."""
    storage = get_storage()
    await storage.create_document("teams", TEAM_ID, {
        "id": TEAM_ID,
        "name": "Test Team",
        "is_active": True,
    })
    await add_member(TEAM_ID, DEV_USER,  role="owner")
    await add_member(TEAM_ID, TRAINEE_A, role="member")
    await add_member(TEAM_ID, TRAINEE_B, role="member")


async def _make_task(override: dict) -> str:
    """Insert a task directly into storage and return its task_id."""
    storage = get_storage()
    task_id = generate_id()
    task = {
        "task_id": task_id,
        "team_id": TEAM_ID,
        "created_by": DEV_USER,
        "assigned_to": None,
        "title": "Test task",
        "description": "",
        "module": "",
        "state": "pending",
        "priority": "medium",
        "pr_url": None,
        "branch": "",
        "repo_url": "",
        "unlock_modules": [],
        "review_feedback": None,
        "ai_review": None,
        "product_signoff": False,
        "estimated_hours": None,
        "created_at": NOW,
        "updated_at": NOW,
        "completed_at": None,
        **override,
    }
    await storage.create_document(TASK_COLLECTION, task_id, task)
    return task_id


# ════════════════════════════════════════════════════════════════════════════
# Tests
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_cto_dashboard_empty_team():
    """Dashboard returns zero metrics when there is no data."""
    await _seed_users()
    await _seed_team()

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()

    assert data["total_tasks"] == 0
    assert data["completed_tasks"] == 0
    assert data["in_progress_tasks"] == 0
    assert data["pending_review_tasks"] == 0
    assert data["blocked_tasks"] == 0
    assert data["completion_rate"] == 0.0
    assert data["total_members"] == 3
    assert data["total_trainees"] == 2
    assert data["pending_reviews"] == []
    assert data["recent_activity"] == []
    assert data["actions"] == []
    assert data["total_milestones"] == 0
    assert data["unique_contributors"] == 0
    assert data["first_prs_merged"] == 0

    # Each member should appear with zero-task metrics
    assert len(data["member_progress"]) == 3
    for mp in data["member_progress"]:
        assert mp["total"] == 0
        assert mp["completed"] == 0
        assert mp["completion_rate"] == 0.0
        assert mp["modules_unlocked"] == []


@pytest.mark.asyncio
async def test_cto_dashboard_aggregate_counts():
    """
    With a variety of tasks in different states, verify that the aggregate
    counts match what we expect.
    """
    await _seed_users()
    await _seed_team()

    # Create tasks in various states:
    #   Trainee A: 2 completed + 1 in_progress + 1 needs_changes = 4 tasks
    #   Trainee B: 1 submitted + 1 under_review = 2 tasks
    #   Unassigned: 1 pending = 1 task
    #   Total: 7

    await _make_task({
        "title": "Done A1", "assigned_to": TRAINEE_A, "state": "completed",
        "module": "auth", "completed_at": NOW,
    })
    await _make_task({
        "title": "Done A2", "assigned_to": TRAINEE_A, "state": "completed",
        "module": "api", "unlock_modules": ["api-v2"], "completed_at": NOW,
    })
    await _make_task({
        "title": "In Progress A3", "assigned_to": TRAINEE_A, "state": "in_progress",
        "module": "frontend",
    })
    await _make_task({
        "title": "Blocked A4", "assigned_to": TRAINEE_A, "state": "needs_changes",
        "module": "db",
    })

    await _make_task({
        "title": "Submitted B1", "assigned_to": TRAINEE_B, "state": "submitted",
        "module": "payments", "pr_url": "https://github.com/o/r/pull/1",
    })
    await _make_task({
        "title": "Under Review B2", "assigned_to": TRAINEE_B, "state": "under_review",
        "module": "deploy",
    })

    await _make_task({
        "title": "Pending unassigned", "assigned_to": None, "state": "pending",
    })

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()

    # ── Aggregates ────────────────────────────────────────────
    assert data["total_tasks"] == 7
    assert data["completed_tasks"] == 2
    assert data["in_progress_tasks"] == 1
    assert data["pending_review_tasks"] == 2     # submitted + under_review
    assert data["blocked_tasks"] == 1            # needs_changes
    assert data["completion_rate"] == round((2 / 7) * 100, 1)   # 28.6

    # ── Team ──────────────────────────────────────────────────
    assert data["total_members"] == 3
    assert data["total_trainees"] == 2

    # ── Pending reviews ───────────────────────────────────────
    assert len(data["pending_reviews"]) == 2
    review_titles = {r["title"] for r in data["pending_reviews"]}
    assert "Submitted B1" in review_titles
    assert "Under Review B2" in review_titles

    # ── Recent activity ───────────────────────────────────────
    assert len(data["recent_activity"]) == 7  # all tasks, sorted by updated_at
    # All tasks have the same updated_at (NOW), so insertion order is preserved
    # First-inserted task should appear last when sorted descending (stable sort)
    titles = [a["title"] for a in data["recent_activity"]]
    # All task titles should be present
    assert "Done A1" in titles
    assert "Done A2" in titles
    assert "In Progress A3" in titles
    assert "Blocked A4" in titles
    assert "Submitted B1" in titles
    assert "Under Review B2" in titles
    assert "Pending unassigned" in titles

    # ── Actions ───────────────────────────────────────────────
    # 2 pending review → 2 "Review:" actions
    # 1 needs_changes → 1 "Blocked:" action
    assert len(data["actions"]) == 3
    review_actions = [a for a in data["actions"] if a["title"].startswith("Review:")]
    blocked_actions = [a for a in data["actions"] if a["title"].startswith("Blocked:")]
    assert len(review_actions) == 2
    assert len(blocked_actions) == 1
    assert blocked_actions[0]["severity"] == "warning"


@pytest.mark.asyncio
async def test_cto_dashboard_member_progress():
    """
    Verify per-member progress breakdown and sorting by completion rate.
    """
    await _seed_users()
    await _seed_team()

    # Trainee A: 3 completed out of 4 tasks = 75%
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "m1", "completed_at": NOW,
    })
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "m2", "unlock_modules": ["mod-x"], "completed_at": NOW,
    })
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "m3", "completed_at": NOW,
    })
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "in_progress", "module": "m4",
    })

    # Trainee B: 0 completed out of 2 tasks = 0%
    await _make_task({
        "assigned_to": TRAINEE_B, "state": "submitted", "module": "m5",
    })
    await _make_task({
        "assigned_to": TRAINEE_B, "state": "needs_changes", "module": "m6",
    })

    # Senior (owner): 0 tasks
    # (no tasks assigned to DEV_USER)

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()

    member_progress = data["member_progress"]
    assert len(member_progress) == 3

    # Find each member's entry by user_id
    a_progress = next(m for m in member_progress if m["user_id"] == TRAINEE_A)
    b_progress = next(m for m in member_progress if m["user_id"] == TRAINEE_B)
    owner_progress = next(m for m in member_progress if m["user_id"] == DEV_USER)

    # Trainee A: 4 tasks, 3 completed, 1 in_progress, 0 pending_review
    assert a_progress["total"] == 4
    assert a_progress["completed"] == 3
    assert a_progress["in_progress"] == 1
    assert a_progress["pending_review"] == 0
    assert a_progress["completion_rate"] == 75.0
    assert "mod-x" in a_progress["modules_unlocked"]

    # Trainee B: 2 tasks, 0 completed, 1 pending_review (submitted)
    assert b_progress["total"] == 2
    assert b_progress["completed"] == 0
    assert b_progress["in_progress"] == 0
    assert b_progress["pending_review"] == 1  # submitted counts as pending_review
    assert b_progress["completion_rate"] == 0.0
    assert b_progress["modules_unlocked"] == []

    # Owner: 0 tasks (DEV_USER has no assigned tasks)
    assert owner_progress["total"] == 0
    assert owner_progress["completed"] == 0

    # Sorting: highest completion rate first (Trainee A 75% → Trainee B 0% → Owner 0%)
    # Ties (0%) should keep insertion order
    rates = [m["completion_rate"] for m in member_progress]
    assert rates[0] >= rates[1]
    assert rates[1] >= rates[2]


@pytest.mark.asyncio
async def test_cto_dashboard_modules_unlocked():
    """
    Completed tasks with unlock_modules should accumulate in the member's
    modules_unlocked list.
    """
    await _seed_users()
    await _seed_team()

    # Trainee A completes two tasks that unlock different modules
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "auth", "unlock_modules": ["api-core", "user-auth"],
        "completed_at": NOW,
    })
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "frontend", "unlock_modules": ["react-components"],
        "completed_at": NOW,
    })
    # A third completed task has no unlock_modules — doesn't add anything
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "docs", "unlock_modules": [],
        "completed_at": NOW,
    })

    # Trainee B has no completed tasks
    await _make_task({
        "assigned_to": TRAINEE_B, "state": "in_progress", "module": "db",
    })

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    data = resp.json()

    a_progress = next(m for m in data["member_progress"] if m["user_id"] == TRAINEE_A)
    b_progress = next(m for m in data["member_progress"] if m["user_id"] == TRAINEE_B)

    # Trainee A should have 3 distinct modules unlocked
    assert sorted(a_progress["modules_unlocked"]) == [
        "api-core", "react-components", "user-auth",
    ]
    assert a_progress["total"] == 3
    assert a_progress["completed"] == 3
    assert a_progress["completion_rate"] == 100.0

    # Trainee B has no completed tasks → no unlocked modules
    assert b_progress["modules_unlocked"] == []


@pytest.mark.asyncio
async def test_cto_dashboard_recent_activity_ordering():
    """
    Recent activity must be sorted by updated_at descending (most recent first).
    """
    await _seed_users()
    await _seed_team()

    earlier = "2026-06-18T10:00:00Z"
    middle = "2026-06-18T14:00:00Z"
    latest = "2026-06-19T08:00:00Z"

    await _make_task({
        "title": "Oldest",
        "assigned_to": TRAINEE_A, "state": "completed",
        "created_at": earlier, "updated_at": earlier, "completed_at": earlier,
    })
    await _make_task({
        "title": "Middle",
        "assigned_to": TRAINEE_B, "state": "in_progress",
        "created_at": middle, "updated_at": middle,
    })
    await _make_task({
        "title": "Newest",
        "assigned_to": TRAINEE_A, "state": "submitted",
        "created_at": latest, "updated_at": latest,
        "pr_url": "https://github.com/o/r/pull/99",
    })

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    activity = resp.json()["recent_activity"]

    assert len(activity) == 3
    assert activity[0]["title"] == "Newest"
    assert activity[1]["title"] == "Middle"
    assert activity[2]["title"] == "Oldest"

    # Verify the ordering is by updated_at descending
    times = [a["updated_at"] for a in activity]
    assert times == sorted(times, reverse=True)


@pytest.mark.asyncio
async def test_cto_dashboard_pending_reviews_includes_pr_url():
    """
    Pending review items should include pr_url and module info.
    """
    await _seed_users()
    await _seed_team()

    await _make_task({
        "title": "PR Task",
        "assigned_to": TRAINEE_B, "state": "submitted",
        "module": "ci-cd",
        "pr_url": "https://github.com/org/repo/pull/101",
    })

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    reviews = resp.json()["pending_reviews"]

    assert len(reviews) == 1
    r = reviews[0]
    assert r["title"] == "PR Task"
    assert r["state"] == "submitted"
    assert r["module"] == "ci-cd"
    assert r["pr_url"] == "https://github.com/org/repo/pull/101"
    assert r["assigned_to"] == TRAINEE_B
    assert r["task_id"] is not None
    assert r["created_at"] is not None


@pytest.mark.asyncio
async def test_cto_dashboard_product_review_action():
    """
    Tasks in 'product_review' state generate a 'Product sign-off:' action.
    """
    await _seed_users()
    await _seed_team()

    await _make_task({
        "title": "Product task",
        "assigned_to": TRAINEE_A, "state": "product_review",
        "module": "ux-redesign",
    })

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())

    assert resp.status_code == 200
    actions = resp.json()["actions"]

    product_actions = [a for a in actions if a["title"].startswith("Product sign-off:")]
    assert len(product_actions) == 1
    assert product_actions[0]["severity"] == "info"
    # The subtitle for product-review actions is hardcoded to "Awaiting product team approval"
    assert product_actions[0]["subtitle"] == "Awaiting product team approval"


@pytest.mark.asyncio
async def test_cto_dashboard_unauthenticated():
    """
    Unauthenticated requests should receive 401.
    """
    await _seed_users()
    await _seed_team()

    app = _make_app()
    with TestClient(app) as client:
        resp = client.get("/api/v1/dashboard/cto")  # no auth headers

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cto_dashboard_team_analytics_same_data():
    """
    The /dashboard/team endpoint should return per-member data consistent
    with the member_progress from the CTO dashboard.
    """
    await _seed_users()
    await _seed_team()

    await _make_task({
        "assigned_to": TRAINEE_A, "state": "completed",
        "module": "m1", "unlock_modules": ["mod-x"], "completed_at": NOW,
    })
    await _make_task({
        "assigned_to": TRAINEE_A, "state": "in_progress", "module": "m2",
    })
    await _make_task({
        "assigned_to": TRAINEE_B, "state": "submitted", "module": "m3",
    })

    app = _make_app()
    with TestClient(app) as client:
        cto_resp = client.get("/api/v1/dashboard/cto", headers=_auth_headers())
        team_resp = client.get("/api/v1/dashboard/team", headers=_auth_headers())

    assert cto_resp.status_code == 200
    assert team_resp.status_code == 200

    cto_members = cto_resp.json()["member_progress"]
    team_members = team_resp.json()["members"]

    # Both should have 3 members sorted by completion rate
    assert len(cto_members) == len(team_members) == 3

    # Match by user_id and compare key fields
    for tm in team_members:
        cm = next(m for m in cto_members if m["user_id"] == tm["user_id"])
        assert tm["total_tasks"] == cm["total"]
        assert tm["completed_tasks"] == cm["completed"]
        assert tm["in_progress_tasks"] == cm["in_progress"]
        assert tm["pending_review"] == cm["pending_review"]
        assert tm["completion_rate"] == cm["completion_rate"]
        assert tm["modules_unlocked"] == cm["modules_unlocked"]
        assert tm["role"] == cm["role"]
