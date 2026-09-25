import logging
from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.auth import get_current_user
from app.services import onboarding_plan_service as ops

logger = logging.getLogger("onramp.api.onboarding_plans")

router = APIRouter(prefix="/onboarding-plans", tags=["onboarding-plans"])


async def _require_team_member(user: dict, team_id: str) -> None:
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")
    from app.services.team_service import get_team_members
    members = await get_team_members(team_id)
    uid = user.get("uid", "")
    if not any((member.get("user_id") or member.get("id")) == uid for member in members or []):
        raise HTTPException(status_code=403, detail="Not a member of this team")


async def _assert_plan_access(plan: dict, user: dict) -> None:
    uid = user.get("uid", "")
    if plan.get("user_id") == uid or plan.get("created_by") == uid:
        return
    await _require_team_member(user, plan.get("team_id"))


async def _get_authorized_plan(plan_id: str, user: dict) -> dict:
    plan = await ops.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    await _assert_plan_access(plan, user)
    return plan


@router.post("")
async def create_plan(payload: dict, user: dict = Depends(get_current_user)):
    team_id = payload.get("team_id")
    target_user_id = payload.get("user_id")
    if not team_id or not target_user_id:
        raise HTTPException(status_code=400, detail="team_id and user_id required")
    await _require_team_member(user, team_id)
    from app.services.team_service import get_team_members
    members = await get_team_members(team_id)
    if not any((member.get("user_id") or member.get("id")) == target_user_id for member in members or []):
        raise HTTPException(status_code=403, detail="Target user is not a member of this team")
    plan = await ops.create_plan(
        team_id=team_id, user_id=target_user_id,
        created_by=user["uid"],
        start_date=payload.get("start_date"),
        buddy_id=payload.get("buddy_id"),
        notes=payload.get("notes"),
    )
    if not plan:
        raise HTTPException(status_code=500, detail="Failed to create plan")
    return plan


@router.get("")
async def list_plans(team_id: str | None = None, user_id: str | None = None,
                     user: dict = Depends(get_current_user)):
    uid = user.get("uid", "")
    if team_id:
        await _require_team_member(user, team_id)
        return await ops.list_plans(team_id=team_id)
    if user_id and user_id != uid:
        # A caller may inspect their own plans; team-wide visibility is
        # available through an explicit team_id that has been authorized.
        raise HTTPException(status_code=403, detail="Not your onboarding plans")
    from app.services.team_service import get_user_teams
    teams = await get_user_teams(uid)
    if user_id:
        return await ops.list_plans(user_id=uid)
    if teams:
        visible: dict[str, dict] = {}
        for team in teams:
            tid = team.get("id") or team.get("team_id")
            for plan in await ops.list_plans(team_id=tid):
                visible[plan["id"]] = plan
        return list(visible.values())
    return await ops.list_plans(user_id=uid)


@router.get("/{plan_id}",
    responses={404: {"description": "Plan not found"}})
async def get_plan(plan_id: str, user: dict = Depends(get_current_user)):
    plan = await _get_authorized_plan(plan_id, user)
    return plan


@router.get("/{plan_id}/progress",
    responses={404: {"description": "Plan not found"}})
