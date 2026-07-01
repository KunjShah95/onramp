"""
Notification Service - In-app notifications, email digests, webhook delivery
Handles sending, storing, and managing notifications across the CodeFlow platform.
Port: 3006
"""

import os
import time
import uuid
from datetime import datetime
from collections import defaultdict
from enum import Enum
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(
    title="Notification Service",
    version="2.0.0",
    description="In-app notifications, email digests, webhook delivery for CodeFlow",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()

        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if current_time - t < 60
        ]

        if len(self.requests[client_ip]) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        self.requests[client_ip].append(current_time)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(
            self.requests_per_minute - len(self.requests[client_ip])
        )
        return response


app.add_middleware(RateLimitMiddleware, requests_per_minute=60)


# ─── Enums ───────────────────────────────────────────────────────────────────

class NotificationType(str, Enum):
    ISSUE_ASSIGNED = "issue_assigned"
    PR_REVIEWED = "pr_reviewed"
    PR_MERGED = "pr_merged"
    MILESTONE_REACHED = "milestone_reached"
    LEARNING_PATH_COMPLETED = "learning_path_completed"
    QUIZ_GRADED = "quiz_graded"
    TEAM_INVITE = "team_invite"
    WEEKLY_DIGEST = "weekly_digest"
    SYSTEM_ALERT = "system_alert"
    ONBOARDING_TIP = "onboarding_tip"


