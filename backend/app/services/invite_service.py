"""Invite Service — email-based team invitation with token acceptance."""

import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from app.services.postgres_db import get_storage, generate_id

COLLECTION = "team_invites"
INVITE_TTL_HOURS = 48


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_token() -> str:
    return secrets.token_urlsafe(24)  # 32 chars


async def create_invite(
    team_id: str,
    email: str,
    invited_by: str,
    role: str = "member",
    message: Optional[str] = None,
) -> dict:
    """Create a pending invite with a unique token."""
    storage = get_storage()
    now = _utcnow()
    token = _generate_token()

    invite = {
        "team_id": team_id,
        "email": email,
        "invited_by": invited_by,
        "token": token,
        "role": role,
        "status": "pending",
        "message": message or "",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=INVITE_TTL_HOURS)).isoformat(),
        "created_at": now,
        "updated_at": now,
    }

    invite_id = generate_id()
    await storage.create_document(COLLECTION, invite_id, invite)
    invite["id"] = invite_id
    return invite


async def get_invite_by_token(token: str) -> Optional[dict]:
    """Look up an invite by its token."""
    storage = get_storage()
    results = await storage.query_documents(COLLECTION, [("token", "==", token)])
    return results[0] if results else None


async def get_team_invites(team_id: str) -> List[dict]:
    """List all invites for a team, newest first."""
    storage = get_storage()
    results = await storage.query_documents(COLLECTION, [("team_id", "==", team_id)])
    results.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return results


async def get_user_pending_invites(email: str) -> List[dict]:
    """Get all pending, non-expired invites for an email."""
    storage = get_storage()
    results = await storage.query_documents(
        COLLECTION,
        [("email", "==", email), ("status", "==", "pending")],
    )
    now = _utcnow()
    valid = []
    for inv in results:
        if inv.get("expires_at", "") > now:
            valid.append(inv)
        else:
            # Auto-expire stale invites
            await storage.update_document(COLLECTION, inv["id"], {"status": "expired"})
    return valid


async def accept_invite(token: str, user_id: str) -> dict:
    """Accept an invite: validate, join team, mark accepted."""
    from app.services.team_service import add_member

    storage = get_storage()
    invite = await get_invite_by_token(token)

    if not invite:
        raise ValueError("Invite not found")

    if invite["status"] != "pending":
        raise ValueError(f"Invite is already {invite['status']}")

    if invite.get("expires_at", "") < _utcnow():
        await storage.update_document(COLLECTION, invite["id"], {"status": "expired"})
        raise ValueError("Invite has expired")

    # Add user to team
    team_id = invite["team_id"]
    role = invite.get("role", "member")
    await add_member(team_id, user_id, role=role)

    # Mark invite as accepted
    await storage.update_document(
        COLLECTION, invite["id"], {"status": "accepted", "updated_at": _utcnow()}
    )

    # Fetch team name for response
    team = await storage.get_document("teams", team_id)

    return {
        "success": True,
        "team_id": team_id,
        "team_name": team.get("name", "") if team else "",
        "role": role,
    }


async def cancel_invite(invite_id: str) -> bool:
    """Cancel a pending invite."""
    storage = get_storage()
    invite = await storage.get_document(COLLECTION, invite_id)
    if not invite or invite["status"] != "pending":
        return False
    await storage.update_document(COLLECTION, invite_id, {"status": "cancelled", "updated_at": _utcnow()})
    return True
