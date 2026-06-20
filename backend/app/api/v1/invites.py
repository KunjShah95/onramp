import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import Optional

from app.api.v1.auth import get_current_user
from app.middleware.access_guard import require_minimum_role
from app.services.invite_service import (
    create_invite,
    get_team_invites,
    get_user_pending_invites,
    accept_invite,
    cancel_invite,
)
from app.services.user_service import get_user_by_email

logger = logging.getLogger("codeflow.invites")
router = APIRouter(prefix="/invites", tags=["team-invites"])


class CreateInviteRequest(BaseModel):
    email: str
    role: str = "member"
    message: Optional[str] = None


@router.post("/teams/{team_id}")
async def create_team_invite(
    team_id: str,
    body: CreateInviteRequest,
    user: dict = Depends(get_current_user),
    _: None = require_minimum_role("senior"),
):
    """Create a pending invite for a new team member. Senior+ only."""
    invite = await create_invite(
        team_id=team_id,
        email=body.email,
        invited_by=user.get("uid", ""),
        role=body.role,
        message=body.message,
    )
    # Fetch team name for notifications
    from app.services.postgres_db import get_storage as _storage
    team_doc = await _storage().get_document("teams", team_id)
    team_name = team_doc.get("name", "") if team_doc else ""

    # If user with this email already exists, send in-app notification
    existing_user = await get_user_by_email(body.email)
    if existing_user:
        from app.services.notification_service import create_notification
        await create_notification(
            user_id=existing_user.get("uid", existing_user.get("id", "")),
            type="team_invite",
            title=f"You're invited to join {team_name}",
            message=f"{user.get('name', 'A senior')} invited you to join the team '{team_name}'.",
            metadata={
                "team_id": team_id,
                "invite_id": invite.get("id"),
                "token": invite.get("token"),
            },
            team_id=team_id,
        )
    # Send email notification
    try:
        from app.services.email_service import send_invite_email
        invite_link = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/join?token={invite.get('token')}"
        invited_by_name = user.get("name") or user.get("email", "A team member")
        await send_invite_email(body.email, invite_link, team_name, invited_by_name)
    except Exception:
        logger.exception("Failed to send invite email")
    return {
        "invite_id": invite.get("id"),
        "token": invite.get("token"),
        "email": body.email,
        "status": "pending",
    }


@router.get("/teams/{team_id}")
async def list_team_invites(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    """List all invites for a team. Senior+ only."""
    invites = await get_team_invites(team_id)
    return {"invites": invites, "count": len(invites)}


@router.delete("/teams/{team_id}/invites/{invite_id}")
async def cancel_team_invite(
    team_id: str,
    invite_id: str,
    user: dict = Depends(get_current_user),
    _: None = require_minimum_role("senior"),
):
    """Cancel a pending invite."""
    success = await cancel_invite(invite_id)
    if not success:
        raise HTTPException(status_code=404, detail="Invite not found or already resolved")
    return {"cancelled": True}


@router.post("/accept")
async def accept_team_invite(
    token: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Accept an invite using its token. Requires authentication."""
    # Verify the invite belongs to the authenticated user's email
    from app.services.invite_service import get_invite_by_token as _lookup
    invite = await _lookup(token)
    if invite:
        user_email = (user.get("email") or "").lower()
        invite_email = (invite.get("email") or "").lower()
        if user_email and invite_email and user_email != invite_email:
            raise HTTPException(
                status_code=403,
                detail="This invite was sent to a different email address",
            )
    try:
        result = await accept_invite(token, user.get("uid", ""))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me")
async def my_invites(user: dict = Depends(get_current_user)):
    """Get all pending invites for the current user."""
    email = user.get("email", "")
    if not email:
        return {"invites": [], "count": 0}
    invites = await get_user_pending_invites(email)
    # Enrich with team names
    from app.services.postgres_db import get_storage as _storage
    enriched = []
    for inv in invites:
        team = await _storage().get_document("teams", inv.get("team_id", ""))
        enriched.append({
            **inv,
            "team_name": team.get("name", "") if team else "",
        })
    return {"invites": enriched, "count": len(enriched)}
