from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.team_service import TeamService
from app.services.billing_service import BillingService

router = APIRouter(prefix="/teams", tags=["saas"])
team_service = TeamService()
billing = BillingService()


class CreateTeamRequest(BaseModel):
    name: str
    owner: str
    tier: str = "free"


class AddMemberRequest(BaseModel):
    user: str
    role: str = "member"


class InviteRequest(BaseModel):
    email: str
    invited_by: str


class ChangeTierRequest(BaseModel):
    tier: str


@router.post("")
async def create_team(request: CreateTeamRequest):
    team = await team_service.create_team(
        name=request.name,
        owner=request.owner,
        tier=request.tier,
    )
    sub = await billing.create_subscription(team["team_id"], request.tier)
    return {**team, "subscription": sub}


@router.get("")
async def list_teams(user: Optional[str] = None):
    teams = await team_service.list_teams(user)
    return {"teams": teams, "count": len(teams)}


@router.get("/{team_id}")
async def get_team(team_id: str):
    team = await team_service.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    sub = await billing.get_subscription(team_id)
    return {**team, "subscription": sub}


@router.post("/{team_id}/members")
async def add_member(team_id: str, request: AddMemberRequest):
    result = await team_service.add_member(team_id, request.user, request.role)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.delete("/{team_id}/members/{user}")
async def remove_member(team_id: str, user: str):
    return await team_service.remove_member(team_id, user)


@router.post("/{team_id}/invites")
async def create_invite(team_id: str, request: InviteRequest):
    return await team_service.create_invite(team_id, request.email, request.invited_by)


@router.get("/{team_id}/invites")
async def list_invites(team_id: str):
    invites = await team_service.get_invites(team_id)
    return {"invites": invites, "count": len(invites)}


@router.post("/{team_id}/tier")
async def change_tier(team_id: str, request: ChangeTierRequest):
    team_result = await team_service.change_tier(team_id, request.tier)
    if "error" in team_result:
        raise HTTPException(status_code=400, detail=team_result["error"])
    sub_result = await billing.update_subscription(team_id, request.tier)
    return {"team": team_result, "subscription": sub_result}


@router.get("/{team_id}/subscription")
async def get_subscription(team_id: str):
    sub = await billing.get_subscription(team_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    return sub