async def get_plan_progress(plan_id: str, user: dict = Depends(get_current_user)):
    """Compact first-10-days progress view for the plan dashboard."""
    await _get_authorized_plan(plan_id, user)
    progress = await ops.get_plan_progress(plan_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Plan not found")
    return progress


@router.get("/{plan_id}/roadmap",
    responses={404: {"description": "Plan not found"}})
async def get_plan_roadmap(plan_id: str, user: dict = Depends(get_current_user)):
    """Milestone roadmap with statuses (locked / available / in_progress / completed)."""
    await _get_authorized_plan(plan_id, user)
    roadmap = await ops.get_roadmap(plan_id)
    if not roadmap:
        raise HTTPException(status_code=404, detail="Plan not found")
    return roadmap


@router.patch("/{plan_id}",
    responses={404: {"description": "Plan not found"}})
async def update_plan(plan_id: str, payload: dict, user: dict = Depends(get_current_user)):
    plan = await _get_authorized_plan(plan_id, user)
    immutable = {"id", "team_id", "user_id", "created_by", "created_at"}
    supplied_ownership = immutable.intersection(payload)
    if supplied_ownership:
        raise HTTPException(
            status_code=403,
            detail=f"Onboarding plan ownership fields are immutable: {', '.join(sorted(supplied_ownership))}",
        )
    buddy_id = payload.get("buddy_id")
    if buddy_id:
        await _require_team_member({"uid": buddy_id}, str(plan.get("team_id") or ""))
    try:
        updated = await ops.update_plan(plan_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not updated:
        raise HTTPException(status_code=404, detail="Plan not found")
    return updated


@router.post("/{plan_id}/pulse")
async def submit_pulse(plan_id: str, payload: dict, user: dict = Depends(get_current_user)):
    plan = await _get_authorized_plan(plan_id, user)
    if str(plan.get("user_id") or "") != str(user.get("uid") or ""):
        raise HTTPException(status_code=403, detail="Only the onboarding plan owner may submit a pulse")
    try:
        return await ops.submit_pulse(plan_id, payload, user_id=user.get("uid", ""))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.get("/{plan_id}/pulse-trends")
async def get_pulse_trends(plan_id: str, user: dict = Depends(get_current_user)):
    await _get_authorized_plan(plan_id, user)
    return await ops.get_pulse_trends(plan_id)


@router.post("/milestones/{milestone_id}/complete")
async def complete_milestone(milestone_id: str, user: dict = Depends(get_current_user)):
    from app.services.postgres_db import get_storage
    milestone = await get_storage().get_document("onboarding_milestones", milestone_id)
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    await _get_authorized_plan(milestone.get("plan_id"), user)
    m = await ops.complete_milestone(milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return m


@router.post("/pre-boarding/{task_id}/complete")
async def complete_preboarding(task_id: str, user: dict = Depends(get_current_user)):
    from app.services.postgres_db import get_storage
    task = await get_storage().get_document("pre_boarding_tasks", task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Pre-boarding task not found")
    await _get_authorized_plan(task.get("plan_id"), user)
    t = await ops.complete_preboarding(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Pre-boarding task not found")
    return t


@router.get("/team/{team_id}/pulse-overview")
async def team_pulse_overview(team_id: str, user: dict = Depends(get_current_user)):
    await _require_team_member(user, team_id)
    return {"members": await ops.get_team_pulse_overview(team_id)}


@router.post("/generate")
async def generate_plan(payload: dict, user: dict = Depends(get_current_user)):
    """AI-generated onboarding plan — senior picks repo + role.

    Explores the codebase and generates curriculum milestones from the
    learning path, connected to the explore agent.
    """
    team_id = payload.get("team_id")
    target_user_id = payload.get("user_id")
    repo_url = payload.get("repo_url")
    if not team_id or not target_user_id or not repo_url:
        raise HTTPException(status_code=400, detail="team_id, user_id, and repo_url required")
    await _require_team_member(user, team_id)
    from app.services.repo_index_access import find_registered_repository
    repository = await find_registered_repository(repo_url)
    if not repository:
        raise HTTPException(status_code=404, detail="Repository is not registered for this workspace")
    if str(repository.get("team_id")) != str(team_id):
        raise HTTPException(status_code=403, detail="Repository belongs to another team")
    from app.services.team_service import get_team_members
    members = await get_team_members(team_id)
    if not any((member.get("user_id") or member.get("id")) == target_user_id for member in members or []):
        raise HTTPException(status_code=403, detail="Target user is not a member of this team")
    plan = await ops.generate_plan_from_learning_path(
        team_id=team_id,
        user_id=target_user_id,
        created_by=user["uid"],
        repo_url=repo_url,
        role=payload.get("role", "junior_dev"),
        notes=payload.get("notes"),
    )
    if not plan:
        raise HTTPException(status_code=500, detail="Failed to generate plan")
    return plan
