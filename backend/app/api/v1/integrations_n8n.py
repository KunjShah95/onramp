"""n8n integration — full two-way automation for faculty.

Outbound (Onramp -> n8n):
  Task / onboarding / ramp events fan out to the configured n8n Webhook URL.
  Configure per-user here; per-team via /integrations/telegram/config;
  global fallback via N8N_WEBHOOK_URL env.

Inbound (n8n -> Onramp):
  POST /api/v1/webhooks/n8n  (public, HMAC-signed with N8N_INBOUND_SECRET)
  Actions: ping | create_task | trigger_autopilot_note | log_event

Management (authenticated):
  GET    /integrations/n8n/status
  GET    /integrations/n8n/config
  PUT    /integrations/n8n/config
  DELETE /integrations/n8n/config
  POST   /integrations/n8n/test
  POST   /integrations/n8n/trigger
  GET    /integrations/n8n/workflows
  GET    /integrations/n8n/templates
"""

import hashlib
import hmac
import json
import os
import logging
import os

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from app.api.v1.auth import get_current_user
from app.services.webhook_service import (
    get_integration_config,
    save_integration_config,
    delete_integration_config,
)

logger = logging.getLogger("onramp.integrations.n8n")

router = APIRouter(prefix="/integrations/n8n", tags=["integrations-n8n"])
inbound_router = APIRouter(tags=["webhooks-n8n"])


# ── Schemas ───────────────────────────────────────────────────

class N8nConfigRequest(BaseModel):
    webhook_url: str = ""  # https://n8n.example.com/webhook/<uuid>
    base_url: str = ""  # https://n8n.example.com (for API + health checks)
    api_key: str = ""  # n8n REST API key (optional, for workflow listing)
    events: List[str] = Field(default_factory=lambda: ["*"])
    enabled: bool = True


class N8nTestRequest(BaseModel):
    webhook_url: str = ""
    base_url: str = ""
    api_key: str = ""


class N8nTriggerRequest(BaseModel):
    event: str = "test.ping"
    payload: Dict[str, Any] = Field(default_factory=dict)
    team_id: Optional[str] = None


def _mask(value: str, keep: int = 12) -> str:
    if not value:
        return ""
    if len(value) <= keep + 1:
        return "••••••••"
    return value[:keep] + "…"


def _user_config_or_empty(row: Optional[dict]) -> dict:
    cfg = (row or {}).get("config", {}) or {}
    masked = dict(cfg)
    if masked.get("api_key"):
        masked["api_key"] = "••••••••"
    return masked


# ── Status / config ───────────────────────────────────────────

@router.get("/status")
async def n8n_status(user: dict = Depends(get_current_user)):
    from app.services import n8n_service as n8n

    row = await get_integration_config(user.get("uid", ""), "n8n")
    cfg = (row or {}).get("config", {}) or {}
    env_url = n8n.get_env_webhook_url()
    return {
        "user_configured": bool(cfg.get("webhook_url") or cfg.get("base_url")),
        "user_enabled": cfg.get("enabled", True) if cfg else False,
        "user_webhook": _mask(str(cfg.get("webhook_url", ""))),
        "user_base_url": cfg.get("base_url", ""),
        "user_events": cfg.get("events", ["*"]),
        "has_api_key": bool(cfg.get("api_key")),
        "env_configured": bool(env_url),
        "env_webhook": _mask(env_url, keep=28),
        "hmac_outbound": bool(os.getenv("N8N_HMAC_SECRET")),
        "inbound_configured": bool(os.getenv("N8N_INBOUND_SECRET")),
        "inbound_url": "/api/v1/webhooks/n8n",
        "supported_events": n8n.SUPPORTED_OUTBOUND_EVENTS,
    }


@router.get("/config")
async def get_config(user: dict = Depends(get_current_user)):
    row = await get_integration_config(user.get("uid", ""), "n8n")
    if not row:
        return {"configured": False, "integration": "n8n"}
    masked = _user_config_or_empty(row)
    return {"configured": True, "integration": "n8n", "config": masked}


