from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.services.audit_service import query_events
from app.api.v1.auth import get_current_user

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
    events = await query_events(
        team_id=team_id,
        actor_id=actor_id,
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
    events = await query_events(
        actor_id=uid,
        team_id=team_id,
        limit=limit,
    )
    return {"events": events, "count": len(events)}
