"""Focused regression tests for tenant and action-specific authorization fixes."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api.v1 import explore, gamification, playbooks, tasks, teams
from app.services import marketplace_service, onboarding_plan_service, task_template_service


async def _seed_team(storage, team_id, user_id, role):
    now = datetime.now(timezone.utc)
    if not await storage.get_document("teams", team_id):
        await storage.create_document("teams", team_id, {"id": team_id, "name": team_id, "created_at": now, "updated_at": now})
    if not await storage.get_document("users", user_id):
        await storage.create_document("users", user_id, {"id": user_id, "name": user_id, "created_at": now, "updated_at": now})
    existing = await storage.query_documents(
        "team_members", [("team_id", "==", team_id), ("user_id", "==", user_id)]
    )
    if not existing:
        await storage.create_document(
            "team_members", f"member-{team_id}-{user_id}",
            {"team_id": team_id, "user_id": user_id, "role": role, "joined_at": now},
        )


async def test_generic_transition_does_not_bypass_senior_for_assignee(monkeypatch):
    task = {"task_id": "t1", "team_id": "team-a", "assigned_to": "dev", "state": "assigned"}
    monkeypatch.setattr(tasks, "get_task", lambda _task_id: _value(task))
    await _seed_team(__import__("app.services.postgres_db", fromlist=["get_storage"]).get_storage(), "team-a", "dev", "member")

    with pytest.raises(HTTPException) as exc:
        await tasks.transition_task_endpoint("t1", tasks.TransitionRequest(new_state="in_progress"), {"uid": "dev"})
    assert exc.value.status_code == 403


async def test_task_create_rejects_non_member_assignee(monkeypatch):
    storage = __import__("app.services.postgres_db", fromlist=["get_storage"]).get_storage()
    await _seed_team(storage, "team-a", "lead", "senior_dev")
    called = False

    async def fake_create(**_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr(tasks, "create_task", fake_create)
    with pytest.raises(HTTPException) as exc:
        await tasks.create_task_endpoint(
            tasks.CreateTaskRequest(team_id="team-a", title="Task", assigned_to="outsider"),
            {"uid": "lead"},
        )
    assert exc.value.status_code == 400
    assert not called


async def test_template_list_is_tenant_scoped_and_copy_rejects_cross_tenant(storage):
    await task_template_service.create_template("team-a", "lead-a", "A")
    await task_template_service.create_template("team-b", "lead-b", "B")
    templates = await task_template_service.list_templates(team_ids={"team-a"})
    assert [item["name"] for item in templates] == ["A"]

    foreign = await task_template_service.get_template(
        (await task_template_service.list_templates(team_id="team-b"))[0]["template_id"]
    )
    with pytest.raises(PermissionError):
        await task_template_service.bulk_assign_templates(
            "team-a", "dev", [foreign["template_id"]], "lead-a"
        )


async def test_explore_rejects_index_repo_mismatch(monkeypatch):
    request = explore.ExploreRequest(
        repo_url="https://github.com/acme/one", index_id="idx-1"
    )

    async def auth_index(*_args):
        return "team-a"

    class FakeContext:
        async def get(self, _index_id):
            return {"repo_url": "https://github.com/acme/two"}

    monkeypatch.setattr(explore, "authorize_repo_index", auth_index)
    monkeypatch.setattr(explore, "authorize_registered_repository", auth_index)
    monkeypatch.setattr("app.services.repo_context.RepoContextService", FakeContext)
    with pytest.raises(HTTPException) as exc:
        await explore._authorize_explore_target({"uid": "lead"}, request)
    assert exc.value.status_code == 400


async def test_onboarding_ownership_and_pulse_are_server_enforced(storage):
    plan_id = "plan-1"
    now = datetime.now(timezone.utc).isoformat()
    await storage.create_document("onboarding_plans", plan_id, {
        "id": plan_id, "team_id": "team-a", "user_id": "dev", "created_by": "lead",
        "created_at": now,
    })
    with pytest.raises(PermissionError):
        await onboarding_plan_service.update_plan(plan_id, {"user_id": "other"})
    with pytest.raises(PermissionError):
        await onboarding_plan_service.submit_pulse(plan_id, {"week_number": 1}, user_id="lead")


async def test_senior_cannot_remove_admin(monkeypatch):
    storage = __import__("app.services.postgres_db", fromlist=["get_storage"]).get_storage()
    await _seed_team(storage, "team-a", "senior", "senior_dev")
    await _seed_team(storage, "team-a", "admin-user", "admin")
    called = False

    async def fake_remove(*_args):
        nonlocal called
        called = True

    monkeypatch.setattr(teams.team_service, "remove_member", fake_remove)
    with pytest.raises(HTTPException) as exc:
        await teams.remove_member("team-a", "admin-user", {"uid": "senior"}, None)
    assert exc.value.status_code == 403
    assert not called


async def test_client_cannot_self_award_trusted_xp():
    with pytest.raises(HTTPException) as exc:
        await gamification.award_xp(
            gamification.AwardXpRequest(source="first_pr_merged"), {"uid": "dev"}
        )
    assert exc.value.status_code == 403


async def test_marketplace_source_must_be_caller_team_senior(storage, monkeypatch):
    await _seed_team(storage, "team-a", "lead", "senior_dev")
    await _seed_team(storage, "team-b", "outsider", "senior_dev")
    pb = await marketplace_service.PlaybookService().create_playbook(
        "team-b", "Secret", "secret", ["step"], "outsider"
    )
    service = marketplace_service.MarketplaceService()
    with pytest.raises(PermissionError):
        await service.publish(pb["playbook_id"], "lead")

    authorized = marketplace_service.MarketplaceService()
    listing = await authorized.publish(pb["playbook_id"], "outsider")
    assert "origin_team_id" not in listing
    assert "source_playbook_id" not in listing


async def test_playbook_mutation_requires_senior(monkeypatch):
    async def team_ids(_user):
        return {"team-a"}

    monkeypatch.setattr(playbooks, "_team_ids", team_ids)
    with pytest.raises(HTTPException) as exc:
        await playbooks._require_playbook_manager({"uid": "member"}, "team-a")
    assert exc.value.status_code == 403


async def _value(value):
    return value
