"""
n8n → Telegram bridge for Onboarding sessions.

Faculty wants every onboarding lifecycle event mirrored to Telegram
via n8n (self-hosted workflow automation). This service is the sole
place that talks to n8n — every caller hands us an event name + payload
and we POST it to the configured webhook (env or per-team integration).

Flow:
  Onramp event (create_plan, milestone_complete, pulse_submit, …)
    → n8n_service.notify_onboarding(event, payload)
    → POST {N8N_WEBHOOK_URL / N8N_ONBOARDING_WEBHOOK_URL} with JSON
    → n8n workflow (Webhook node → Telegram Bot node)
    → Telegram channel / DM

Config (all optional — service is a no-op when unconfigured):
  N8N_WEBHOOK_URL               — base n8n webhook (all events fan-out here)
  N8N_ONBOARDING_WEBHOOK_URL    — onboarding-specific override (wins over base)
  N8N_TIMEOUT_SECONDS           — http timeout (default 5s)
  N8N_HMAC_SECRET               — optional HMAC-SHA256 signature header for n8n to verify

Per-team override (stored in onramp_integrations.integration='n8n' or 'telegram'):
  { "webhook_url": "https://n8n.yourdomain.com/webhook/<uuid>", "telegram_chat_id": "-100xxxx" }

If nothing is configured, notify_* returns immediately so nothing breaks.
"""
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger("onramp.n8n")

WEBHOOK_ENV = os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL", "")
TIMEOUT = float(os.getenv("N8N_TIMEOUT_SECONDS", "5"))
HMAC_SECRET = os.getenv("N8N_HMAC_SECRET", "")


def is_configured() -> bool:
    return bool((os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL") or "").strip())


async def _resolve_team_webhook(team_id: Optional[str]) -> Optional[str]:
    if not team_id:
        return None
    try:
        from app.services.postgres_db import get_storage
        storage = get_storage()
        # integration rows: (user_id, integration='n8n'|'telegram')
        # We treat user_id == team_id for team-scoped webhooks (onboarding is team-scoped)
        doc = await storage.get_document("onramp_integrations", team_id)  # try direct
        if doc and isinstance(doc.get("config"), dict) and doc["config"].get("webhook_url"):
            return doc["config"]["webhook_url"]
        # Fallback: query by integration type
        rows = await storage.query_documents("onramp_integrations", [("integration", "==", "n8n")])
        for r in rows:
            cfg = r.get("config") or {}
            if cfg.get("team_id") == team_id and cfg.get("webhook_url"):
                return cfg["webhook_url"]
            if r.get("user_id") == team_id and cfg.get("webhook_url"):
                return cfg["webhook_url"]
    except Exception:
        logger.debug("team webhook lookup failed for %s", team_id, exc_info=True)
    return None


def _sign(payload: bytes) -> Dict[str, str]:
    if not HMAC_SECRET:
        return {}
    sig = hmac.new(HMAC_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return {"X-Onramp-Signature": f"sha256={sig}", "X-Onramp-Timestamp": str(int(time.time()))}


async def _post(url: str, event: str, payload: Dict[str, Any]) -> bool:
    body = json.dumps({"event": event, "source": "onramp", "timestamp": int(time.time()), "data": payload}, default=str).encode()
    headers = {"Content-Type": "application/json", **_sign(body)}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, content=body, headers=headers)
            if resp.status_code >= 400:
                logger.warning("n8n webhook %s returned %s: %s", url, resp.status_code, resp.text[:500])
                return False
            logger.info("n8n webhook ok %s event=%s status=%s", url, event, resp.status_code)
            return True
    except Exception:
        logger.exception("n8n post failed event=%s url=%s", event, url)
        return False


async def notify_onboarding(event: str, payload: Dict[str, Any], team_id: Optional[str] = None) -> bool:
    """
    Fire-and-forget. Returns True if at least one webhook answered 2xx.
    event examples: onboarding.plan_created, onboarding.milestone_completed,
      onboarding.preboarding_completed, onboarding.pulse_submitted, onboarding.plan_updated
    """
    # Resolve URLs in priority: team integration > N8N_ONBOARDING_WEBHOOK_URL > N8N_WEBHOOK_URL
    urls: list[str] = []
    team_url = await _resolve_team_webhook(team_id)
    if team_url:
        urls.append(team_url)
    env_url = (os.getenv("N8N_ONBOARDING_WEBHOOK_URL") or os.getenv("N8N_WEBHOOK_URL") or "").strip()
    if env_url and env_url not in urls:
        urls.append(env_url)

    if not urls:
        logger.debug("n8n not configured — skipping event=%s", event)
        return False

    ok = False
    for url in urls:
        if await _post(url, event, payload):
            ok = True
    return ok


# Convenience wrappers used by onboarding_plan_service
async def notify_plan_created(plan: dict) -> bool:
    return await notify_onboarding("onboarding.plan_created", {"plan": plan}, team_id=plan.get("team_id"))

async def notify_plan_updated(plan: dict) -> bool:
    return await notify_onboarding("onboarding.plan_updated", {"plan": plan}, team_id=plan.get("team_id"))

async def notify_milestone_completed(milestone: dict, plan: Optional[dict] = None) -> bool:
    return await notify_onboarding("onboarding.milestone_completed", {"milestone": milestone, "plan": plan}, team_id=(plan or {}).get("team_id"))

async def notify_preboarding_completed(task: dict, plan: Optional[dict] = None) -> bool:
    return await notify_onboarding("onboarding.preboarding_completed", {"task": task, "plan": plan}, team_id=(plan or {}).get("team_id"))

async def notify_pulse_submitted(pulse: dict, plan: Optional[dict] = None) -> bool:
    return await notify_onboarding("onboarding.pulse_submitted", {"pulse": pulse, "plan": plan}, team_id=(plan or {}).get("team_id"))

async def notify_plan_generated(plan: dict) -> bool:
    return await notify_onboarding("onboarding.plan_generated", {"plan": plan}, team_id=plan.get("team_id"))
