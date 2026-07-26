from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.services.feature_flag_service import FeatureFlagService
from app.api.v1.auth import get_current_user
from app.services.team_service import get_team_members

router = APIRouter(prefix="/feature-flags", tags=["feature-flags"])
flag_service = FeatureFlagService()


async def _ensure_team_access(team_id: str, user: dict) -> None:
    members = await get_team_members(team_id)
    member_ids = {m.get("id") or m.get("user_id") for m in members}
    if user["uid"] not in member_ids:
        raise HTTPException(status_code=403, detail="Not a member of this team")


class SetFlagRequest(BaseModel):
    enabled: bool


class FlagResponse(BaseModel):
    id: str
    team_id: str
    flag_name: str
    enabled: bool
    created_by: Optional[str] = None
    created_at: str
    updated_at: str


class FlagsListResponse(BaseModel):
    flags: List[FlagResponse]
    count: int


@router.get("/{team_id}", response_model=FlagsListResponse)
async def list_flags(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    await _ensure_team_access(team_id, user)
    flags = await flag_service.get_flags(team_id)
    return FlagsListResponse(flags=flags, count=len(flags))


@router.get("/{team_id}/{flag_name}")
async def get_flag(
    team_id: str,
    flag_name: str,
    user: dict = Depends(get_current_user),
):
    await _ensure_team_access(team_id, user)
    flag = await flag_service.get_flag(team_id, flag_name)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    return flag


@router.post("/{team_id}/{flag_name}", response_model=FlagResponse)
async def set_flag(
    team_id: str,
    flag_name: str,
    request: SetFlagRequest,
    user: dict = Depends(get_current_user),
):
    await _ensure_team_access(team_id, user)
    result = await flag_service.set_flag(team_id, flag_name, request.enabled, user["uid"])
    return FlagResponse(**result)


@router.delete("/{team_id}/{flag_name}")
async def delete_flag(
    team_id: str,
    flag_name: str,
    user: dict = Depends(get_current_user),
):
    await _ensure_team_access(team_id, user)
    deleted = await flag_service.delete_flag(team_id, flag_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    return {"deleted": True}