@router.put("/config")
async def save_config(body: N8nConfigRequest, user: dict = Depends(get_current_user)):
    from app.services import n8n_service as n8n
    from app.services.outbound_url import OutboundURLError, validate_outbound_url

    cfg = {
        "webhook_url": body.webhook_url.strip(),
        "base_url": body.base_url.strip().rstrip("/"),
        "events": body.events or ["*"],
        "enabled": body.enabled,
    }
    # Validate event names
    for evt in cfg["events"]:
        if evt not in n8n.ALLOWED_SUBSCRIPTION_EVENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported event '{evt}'. Allowed: {n8n.ALLOWED_SUBSCRIPTION_EVENTS}",
            )
    if not cfg["webhook_url"] and not cfg["base_url"]:
        raise HTTPException(status_code=400, detail="Provide webhook_url and/or base_url.")
    try:
        if cfg["webhook_url"]:
            validate_outbound_url(cfg["webhook_url"])
        if cfg["base_url"]:
            validate_outbound_url(cfg["base_url"])
    except OutboundURLError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Preserve existing api_key when the client sends back the masked placeholder
    api_key = body.api_key.strip()
    if api_key and "•" not in api_key:
        cfg["api_key"] = api_key
    else:
        existing = await get_integration_config(user.get("uid", ""), "n8n")
        existing_cfg = ((existing or {}).get("config", {}) or {})
        if existing_cfg.get("api_key") and (not api_key or "•" in api_key):
            cfg["api_key"] = existing_cfg["api_key"]

    row = await save_integration_config(user.get("uid", ""), "n8n", cfg)
    return {"configured": True, "integration": "n8n", "config": _user_config_or_empty(row)}


@router.delete("/config")
async def delete_config(user: dict = Depends(get_current_user)):
    ok = await delete_integration_config(user.get("uid", ""), "n8n")
    return {"deleted": ok}


# ── Test / trigger / workflows ────────────────────────────────

@router.post("/test")
async def test_connection(body: N8nTestRequest, user: dict = Depends(get_current_user)):
    """Test reachability using explicit URLs, falling back to saved config."""
    from app.services import n8n_service as n8n
    from app.services.outbound_url import OutboundURLError, validate_outbound_url

    webhook_url = body.webhook_url.strip()
    base_url = body.base_url.strip()
    api_key = body.api_key.strip()
    if not webhook_url and not base_url:
        row = await get_integration_config(user.get("uid", ""), "n8n")
        cfg = ((row or {}).get("config", {}) or {})
        webhook_url = cfg.get("webhook_url", "")
        base_url = cfg.get("base_url", "")
        if not api_key or "•" in api_key:
            api_key = cfg.get("api_key", "") if "•" not in api_key else cfg.get("api_key", "")
        elif "•" in api_key:
            api_key = cfg.get("api_key", "")
    elif api_key and "•" in api_key:
        row = await get_integration_config(user.get("uid", ""), "n8n")
        cfg = ((row or {}).get("config", {}) or {})
        api_key = cfg.get("api_key", "")
    try:
        if webhook_url:
            validate_outbound_url(webhook_url)
        if base_url:
            validate_outbound_url(base_url)
    except OutboundURLError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await n8n.test_connection(webhook_url=webhook_url, base_url=base_url, api_key=api_key)


@router.post("/trigger")
async def manual_trigger(body: N8nTriggerRequest, user: dict = Depends(get_current_user)):
    """Fire an event to the caller's n8n webhook(s) on demand (faculty testing)."""
    from app.services import n8n_service as n8n

    event = (body.event or "").strip()
    if event not in n8n.SUPPORTED_OUTBOUND_EVENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported event '{event}'. Supported: {n8n.SUPPORTED_OUTBOUND_EVENTS}",
        )
    payload = dict(body.payload or {})
    payload.setdefault("triggered_by", user.get("uid"))
    if body.team_id:
        from app.services.team_service import get_user_teams
        teams = await get_user_teams(user.get("uid", ""))
        if str(body.team_id) not in {str(t.get("id") or t.get("team_id")) for t in (teams or [])}:
            raise HTTPException(status_code=403, detail="Not a member of this team")
    ok = await n8n.notify(event, payload, team_id=body.team_id, user_id=user.get("uid", ""))
    if not ok:
        raise HTTPException(
            status_code=502,
            detail="No n8n webhook reachable — save a webhook URL first (PUT /integrations/n8n/config) or set N8N_WEBHOOK_URL.",
        )
    return {"ok": True, "event": event}


