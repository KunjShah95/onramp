"""
Notifications API — in-app notification endpoints for CodeFlow.

Supports: list, unread count, mark read, mark all read, delete, clear read.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.api.v1.auth import get_current_user
from app.services.notification_service import (
    list_notifications,
    get_notification,
    get_unread_count,
    mark_as_read,
    mark_all_as_read,
    delete_notification,
    delete_all_read,
    get_preferences,
    update_preferences,
    DEFAULT_PREFERENCES,
    NOTIFICATION_TYPE_LABELS,
    CHANNEL_LABELS,
    CHANNEL_ICONS,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Schemas ──────────────────────────────────────────────────


class MarkReadRequest(BaseModel):
    notification_ids: List[str]


class NotificationsResponse(BaseModel):
    notifications: list
    count: int


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkedCountResponse(BaseModel):
    marked_count: int


class DeletedCountResponse(BaseModel):
    deleted_count: int


# ── Preferences ──────────────────────────────────────────────


class NotificationPreferencesRequest(BaseModel):
    channels: Optional[dict] = None
    digest_frequency: Optional[str] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    email_digest_time: Optional[str] = None


class PreferencesResponse(BaseModel):
    user_id: str
    channels: dict
    digest_frequency: str
    quiet_hours_enabled: bool
    quiet_hours_start: str
    quiet_hours_end: str
    email_digest_time: str


@router.get("/preferences", response_model=PreferencesResponse)
async def get_notification_preferences(
    user: dict = Depends(get_current_user),
):
    """Get notification preferences for the current user."""
    return await get_preferences(user.get("uid", ""))


@router.put("/preferences", response_model=PreferencesResponse)
async def update_notification_preferences(
    request: NotificationPreferencesRequest,
    user: dict = Depends(get_current_user),
):
    """Update notification preferences."""
    uid = user.get("uid", "")
    existing = await get_preferences(uid)

    updates = {}
    if request.channels is not None:
        # Merge channel settings: only update provided channels
        merged = dict(existing.get("channels", {}))
        for channel, types in request.channels.items():
            if channel in merged:
                merged[channel] = {**merged[channel], **(types if isinstance(types, dict) else {})}
            else:
                merged[channel] = types
        updates["channels"] = merged
    if request.digest_frequency is not None:
        updates["digest_frequency"] = request.digest_frequency
    if request.quiet_hours_enabled is not None:
        updates["quiet_hours_enabled"] = request.quiet_hours_enabled
    if request.quiet_hours_start is not None:
        updates["quiet_hours_start"] = request.quiet_hours_start
    if request.quiet_hours_end is not None:
        updates["quiet_hours_end"] = request.quiet_hours_end
    if request.email_digest_time is not None:
        updates["email_digest_time"] = request.email_digest_time

    return await update_preferences(uid, updates)


@router.get("/preferences/defaults")
async def get_default_preferences():
    """Get default notification preferences and available types/channels."""
    return {
        "defaults": DEFAULT_PREFERENCES,
        "notification_types": NOTIFICATION_TYPE_LABELS,
        "channels": CHANNEL_LABELS,
        "channel_icons": CHANNEL_ICONS,
    }


# ── Endpoints ────────────────────────────────────────────────


@router.get("", response_model=NotificationsResponse)
async def list_user_notifications(
    unread_only: bool = False,
    limit: int = 50,
    type_filter: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List notifications for the current user."""
    uid = user.get("uid", "")
    notifications = await list_notifications(
        user_id=uid,
        unread_only=unread_only,
        limit=limit,
        type_filter=type_filter,
    )
    return {"notifications": notifications, "count": len(notifications)}


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count_endpoint(
    user: dict = Depends(get_current_user),
):
    """Get the number of unread notifications."""
    count = await get_unread_count(user.get("uid", ""))
    return {"unread_count": count}


@router.get("/{notification_id}")
async def get_notification_endpoint(
    notification_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a single notification."""
    notif = await get_notification(notification_id)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    uid = user.get("uid", "")
    if notif.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Not your notification")
    return notif


@router.post("/mark-read", response_model=MarkedCountResponse)
async def mark_read(
    request: MarkReadRequest,
    user: dict = Depends(get_current_user),
):
    """Mark specific notifications as read."""
    uid = user.get("uid", "")
    count = 0
    for nid in request.notification_ids:
        if await mark_as_read(nid, uid):
            count += 1
    return {"marked_count": count}


@router.post("/mark-all-read", response_model=MarkedCountResponse)
async def mark_all_read(
    user: dict = Depends(get_current_user),
):
    """Mark all notifications as read."""
    count = await mark_all_as_read(user.get("uid", ""))
    return {"marked_count": count}


@router.delete("/{notification_id}")
async def delete_notification_endpoint(
    notification_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a single notification."""
    success = await delete_notification(notification_id, user.get("uid", ""))
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found or unauthorized")
    return {"deleted": True}


@router.post("/clear-read", response_model=DeletedCountResponse)
async def clear_read_notifications(
    user: dict = Depends(get_current_user),
):
    """Delete all read notifications."""
    count = await delete_all_read(user.get("uid", ""))
    return {"deleted_count": count}
