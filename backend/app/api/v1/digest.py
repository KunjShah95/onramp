"""
Digest API — endpoints for triggering and previewing daily/weekly digests.

Uses the DigestService to collect data across notifications, tasks, modules,
and quiz results, then sends the digest via email.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text
from typing import Optional

from app.api.v1.auth import get_current_user
from app.database.config import db_config
from app.services.digest_service import generate_and_send_digest, build_digest_sections
from app.services.postgres_db import get_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/digest", tags=["digest"])


class TriggerDigestRequest(BaseModel):
    period: str = "daily"  # "daily" or "weekly"
    team_id: Optional[str] = None


@router.post("/trigger")
async def trigger_digest(
    request: TriggerDigestRequest,
    user: dict = Depends(get_current_user),
):
    """Trigger a digest for the current user (daily or weekly).

    Use this endpoint to manually send a digest at any time, or it can
    be called by a scheduled job (cron, scheduler) at the configured interval.
    """
    uid = user.get("uid", "")
    email = user.get("email", "")
    name = user.get("name", "") or user.get("email", "") or uid

    if not email:
        raise HTTPException(status_code=400, detail="User has no email configured for digests")

    if request.period not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    result = await generate_and_send_digest(
        user_id=uid,
        user_email=email,
        user_name=name,
        period=request.period,
        team_id=request.team_id,
    )

    return {
        "user_id": uid,
        "period": request.period,
        "sections": len(result.get("sections", [])),
        "total_items": result.get("total_items", 0),
        "sent": result.get("sent", False),
        "reason": result.get("reason"),
    }


@router.post("/preview")
async def preview_digest(
    request: TriggerDigestRequest,
    user: dict = Depends(get_current_user),
):
    """Preview a digest without sending it (returns section data)."""
    uid = user.get("uid", "")

    if request.period not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    sections = await build_digest_sections(
        user_id=uid,
        period=request.period,
        team_id=request.team_id,
    )

    total_items = sum(len(s.get("items", [])) for s in sections)

    return {
        "user_id": uid,
        "period": request.period,
        "sections": sections,
        "total_items": total_items,
    }


@router.get("/config")
async def get_digest_config(
    user: dict = Depends(get_current_user),
):
    """Get the user's current digest configuration (from notification preferences)."""
    uid = user.get("uid", "")
    from app.services.notification_service import get_preferences

    prefs = await get_preferences(uid)

    return {
        "user_id": uid,
        "digest_frequency": prefs.get("digest_frequency", "daily"),
        "email_digest_time": prefs.get("email_digest_time", "09:00"),
        "available_periods": ["daily", "weekly"],
    }


@router.post("/batch")
async def trigger_batch_digest(
    request: TriggerDigestRequest,
    user: dict = Depends(get_current_user),
):
    """Trigger digests for all users whose preferences match the given period.

    This endpoint is intended to be called by a scheduled job / cron worker.
    It scans all users with notification preferences, finds those with
    matching digest_frequency, and sends digests to them.

    Note: This is a lightweight batch trigger — it iterates through users
    sequentially. For large user bases, consider moving this to a background
    worker or queue.
    """
    uid = user.get("uid", "")
    # Only admins/owners can trigger batch digests
    if not await _is_admin(uid):
        raise HTTPException(status_code=403, detail="Only admins can trigger batch digests")

    if request.period not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    from app.services.notification_service import PREFERENCES_COLLECTION

    storage = get_storage()
    all_prefs = await storage.list_documents(PREFERENCES_COLLECTION)

    sent_count = 0
    skipped_count = 0
    errors = []

    for pref in all_prefs:
        freq = pref.get("digest_frequency", "daily")
        if freq != request.period:
            continue

        pref_user_id = pref.get("user_id", "")
        if not pref_user_id:
            continue

        # Get user info
        users = await storage.query_documents("users", [("id", "==", pref_user_id)])
        if not users:
            skipped_count += 1
            continue

        user_info = users[0]
        user_email = user_info.get("email", "")
        user_name = user_info.get("name", "") or user_email

        if not user_email:
            skipped_count += 1
            continue

        try:
            result = await generate_and_send_digest(
                user_id=pref_user_id,
                user_email=user_email,
                user_name=user_name,
                period=request.period,
                team_id=request.team_id,
            )
            if result.get("sent"):
                sent_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            errors.append({"user_id": pref_user_id, "error": str(e)})
            skipped_count += 1

    return {
        "period": request.period,
        "sent": sent_count,
        "skipped": skipped_count,
        "errors": len(errors),
        "error_details": errors[:5],  # First 5 errors for debugging
    }


async def _is_admin(user_id: str) -> bool:
    """Check if the user has admin privileges via the users.is_admin column."""
    try:
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        async with factory() as session:
            result = await session.execute(
                text("SELECT is_admin FROM users WHERE id = :user_id"),
                {"user_id": user_id}
            )
            row = result.fetchone()
            return row is not None and row[0]
    except Exception:
        logger.exception("Failed to check admin status for user %s", user_id)
        return False