@router.get("/workflows")
async def list_n8n_workflows(user: dict = Depends(get_current_user)):
    from app.services import n8n_service as n8n

    row = await get_integration_config(user.get("uid", ""), "n8n")
    cfg = ((row or {}).get("config", {}) or {})
    return await n8n.list_workflows(cfg.get("base_url", ""), cfg.get("api_key", ""))


@router.get("/templates")
async def workflow_templates():
    """Ready-to-import n8n workflow blueprints (import via n8n UI: ⋯ → Import from File).

    Full workflow JSON ships in the repo at ``n8n/workflows/*.json`` —
    generated by ``python scripts/generate_n8n_workflows.py``.
    """
    base = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    return {
        "inbound_url": f"{base}/api/v1/webhooks/n8n",
        "files": [
            "n8n/workflows/onramp-complete-bus.json",
            "n8n/workflows/onramp-inbound-task-seeding.json",
        ],
        "import_via": "n8n UI → Workflows → ⋯ → Import from File (see n8n/workflows/README.md)",
        "outbound_envelope": {
            "event": "task.completed",
            "source": "onramp",
            "timestamp": 0,
            "data": {"task": {"task_id": "…", "title": "…", "team_id": "…"}},
        },
        "inbound_envelope": {
            "action": "create_task",
            "team_id": "team_123",
            "title": "Onboard network drive",
            "description": "Created from n8n",
            "priority": "medium",
            "idempotency_key": "n8n-<uuid>",
        },
        "templates": [
            {
                "name": "Onramp → Telegram (onboarding events)",
                "description": "Webhook trigger → IF onboarding.* → Telegram Bot sendMessage. Point the Webhook node at N8N_ONBOARDING_WEBHOOK_URL.",
                "webhook_path": "onramp-onboarding",
                "events": ["onboarding.plan_created", "onboarding.milestone_completed", "onboarding.pulse_submitted"],
            },
            {
                "name": "Onramp → Slack (task completions)",
                "description": "Webhook trigger → IF task.completed → Slack postMessage to #onboarding.",
                "webhook_path": "onramp-tasks",
                "events": ["task.completed", "task.approved", "pr.merged"],
            },
            {
                "name": "Stuck-dev escalations",
                "description": "Webhook trigger → IF ramp.stuck → route by severity (Slack DM + email).",
                "webhook_path": "onramp-ramp",
                "events": ["ramp.stuck"],
            },
            {
                "name": "n8n → Onramp (nightly task seeding)",
                "description": "Schedule trigger → HTTP POST to /api/v1/webhooks/n8n with action=create_task + X-N8N-Signature header (HMAC of raw body with N8N_INBOUND_SECRET).",
                "action": "create_task",
            },
        ],
    }


# ── Inbound: n8n -> Onramp (public, HMAC-signed) ──────────────

class InboundCreateTask(BaseModel):
    action: str = "create_task"
    team_id: str
    title: str
    description: str = ""
    priority: str = "medium"
    assigned_to: Optional[str] = None
    idempotency_key: Optional[str] = None


def _verify_inbound(body: bytes, signature: str) -> bool:
    from app.services import n8n_service as n8n

    return n8n.verify_inbound_signature(body, signature)