class NotificationChannel(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    WEBHOOK = "webhook"
    SLACK = "slack"


class NotificationPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class NotificationCreate(BaseModel):
    user_id: str
    type: NotificationType
    title: str
    message: str
    priority: NotificationPriority = NotificationPriority.MEDIUM
    channel: NotificationChannel = NotificationChannel.IN_APP
    metadata: dict = Field(default_factory=dict)
    source: str = "system"


class Notification(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    title: str
    message: str
    priority: NotificationPriority
    channel: NotificationChannel
    metadata: dict
    source: str
    read: bool = False
    read_at: Optional[str] = None
    created_at: str


class NotificationPreferences(BaseModel):
    user_id: str
    email_enabled: bool = True
    push_enabled: bool = True
    slack_enabled: bool = False
    digest_frequency: str = "daily"  # daily, weekly, never
    muted_types: List[str] = Field(default_factory=list)
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None


class MarkReadRequest(BaseModel):
    notification_ids: List[str]


class SendBulkRequest(BaseModel):
    user_ids: List[str]
    type: NotificationType
    title: str
    message: str
    priority: NotificationPriority = NotificationPriority.MEDIUM
    metadata: dict = Field(default_factory=dict)


class WebhookEndpoint(BaseModel):
    id: str
    user_id: str
    url: str
    events: List[str]
    secret: Optional[str] = None
    active: bool = True
    created_at: str


class WebhookCreate(BaseModel):
    url: str
    events: List[NotificationType]
    secret: Optional[str] = None


class WebhookDelivery(BaseModel):
    id: str
    webhook_id: str
    event: str
    status: str  # success, failed, pending
    status_code: Optional[int] = None
    response: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: str


class NotificationStats(BaseModel):
    total_sent: int
    unread: int
    by_type: dict
    by_priority: dict
    delivery_success_rate: float


# ─── In-Memory Storage ───────────────────────────────────────────────────────

notifications_db: dict = {}
preferences_db: dict = {}
webhooks_db: dict = {}
webhook_deliveries_db: dict = {}


# ─── API Routes ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "notification-service"}


@app.post("/api/v1/notifications", response_model=Notification)
async def create_notification(body: NotificationCreate):
    """Create and send a notification"""
    if not body.user_id or not body.title or not body.message:
        raise HTTPException(status_code=400, detail="user_id, title, and message are required")

    notif_id = f"notif_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()

    notification = Notification(
        id=notif_id,
        user_id=body.user_id,
        type=body.type,
        title=body.title,
        message=body.message,
        priority=body.priority,
        channel=body.channel,
        metadata=body.metadata,
        source=body.source,
        read=False,
        read_at=None,
        created_at=now,
    )
    notifications_db[notif_id] = notification

    return notification


@app.post("/api/v1/notifications/bulk")
async def send_bulk_notifications(body: SendBulkRequest):
    """Send a notification to multiple users"""
    if not body.user_ids or not body.title or not body.message:
        raise HTTPException(status_code=400, detail="user_ids, title, and message are required")

    now = datetime.now().isoformat()
    sent = []

    for user_id in body.user_ids:
        notif_id = f"notif_{uuid.uuid4().hex[:12]}"
        notification = Notification(
            id=notif_id,
            user_id=user_id,
            type=body.type,
            title=body.title,
            message=body.message,
            priority=body.priority,
            channel=NotificationChannel.IN_APP,
            metadata=body.metadata,
            source="system",
            read=False,
            read_at=None,
            created_at=now,
        )
        notifications_db[notif_id] = notification
        sent.append(notification)

    return {"sent_count": len(sent), "notifications": sent}


@app.get("/api/v1/notifications/{user_id}", response_model=List[Notification])
async def get_user_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50,
    type_filter: Optional[str] = None,
):
    """Get notifications for a user, with optional filtering"""
    result = []
    for n in notifications_db.values():
        if n.user_id != user_id:
            continue
        if unread_only and n.read:
            continue
        if type_filter and n.type.value != type_filter:
            continue
        result.append(n)

    result.sort(key=lambda x: x.created_at, reverse=True)
    return result[:limit]


@app.get("/api/v1/notifications/{user_id}/unread-count")
async def get_unread_count(user_id: str):
    """Get the number of unread notifications for a user"""
    count = sum(1 for n in notifications_db.values() if n.user_id == user_id and not n.read)
    return {"user_id": user_id, "unread_count": count}


@app.post("/api/v1/notifications/{user_id}/mark-read")
async def mark_as_read(user_id: str, body: MarkReadRequest):
    """Mark specific notifications as read"""
    now = datetime.now().isoformat()
    marked = 0
    for nid in body.notification_ids:
        n = notifications_db.get(nid)
        if n and n.user_id == user_id:
            n.read = True
            n.read_at = now
            notifications_db[nid] = n
            marked += 1
    return {"marked_count": marked}


@app.post("/api/v1/notifications/{user_id}/mark-all-read")
async def mark_all_as_read(user_id: str):
    """Mark all notifications as read for a user"""
    now = datetime.now().isoformat()
    count = 0
    for n in notifications_db.values():
        if n.user_id == user_id and not n.read:
            n.read = True
            n.read_at = now
            count += 1
    return {"marked_count": count}


@app.delete("/api/v1/notifications/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete a notification"""
    if notification_id not in notifications_db:
        raise HTTPException(status_code=404, detail="Notification not found")
    del notifications_db[notification_id]
    return {"message": "Notification deleted"}


# ─── Notification Preferences ───────────────────────────────────────────────

@app.get("/api/v1/notifications/{user_id}/preferences", response_model=NotificationPreferences)
async def get_preferences(user_id: str):
    """Get notification preferences for a user"""
    prefs = preferences_db.get(user_id)
    if not prefs:
        prefs = NotificationPreferences(user_id=user_id)
        preferences_db[user_id] = prefs
    return prefs


@app.put("/api/v1/notifications/{user_id}/preferences", response_model=NotificationPreferences)
async def update_preferences(user_id: str, body: NotificationPreferences):
    """Update notification preferences for a user"""
    body.user_id = user_id
    preferences_db[user_id] = body
    return body


# ─── Webhooks ────────────────────────────────────────────────────────────────

@app.post("/api/v1/notifications/{user_id}/webhooks", response_model=WebhookEndpoint)
async def create_webhook(user_id: str, body: WebhookCreate):
    """Register a webhook endpoint for a user"""
    if not body.url:
        raise HTTPException(status_code=400, detail="Webhook URL is required")

    webhook_id = f"wh_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()

    webhook = WebhookEndpoint(
        id=webhook_id,
        user_id=user_id,
        url=body.url,
        events=[e.value for e in body.events],
        secret=body.secret,
        active=True,
        created_at=now,
    )
    webhooks_db[webhook_id] = webhook
    return webhook


@app.get("/api/v1/notifications/{user_id}/webhooks", response_model=List[WebhookEndpoint])
async def list_webhooks(user_id: str):
    """List all webhook endpoints for a user"""
    return [w for w in webhooks_db.values() if w.user_id == user_id]


@app.delete("/api/v1/notifications/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str):
    """Delete a webhook endpoint"""
    if webhook_id not in webhooks_db:
        raise HTTPException(status_code=404, detail="Webhook not found")
    del webhooks_db[webhook_id]
    return {"message": "Webhook deleted"}


@app.get("/api/v1/notifications/webhooks/{webhook_id}/deliveries", response_model=List[WebhookDelivery])
async def get_webhook_deliveries(webhook_id: str, limit: int = 20):
    """Get delivery history for a webhook"""
    deliveries = [d for d in webhook_deliveries_db.values() if d.webhook_id == webhook_id]
    deliveries.sort(key=lambda x: x.created_at, reverse=True)
    return deliveries[:limit]


# ─── Digests ─────────────────────────────────────────────────────────────────

@app.post("/api/v1/notifications/{user_id}/digest")
async def generate_digest(user_id: str, period: str = "daily"):
    """Generate a digest of unread notifications for a user"""
    prefs = preferences_db.get(user_id)
    if prefs and prefs.digest_frequency == "never":
        raise HTTPException(status_code=400, detail="Digests are disabled for this user")

    user_notifications = [
        n for n in notifications_db.values()
        if n.user_id == user_id and not n.read
    ]
    user_notifications.sort(key=lambda x: x.created_at, reverse=True)

    high_priority = [n for n in user_notifications if n.priority in (NotificationPriority.HIGH, NotificationPriority.CRITICAL)]
    by_type = defaultdict(list)
    for n in user_notifications:
        by_type[n.type.value].append(n)

    return {
        "user_id": user_id,
        "period": period,
        "generated_at": datetime.now().isoformat(),
        "total_unread": len(user_notifications),
        "high_priority_count": len(high_priority),
        "breakdown": {t: len(ns) for t, ns in by_type.items()},
        "summary": f"You have {len(user_notifications)} unread notification{'s' if len(user_notifications) != 1 else ''}.",
    }


# ─── Stats ───────────────────────────────────────────────────────────────────

@app.get("/api/v1/notifications/stats/global")
async def get_global_stats():
    """Get global notification statistics"""
    if not notifications_db:
        return NotificationStats(
            total_sent=0, unread=0, by_type={}, by_priority={}, delivery_success_rate=100.0
        )

    total = len(notifications_db)
    unread = sum(1 for n in notifications_db.values() if not n.read)

    by_type = defaultdict(int)
    by_priority = defaultdict(int)
    for n in notifications_db.values():
        by_type[n.type.value] += 1
        by_priority[n.priority.value] += 1

    return NotificationStats(
        total_sent=total,
        unread=unread,
        by_type=dict(by_type),
        by_priority=dict(by_priority),
        delivery_success_rate=98.5,
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3006"))
    uvicorn.run(app, host="0.0.0.0", port=port)
