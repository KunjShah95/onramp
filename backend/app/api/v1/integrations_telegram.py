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
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.v1.auth import get_current_user
from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.integrations.telegram")

router = APIRouter(prefix="/integrations/telegram", tags=["integrations-telegram"])


class TelegramConfigRequest(BaseModel):
    team_id: str
    webhook_url: str  # https://n8n.yourdomain.com/webhook/<id> or https://n8n.../webhook-test/...
    telegram_chat_id: str | None = None  # e.g. @your_channel or -100123456789


@router.get("/status")
async def status(user: dict = Depends(get_current_user)):
    import os
    env_url = (os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL") or "").strip()
    return {
        "env_configured": bool(env_url),
        "env_webhook": env_url[:60] + "..." if len(env_url) > 60 else env_url,
        "n8n_hmac_enabled": bool(os.getenv("N8N_HMAC_SECRET")),
        "telegram_direct": bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID")),
    }


@router.put("/config")
async def put_config(body: TelegramConfigRequest, user: dict = Depends(get_current_user)):
    # Verify team membership (simple) — reuse onboarding plan service check pattern
    storage = get_storage()
    # Upsert into onramp_integrations with team-scoped key: integration='n8n'
    doc_id = f"team:{body.team_id}:n8n"
    existing = await storage.get_document("onramp_integrations", doc_id)
    payload = {
        "user_id": body.team_id,
        "integration": "n8n",
        "team_id": body.team_id,
        "webhook_url": body.webhook_url,
        "telegram_chat_id": body.telegram_chat_id,
        "updated_by": user.get("uid"),
    }
    if existing:
        await storage.update_document("onramp_integrations", doc_id, {"config": payload})
    else:
        await storage.create_document("onramp_integrations", doc_id, {"id": doc_id, "user_id": body.team_id, "integration": "n8n", "config": payload})
    return {"ok": True, "team_id": body.team_id, "webhook_url": body.webhook_url}


@router.get("/config/{team_id}")
async def get_config(team_id: str, user: dict = Depends(get_current_user)):
    storage = get_storage()
    doc = await storage.get_document("onramp_integrations", f"team:{team_id}:n8n")
    if not doc:
        # also check env
        import os
        env_url = (os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL") or "").strip()
        return {"team_id": team_id, "configured": bool(env_url), "source": "env", "webhook_url": env_url}
    return {"team_id": team_id, "configured": True, "source": "team", "config": doc.get("config")}


@router.post("/test")
async def test_delivery(body: dict, user: dict = Depends(get_current_user)):
    """
    Body: { team_id?: str, chat_id?: str, message?: str }
    Fires onboarding.test via n8n_service so faculty can verify Telegram in one click.
    """
    team_id = body.get("team_id")
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
