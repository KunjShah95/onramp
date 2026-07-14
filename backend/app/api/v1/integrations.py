"""
Integrations API — manage webhooks, Slack, GitHub, and other third-party integrations.

Endpoints:
  Webhooks:  GET/POST /webhooks, GET/PUT/DELETE /webhooks/{id}, POST /webhooks/{id}/test, POST /webhooks/{id}/rotate-secret
  Integrations: GET/PUT/DELETE /integrations/{type}, GET /integrations
  Events: GET /events (list supported webhook event types)
"""

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.api.v1.auth import get_current_user
from app.services.webhook_service import (
    create_webhook,
    list_webhooks,
    get_webhook,
    update_webhook,
    delete_webhook,
    rotate_secret,
    test_webhook,
    get_integration_config,
    save_integration_config,
    delete_integration_config,
    list_integrations,
    SUPPORTED_EVENTS,
    EVENT_LABELS,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ── Schemas ──────────────────────────────────────────────────


class CreateWebhookRequest(BaseModel):
    url: str
    events: List[str]
    description: str = ""


class UpdateWebhookRequest(BaseModel):
    url: Optional[str] = None
    events: Optional[List[str]] = None
    active: Optional[bool] = None
    description: Optional[str] = None


class SaveIntegrationRequest(BaseModel):
    config: dict


class WebhookResponse(BaseModel):
    webhook_id: str
    url: str
    events: List[str]
    secret: str
    description: str
    active: bool
    created_at: str
    last_success_at: Optional[str] = None
    last_failure_at: Optional[str] = None
    delivery_count: int
    failure_count: int


# ── Webhook Endpoints ────────────────────────────────────────


@router.get("/webhooks")
async def list_user_webhooks(
    user: dict = Depends(get_current_user),
):
    """List all webhooks for the current user."""
    webhooks = await list_webhooks(user.get("uid", ""))
    # Mask secrets in list view
    for w in webhooks:
        if w.get("secret"):
            w["secret"] = w["secret"][:12] + "…" if len(w["secret"]) > 12 else w["secret"]
    return {"webhooks": webhooks, "count": len(webhooks)}


@router.post("/webhooks")
async def create_user_webhook(
    request: CreateWebhookRequest,
    user: dict = Depends(get_current_user),
):
    """Register a new webhook endpoint."""
    # Validate events
    for event in request.events:
        if event not in SUPPORTED_EVENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported event '{event}'. Supported: {SUPPORTED_EVENTS}",
            )

    webhook = await create_webhook(
        user_id=user.get("uid", ""),
        url=request.url,
        events=request.events,
        description=request.description,
    )
    return webhook


@router.get("/webhooks/{webhook_id}")
async def get_user_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a single webhook with full details including secret."""
    webhook = await get_webhook(webhook_id)
    if not webhook or webhook.get("user_id") != user.get("uid", ""):
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.put("/webhooks/{webhook_id}")
async def update_user_webhook(
    webhook_id: str,
    request: UpdateWebhookRequest,
    user: dict = Depends(get_current_user),
):
    """Update a webhook."""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    result = await update_webhook(webhook_id, user.get("uid", ""), updates)
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


@router.delete("/webhooks/{webhook_id}")
async def delete_user_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a webhook."""
    success = await delete_webhook(webhook_id, user.get("uid", ""))
    if not success:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"deleted": True}


@router.post("/webhooks/{webhook_id}/test")
async def test_user_webhook(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Send a test event to verify a webhook works."""
    result = await test_webhook(webhook_id, user.get("uid", ""))
    return result


@router.post("/webhooks/{webhook_id}/rotate-secret")
async def rotate_webhook_secret(
    webhook_id: str,
    user: dict = Depends(get_current_user),
):
    """Rotate the signing secret for a webhook."""
    result = await rotate_secret(webhook_id, user.get("uid", ""))
    if not result:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return result


# ── Integration Config Endpoints ─────────────────────────────


class TestGithubTokenRequest(BaseModel):
    token: str


@router.post("/github/test")
async def test_github_token(
    request: TestGithubTokenRequest,
    user: dict = Depends(get_current_user),
):
    """Validate a GitHub personal access token by calling the GitHub API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {request.token}",
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "Onramp/2.0",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "valid": True,
                    "username": data.get("login"),
                    "scopes": resp.headers.get("X-OAuth-Scopes", "").split(", "),
                }
            elif resp.status_code == 401:
                return {"valid": False, "error": "Token is invalid or expired"}
            elif resp.status_code == 403:
                return {"valid": False, "error": "Token is valid but lacks permissions"}
            else:
                return {"valid": False, "error": f"GitHub API returned {resp.status_code}"}
    except httpx.RequestError as e:
        return {"valid": False, "error": f"Connection error: {str(e)}"}


@router.get("/{integration_type}")
async def get_integration(
    integration_type: str,
    user: dict = Depends(get_current_user),
):
    """Get configuration for a specific integration (slack, github, etc.)."""
    config = await get_integration_config(user.get("uid", ""), integration_type)
    if not config:
        return {"configured": False, "integration": integration_type}
    return {"configured": True, **config}


@router.put("/{integration_type}")
async def save_integration(
    integration_type: str,
    request: SaveIntegrationRequest,
    user: dict = Depends(get_current_user),
):
    """Save or update integration configuration."""
    result = await save_integration_config(
        user.get("uid", ""), integration_type, request.config
    )
    return {"configured": True, **result}


@router.delete("/{integration_type}")
async def delete_integration(
    integration_type: str,
    user: dict = Depends(get_current_user),
):
    """Disconnect an integration."""
    success = await delete_integration_config(user.get("uid", ""), integration_type)
    return {"deleted": success}


@router.get("")
async def list_user_integrations(
    user: dict = Depends(get_current_user),
):
    """List all configured integrations."""
    integrations = await list_integrations(user.get("uid", ""))
    return {"integrations": integrations, "count": len(integrations)}


# ── Events ───────────────────────────────────────────────────


@router.get("/events/list")
async def list_events():
    """List supported webhook event types."""
    return {
        "events": SUPPORTED_EVENTS,
        "labels": EVENT_LABELS,
    }
