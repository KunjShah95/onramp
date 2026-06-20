from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.services.team_service import TeamService
from app.services.billing_service import BillingService
from app.services.access_control_service import (
    grant_module_access,
    revoke_module_access,
    revoke_all_module_access,
    get_user_modules,
    has_module_access,
    list_team_module_permissions,
    get_team_modules,
)
from app.api.v1.auth import get_current_user
from app.middleware.access_guard import require_minimum_role

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


# ── Module-level Access Control ─────────────────────────────


class GrantModuleRequest(BaseModel):
    user_id: str
    module: str


class RevokeModuleRequest(BaseModel):
    user_id: str
    module: str


class RevokeAllRequest(BaseModel):
    user_id: str


class ModulePermissionResponse(BaseModel):
    id: str
    user_id: str
    user_name: str
    module: str
    granted_by: str
    granted_at: str
    source: str


@router.get("/{team_id}/module-permissions")
async def get_team_module_permissions(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    """List all module permissions across all members of a team."""
    permissions = await list_team_module_permissions(team_id)
    modules = await get_team_modules(team_id)
    return {"permissions": permissions, "modules": modules, "count": len(permissions)}


@router.get("/{team_id}/module-permissions/{user_id}")
async def get_user_module_permissions(
    team_id: str,
    user_id: str,
    user: dict = Depends(get_current_user),
):
    """Get all module permissions for a specific user in a team."""
    records = await get_user_modules(team_id, user_id)
    modules = [r["module"] for r in records]
    return {"user_id": user_id, "modules": modules, "count": len(modules)}


@router.post("/{team_id}/module-permissions/grant")
async def grant_module(
    team_id: str,
    request: GrantModuleRequest,
    user: dict = Depends(get_current_user),
    _: None = require_minimum_role("senior"),
):
    """Grant a user access to a specific module.

    Only team owners/admins can grant module access.
    """
    # Verify the granter is an owner of the team
    teams = await team_service.list_teams(user.get("uid", ""))
    is_owner = any(
        t.get("team_id") == team_id and t.get("role") == "owner"
        for t in teams
    )
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Only team owners can grant module access",
        )

    try:
        result = await grant_module_access(
            team_id=team_id,
            user_id=request.user_id,
            module=request.module,
            granted_by=user.get("uid", ""),
            source="manual",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/{team_id}/module-permissions/revoke")
async def revoke_module(
    team_id: str,
    request: RevokeModuleRequest,
    user: dict = Depends(get_current_user),
    _: None = require_minimum_role("senior"),
):
    """Revoke a user's access to a specific module."""
    teams = await team_service.list_teams(user.get("uid", ""))
    is_owner = any(
        t.get("team_id") == team_id and t.get("role") == "owner"
        for t in teams
    )
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Only team owners can revoke module access",
        )

    success = await revoke_module_access(team_id, request.user_id, request.module)
    if not success:
        raise HTTPException(status_code=404, detail="Permission not found")
    return {"revoked": True, "user_id": request.user_id, "module": request.module}


@router.post("/{team_id}/module-permissions/revoke-all")
async def revoke_all_modules(
    team_id: str,
    request: RevokeAllRequest,
    user: dict = Depends(get_current_user),
):
    """Revoke ALL module access for a user."""
    teams = await team_service.list_teams(user.get("uid", ""))
    is_owner = any(
        t.get("team_id") == team_id and t.get("role") == "owner"
        for t in teams
    )
    if not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Only team owners can revoke module access",
        )

    count = await revoke_all_module_access(team_id, request.user_id)
    return {"revoked": count, "user_id": request.user_id}


@router.get("/{team_id}/module-permissions/check/{user_id}/{module}")
async def check_module_access(
    team_id: str,
    user_id: str,
    module: str,
    user: dict = Depends(get_current_user),
):
    """Check if a user has access to a specific module."""
    permitted = await has_module_access(team_id, user_id, module)
    return {"permitted": permitted}


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


@router.get("/{team_id}/members")
async def list_members(team_id: str):
    """List all members of a team with their roles."""
    from app.services.team_service import get_team_members as _get_members
    members = await _get_members(team_id)
    # Return just the essential fields for the dropdown
    return [
        {
            "user_id": m.get("user_id") or m.get("id", ""),
            "name": m.get("name", "") or m.get("email", "").split("@")[0] if m.get("email") else "",
            "role": m.get("role", "member"),
        }
        for m in members
    ]


@router.post("/{team_id}/members")
async def add_member(team_id: str, request: AddMemberRequest, user: dict = Depends(get_current_user), _: None = require_minimum_role("senior")):
    result = await team_service.add_member(team_id, request.user, request.role)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.delete("/{team_id}/members/{user}")
async def remove_member(team_id: str, user: str, _user: dict = Depends(get_current_user), _: None = require_minimum_role("senior")):
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