@inbound_router.post("/webhooks/n8n")
async def n8n_inbound(
    request: Request,
    x_n8n_signature: str = Header("", alias="X-N8N-Signature"),
):
    """Receive automation calls from n8n workflows.

    Security: HMAC-SHA256 over the raw body with N8N_INBOUND_SECRET,
    sent as ``X-N8N-Signature: sha256=<hex>``. Fail-closed — 401 when
    the secret is unset or the signature is wrong.
    """
    body = await request.body()
    if not _verify_inbound(body, x_n8n_signature):
        secret_set = bool(os.getenv("N8N_INBOUND_SECRET"))
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid n8n signature"
                if secret_set
                else "N8N_INBOUND_SECRET is not configured — set it before using inbound automation"
            ),
        )
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    action = (payload.get("action") or "ping").strip().lower()

    if action in ("ping", "test", "test.ping"):
        return {"success": True, "action": "ping", "message": "Onramp inbound webhook reachable"}

    if action == "create_task":
        team_id = (payload.get("team_id") or "").strip()
        title = (payload.get("title") or "").strip()
        if not team_id or not title:
            raise HTTPException(status_code=400, detail="create_task requires team_id and title")
        allowed_teams = {
            value.strip()
            for value in os.getenv("N8N_ALLOWED_TEAM_IDS", "").split(",")
            if value.strip()
        }
        if os.getenv("ENV", "development").lower() == "production" and team_id not in allowed_teams:
            raise HTTPException(status_code=403, detail="n8n workflow is not authorized for this team")
        from app.services.team_service import get_team
        if not await get_team(team_id):
            raise HTTPException(status_code=404, detail="Team not found")
        if payload.get("assigned_to"):
            from app.services.team_service import get_team_members
            members = await get_team_members(team_id)
            member_ids = {m.get("user_id") or m.get("uid") or m.get("id") for m in members}
            if payload["assigned_to"] not in member_ids:
                raise HTTPException(status_code=400, detail="assigned_to is not a member of this team")
        allowed_teams = {
            item.strip()
            for item in os.getenv("N8N_ALLOWED_TEAM_IDS", "").split(",")
            if item.strip()
        }
        if allowed_teams and team_id not in allowed_teams:
            raise HTTPException(status_code=403, detail="n8n is not authorized for this team")
        priority = (payload.get("priority") or "medium").strip().lower()
        if priority not in ("low", "medium", "high", "urgent"):
            priority = "medium"

        # Idempotency: skip when a task with the same key already exists
        idem = (payload.get("idempotency_key") or "").strip()
        if idem:
            try:
                from app.services.postgres_db import get_storage

                existing = await get_storage().query_documents(
                    "onramp_tasks",
                    [("team_id", "==", team_id)],
                )
                for t in existing:
                    meta = t.get("metadata") or {}
                    src = t.get("source_issue") or {}
                    if meta.get("n8n_idempotency_key") == idem or src.get("n8n_idempotency_key") == idem:
                        return {"success": True, "action": "create_task", "task_id": t.get("task_id"), "deduplicated": True}
            except Exception:
                logger.exception("n8n idempotency check failed")

        try:
            from app.services import task_service

            task = await task_service.create_task(
                team_id=team_id,
                created_by=payload.get("created_by") or "n8n",
                title=title,
                description=payload.get("description") or "",
                priority=priority,
                assigned_to=payload.get("assigned_to"),
                repo_url=payload.get("repo_url"),
            )
            if idem:
                try:
                    from app.services.postgres_db import get_storage

                    await get_storage().update_document(
                        "onramp_tasks", task["task_id"], {"metadata": {"n8n_idempotency_key": idem}}
                    )
                except Exception:
                    logger.exception("Failed to stamp n8n idempotency key")
            # Fan the creation back out to n8n so workflows can chain
            try:
                from app.services import n8n_service as n8n

                await n8n.notify_task_event("task.assigned", task, actor_name="n8n")
            except Exception:
                pass
            return {"success": True, "action": "create_task", "task_id": task.get("task_id")}
        except Exception as exc:
            logger.exception("n8n create_task failed")
            raise HTTPException(status_code=500, detail=f"create_task failed: {exc}")

    if action == "log_event":
        logger.info("n8n log_event: %s", json.dumps(payload.get("data", payload), default=str)[:2000])
        return {"success": True, "action": "log_event"}

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported action '{action}'. Supported: ping, create_task, log_event",
    )
