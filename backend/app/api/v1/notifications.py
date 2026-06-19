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
