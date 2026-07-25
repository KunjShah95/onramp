import logging
from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.auth import get_current_user
from app.services import onboarding_plan_service as ops

logger = logging.getLogger("onramp.api.onboarding_plans")

router = APIRouter(prefix="/onboarding-plans", tags=["onboarding-plans"])


@router.post("")
async def create_plan(payload: dict, user: dict = Depends(get_current_user)):
    team_id = payload.get("team_id")
    target_user_id = payload.get("user_id")
    if not team_id or not target_user_id:
        raise HTTPException(status_code=400, detail="team_id and user_id required")
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
    return await ops.list_plans(team_id=team_id, user_id=user_id)


@router.get("/{plan_id}")
async def get_plan(plan_id: str, user: dict = Depends(get_current_user)):
    plan = await ops.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.patch("/{plan_id}")
async def update_plan(plan_id: str, payload: dict, user: dict = Depends(get_current_user)):
    plan = await ops.update_plan(plan_id, payload)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.post("/{plan_id}/pulse")
async def submit_pulse(plan_id: str, payload: dict, user: dict = Depends(get_current_user)):
    pulse = await ops.submit_pulse(plan_id, payload)
    return pulse


@router.get("/{plan_id}/pulse-trends")
async def get_pulse_trends(plan_id: str, user: dict = Depends(get_current_user)):
    return await ops.get_pulse_trends(plan_id)


@router.post("/milestones/{milestone_id}/complete")
async def complete_milestone(milestone_id: str, user: dict = Depends(get_current_user)):
    m = await ops.complete_milestone(milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return m


@router.post("/pre-boarding/{task_id}/complete")
async def complete_preboarding(task_id: str, user: dict = Depends(get_current_user)):
    t = await ops.complete_preboarding(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Pre-boarding task not found")
    return t


@router.get("/team/{team_id}/pulse-overview")
async def team_pulse_overview(team_id: str, user: dict = Depends(get_current_user)):
    return {"members": await ops.get_team_pulse_overview(team_id)}
