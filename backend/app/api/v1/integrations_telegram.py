"""
Telegram via n8n integration.

Faculty-facing controls so they can:
  - store a per-team n8n webhook URL (no env restart)
  - test the Telegram delivery (fires onboarding.test via n8n)
  - see n8n wiring status

All onboarding lifecycle events already call n8n_service.notify_onboarding
fire-and-forget, so this router is purely management / test.
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.v1.auth import get_current_user
from app.services.postgres_db import get_storage
from app.services.outbound_url import OutboundURLError, validate_outbound_url

logger = logging.getLogger("onramp.integrations.telegram")

router = APIRouter(prefix="/integrations/telegram", tags=["integrations-telegram"])


class TelegramConfigRequest(BaseModel):
    team_id: str
    webhook_url: str  # https://n8n.yourdomain.com/webhook/<id> or https://n8n.../webhook-test/...
    telegram_chat_id: str | None = None  # e.g. @your_channel or -100123456789


async def _require_team_admin(user: dict, team_id: str) -> None:
    from app.middleware.access_guard import ROLE_HIERARCHY
    from app.services.team_service import get_user_teams

    teams = await get_user_teams(user.get("uid", ""))
    role = next(
        (
            membership.get("role", "member")
            for membership in teams or []
            if str(membership.get("team_id") or membership.get("id")) == str(team_id)
        ),
        None,
    )
    if role is None or ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY["admin"]:
        raise HTTPException(status_code=403, detail="Team admin access required")


@router.get("/status")
async def status(user: dict = Depends(get_current_user)):
    import os
    env_url = (os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL") or "").strip()
    return {
        "env_configured": bool(env_url),
        "env_webhook": (env_url[:28] + "…" if len(env_url) > 28 else env_url),
        "n8n_hmac_enabled": bool(os.getenv("N8N_HMAC_SECRET")),
        "telegram_direct": bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID")),
    }


@router.put("/config")
async def put_config(body: TelegramConfigRequest, user: dict = Depends(get_current_user)):
    await _require_team_admin(user, body.team_id)
    try:
        validate_outbound_url(body.webhook_url)
    except OutboundURLError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    storage = get_storage()
    # Team webhooks use a dynamic collection because IntegrationConfig is
    # user-owned and its user_id foreign key cannot represent a team UUID.
    doc_id = f"team:{body.team_id}:n8n"
    document = {
        "team_id": body.team_id,
        "integration": "n8n",
        "webhook_url": body.webhook_url,
        "telegram_chat_id": body.telegram_chat_id,
        "updated_by": user.get("uid"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = await storage.get_document("team_n8n_configs", doc_id)
    if existing:
        await storage.update_document("team_n8n_configs", doc_id, document)
    else:
        await storage.create_document("team_n8n_configs", doc_id, document)
    masked = body.webhook_url[:28] + "…" if len(body.webhook_url) > 28 else body.webhook_url
    return {"ok": True, "team_id": body.team_id, "webhook_url": masked}


@router.get("/config/{team_id}")
async def get_config(team_id: str, user: dict = Depends(get_current_user)):
    await _require_team_admin(user, team_id)
    storage = get_storage()
    doc = await storage.get_document("team_n8n_configs", f"team:{team_id}:n8n")
    if not doc:
        # also check env
        import os
        env_url = (os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL") or "").strip()
        return {"team_id": team_id, "configured": bool(env_url), "source": "env", "webhook_url": (env_url[:28] + "…" if len(env_url) > 28 else env_url)}
    config = dict(doc)
    if config.get("webhook_url"):
        config["webhook_url"] = config["webhook_url"][:28] + "…" if len(config["webhook_url"]) > 28 else config["webhook_url"]
    return {"team_id": team_id, "configured": True, "source": "team", "config": config}


@router.post("/test")
async def test_delivery(body: dict, user: dict = Depends(get_current_user)):
    """
    Body: { team_id?: str, chat_id?: str, message?: str }
    Fires onboarding.test via n8n_service so faculty can verify Telegram in one click.
    """
    team_id = body.get("team_id")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id is required")
    await _require_team_admin(user, team_id)
    msg = body.get("message") or "Onramp ↔ n8n ↔ Telegram test — onboarding sessions are wired."
    from app.services.n8n_service import notify_onboarding
    payload = {
        "plan": {"id": "test", "title": "Test onboarding session", "status": "test"},
        "test_message": msg,
        "triggered_by": user.get("uid"),
        "chat_id": body.get("chat_id"),
    }
    ok = await notify_onboarding("onboarding.test", payload, team_id=team_id)
    if not ok:
        raise HTTPException(status_code=502, detail="n8n webhook not configured or unreachable — set N8N_ONBOARDING_WEBHOOK_URL or PUT /integrations/telegram/config")
    return {"ok": True, "event": "onboarding.test", "team_id": team_id}
