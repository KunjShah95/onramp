from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.services.audit_service import query_events
from app.api.v1.auth import get_current_user
from app.services.team_service import get_user_teams

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
async def list_audit_events(
    team_id: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    user_team_ids = {t.get("team_id") or t.get("id") for t in teams}

    # actor_id must be the caller — no reading another user's history
    if actor_id and actor_id != uid:
        raise HTTPException(status_code=403, detail="Cannot query another user's audit events")

    # team_id must be one the caller belongs to
    if team_id and team_id not in user_team_ids:
        raise HTTPException(status_code=403, detail="Not a member of the requested team")

    # No filters supplied: scope to caller's own events only
    effective_actor = actor_id or uid

    events = await query_events(
        team_id=team_id,
        actor_id=effective_actor,
        target_id=target_id,
        event_type=event_type,
        limit=limit,
    )
    return {"events": events, "count": len(events)}


@router.get("/my")
async def my_audit_events(
    team_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    uid = user.get("uid", "")
    if team_id:
        teams = await get_user_teams(uid)
        user_team_ids = {t.get("team_id") or t.get("id") for t in teams}
        if team_id not in user_team_ids:
            raise HTTPException(status_code=403, detail="Not a member of the requested team")
    events = await query_events(
        actor_id=uid,
        team_id=team_id,
        limit=limit,
    )
    return {"events": events, "count": len(events)}
