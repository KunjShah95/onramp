"""
n8n integration service for Onramp.

Faculty wants full two-way automation between Onramp and self-hosted n8n:

Outbound (Onramp -> n8n webhooks):
  Onramp event (task.*, onboarding.*, ramp.*, pr.*)
    -> n8n_service.notify(event, payload, team_id?, user_id?)
    -> POST <configured n8n Webhook URL> with signed JSON envelope
    -> n8n workflow (Webhook node -> Slack/Telegram/Email/... nodes)

Inbound (n8n -> Onramp):
  n8n workflow (Schedule/HTTP/Webhook trigger)
    -> POST /api/v1/webhooks/n8n with X-N8N-Signature header
    -> handled by integrations_n8n inbound router (create_task, etc.)

Config resolution (priority order):
  1. Per-user integration row (onramp_integrations, integration='n8n')
     { webhook_url, base_url, api_key, events, enabled }
  2. Per-team row (doc id "team:<team_id>:n8n", user_id == team_id)
     { webhook_url, telegram_chat_id, ... }
  3. Env: N8N_ONBOARDING_WEBHOOK_URL > N8N_WEBHOOK_URL (outbound fan-out)

All env lookups are done lazily (per call) so tests / runtime config
changes take effect without a process restart.
"""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from app.services.outbound_url import OutboundURLError, validate_outbound_url

logger = logging.getLogger("onramp.n8n")


# ── Outbound event catalogue ──────────────────────────────────

SUPPORTED_OUTBOUND_EVENTS = [
    "onboarding.plan_created",
    "onboarding.plan_updated",
    "onboarding.plan_generated",
    "onboarding.milestone_completed",
    "onboarding.preboarding_completed",
    "onboarding.pulse_submitted",
    "onboarding.test",
    "task.assigned",
    "task.started",
    "task.submitted",
    "task.reviewed",
    "task.approved",
    "task.completed",
    "task.needs_changes",
    "task.cancelled",
    "pr.merged",
    "ramp.stuck",
    "test.ping",
]

# Events a user can subscribe their n8n webhook to ("*" = all).
# Stored in the per-user n8n integration row under config.events.
ALLOWED_SUBSCRIPTION_EVENTS = SUPPORTED_OUTBOUND_EVENTS + ["*"]


# ── Env helpers (lazy — never cache at import time) ───────────

def get_env_webhook_url() -> str:
    return (
        os.getenv("N8N_ONBOARDING_WEBHOOK_URL")
        or os.getenv("N8N_WEBHOOK_URL")
        or ""
    ).strip()


def get_timeout() -> float:
    try:
        return float(os.getenv("N8N_TIMEOUT_SECONDS", "5"))
    except ValueError:
        return 5.0


def get_hmac_secret() -> str:
    return os.getenv("N8N_HMAC_SECRET", "")


def get_inbound_secret() -> str:
    return os.getenv("N8N_INBOUND_SECRET", "")


def is_configured() -> bool:
    return bool(get_env_webhook_url())


# ── Signing ───────────────────────────────────────────────────

def _sign(payload: bytes) -> Dict[str, str]:
    secret = get_hmac_secret()
    if not secret:
        return {}
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return {
        "X-Onramp-Signature": f"sha256={sig}",
        "X-Onramp-Timestamp": str(int(time.time())),
        "X-Onramp-Event": "n8n",
    }


def verify_inbound_signature(body: bytes, signature_header: str) -> bool:
    """Verify an inbound n8n -> Onramp webhook call (fail-closed)."""
    secret = get_inbound_secret()
    if not secret or not signature_header:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def build_envelope(event: str, payload: Dict[str, Any]) -> bytes:
    return json.dumps(
        {
            "event": event,
            "source": "onramp",
            "timestamp": int(time.time()),
            "data": payload,
        },
        default=str,
    ).encode()


# ── Config resolution ─────────────────────────────────────────

async def _resolve_team_webhook(team_id: Optional[str]) -> Optional[str]:
    """Per-team n8n webhook URL (doc id "team:<id>:n8n", fallback to queries)."""
    if not team_id:
        return None
    try:
        from app.services.postgres_db import get_storage

        storage = get_storage()
        # Primary: deterministic team doc id written by integrations_telegram PUT /config
        try:
            doc = await storage.get_document("onramp_integrations", f"team:{team_id}:n8n")
            if doc:
                cfg = doc.get("config") or {}
                if cfg.get("webhook_url"):
                    return cfg["webhook_url"]
                # legacy shape: payload stored at top level
                if doc.get("webhook_url"):
                    return doc["webhook_url"]
        except Exception:
            pass
        # Fallback: query rows with integration='n8n' matching this team
        try:
            rows = await storage.query_documents(
                "onramp_integrations", [("integration", "==", "n8n")]
            )
        except Exception:
            return None
        for r in rows:
            cfg = r.get("config") or {}
            if cfg.get("team_id") == team_id and cfg.get("webhook_url"):
                return cfg["webhook_url"]
            if r.get("user_id") == team_id and cfg.get("webhook_url"):
                return cfg["webhook_url"]
    except Exception:
        logger.debug("team webhook lookup failed for %s", team_id, exc_info=True)
    return None


async def _resolve_user_webhooks(user_id: Optional[str]) -> List[Dict[str, Any]]:
    """Return enabled per-user n8n configs for fan-out (usually 0-1 rows)."""
    if not user_id:
        return []
    try:
        from app.services.webhook_service import get_integration_config

        cfg_row = await get_integration_config(user_id, "n8n")
        if not cfg_row:
            return []
        cfg = cfg_row.get("config") or {}
        if cfg.get("enabled") is False:
            return []
        if cfg.get("webhook_url"):
            return [cfg]
    except Exception:
        logger.debug("user n8n lookup failed for %s", user_id, exc_info=True)
    return []


def _event_allowed(event: str, subscribed: Optional[List[str]]) -> bool:
    if not subscribed:
        return True
    if "*" in subscribed:
        return True
    return event in subscribed


async def resolve_webhook_urls(
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
    event: str = "",
) -> List[str]:
    """All outbound n8n URLs for this event (user + team + env, de-duplicated)."""
    urls: List[str] = []

    for cfg in await _resolve_user_webhooks(user_id):
        if event and not _event_allowed(event, cfg.get("events")):
            continue
        url = (cfg.get("webhook_url") or "").strip()
        if url and url not in urls:
            urls.append(url)

    team_url = await _resolve_team_webhook(team_id)
    if team_url and team_url not in urls:
        urls.append(team_url)

    env_url = get_env_webhook_url()
    if env_url and env_url not in urls:
        urls.append(env_url)
    return urls


# ── Outbound POST ─────────────────────────────────────────────

async def _post(url: str, event: str, payload: Dict[str, Any]) -> bool:
    try:
        validate_outbound_url(url)
    except OutboundURLError as exc:
        logger.warning("Blocked unsafe n8n webhook %s: %s", url, exc)
        return False
    body = build_envelope(event, payload)
    headers = {"Content-Type": "application/json", **_sign(body)}
    # n8n Webhook nodes expect the event name too — also send as header
    headers["X-Onramp-Event"] = event
    try:
        async with httpx.AsyncClient(timeout=get_timeout()) as client:
            resp = await client.post(url, content=body, headers=headers)
            if resp.status_code >= 400:
                logger.warning(
                    "n8n webhook %s returned %s: %s",
                    url, resp.status_code, resp.text[:500],
                )
                return False
            logger.info("n8n webhook ok %s event=%s status=%s", url, event, resp.status_code)
            return True
    except Exception:
        logger.exception("n8n post failed event=%s url=%s", event, url)
        return False


async def notify(
    event: str,
    payload: Dict[str, Any],
    team_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> bool:
    """Generic fan-out. Returns True if at least one webhook answered 2xx.

    No-op (returns False) when nothing is configured so callers never break.
    """
    urls = await resolve_webhook_urls(team_id=team_id, user_id=user_id, event=event)
    if not urls:
        logger.debug("n8n not configured — skipping event=%s", event)
        return False
    ok = False
    for url in urls:
        if await _post(url, event, payload):
            ok = True
    return ok


async def notify_onboarding(
    event: str, payload: Dict[str, Any], team_id: Optional[str] = None
) -> bool:
    """Back-compat wrapper used by onboarding_plan_service."""
    return await notify(event, payload, team_id=team_id)


async def notify_task_event(
    event: str, task: Dict[str, Any], actor_name: str = ""
) -> bool:
    """Fan-out for task lifecycle events (called from notification_helpers)."""
    return await notify(
        event,
        {"task": task, "actor": actor_name},
        team_id=task.get("team_id"),
        user_id=task.get("assigned_to") or task.get("created_by"),
    )


# Convenience wrappers used by onboarding_plan_service (kept stable)
async def notify_plan_created(plan: dict) -> bool:
    return await notify_onboarding("onboarding.plan_created", {"plan": plan}, team_id=plan.get("team_id"))


async def notify_plan_updated(plan: dict) -> bool:
    return await notify_onboarding("onboarding.plan_updated", {"plan": plan}, team_id=plan.get("team_id"))


async def notify_milestone_completed(milestone: dict, plan: Optional[dict] = None) -> bool:
    return await notify_onboarding(
        "onboarding.milestone_completed",
        {"milestone": milestone, "plan": plan},
        team_id=(plan or {}).get("team_id"),
    )


async def notify_preboarding_completed(task: dict, plan: Optional[dict] = None) -> bool:
    return await notify_onboarding(
        "onboarding.preboarding_completed",
        {"task": task, "plan": plan},
        team_id=(plan or {}).get("team_id"),
    )


async def notify_pulse_submitted(pulse: dict, plan: Optional[dict] = None) -> bool:
    return await notify_onboarding(
        "onboarding.pulse_submitted",
        {"pulse": pulse, "plan": plan},
        team_id=(plan or {}).get("team_id"),
    )


async def notify_plan_generated(plan: dict) -> bool:
    return await notify_onboarding("onboarding.plan_generated", {"plan": plan}, team_id=plan.get("team_id"))


# ── Connection testing / workflow listing (management UI) ─────

async def test_connection(
    webhook_url: str = "",
    base_url: str = "",
    api_key: str = "",
) -> Dict[str, Any]:
    """Validate n8n reachability.

    1. If a webhook_url is given, POST a test.ping envelope to it.
    2. Else if base_url (+ optional api_key) is given, GET <base>/healthz
       falling back to the base root.
    Returns {"ok": bool, ...} — never raises.
    """
    webhook_url = (webhook_url or "").strip()
    base_url = (base_url or "").strip().rstrip("/")
    if webhook_url:
        ok = await _post(webhook_url, "test.ping", {"message": "Onramp n8n connection test"})
        if ok:
            return {"ok": True, "mode": "webhook", "message": "test.ping delivered to n8n webhook."}
        return {
            "ok": False,
            "mode": "webhook",
            "error": "POST to webhook URL failed — check the URL (use the production /webhook/ URL, not /webhook-test/ for live traffic) and that n8n is reachable.",
        }
    if base_url:
        headers: Dict[str, str] = {}
        if api_key:
            headers["X-N8N-API-KEY"] = api_key
        try:
            async with httpx.AsyncClient(timeout=get_timeout()) as client:
                for path in ("/healthz", "/"):
                    try:
                        resp = await client.get(f"{base_url}{path}", headers=headers)
                        if resp.status_code < 500:
                            return {
                                "ok": True,
                                "mode": "base_url",
                                "status_code": resp.status_code,
                                "message": f"n8n host reachable (HTTP {resp.status_code}).",
                            }
                    except Exception:
                        continue
        except Exception as exc:
            return {"ok": False, "mode": "base_url", "error": str(exc)}
        return {"ok": False, "mode": "base_url", "error": f"Could not reach {base_url} — check the host and firewall."}
    return {"ok": False, "error": "Provide a webhook URL or a base URL."}


async def list_workflows(base_url: str, api_key: str) -> Dict[str, Any]:
    """List workflows via the n8n REST API (requires API key)."""
    base_url = (base_url or "").strip().rstrip("/")
    if not base_url or not api_key:
        return {"workflows": [], "count": 0, "error": "base_url and api_key are required"}
    try:
        async with httpx.AsyncClient(timeout=get_timeout()) as client:
            resp = await client.get(
                f"{base_url}/api/v1/workflows",
                headers={"X-N8N-API-KEY": api_key, "Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data") if isinstance(data, dict) else data
                workflows = [
                    {
                        "id": w.get("id"),
                        "name": w.get("name"),
                        "active": w.get("active"),
                        "updatedAt": w.get("updatedAt"),
                    }
                    for w in (items or [])
                ]
                return {"workflows": workflows, "count": len(workflows)}
            if resp.status_code in (401, 403):
                return {"workflows": [], "count": 0, "error": "n8n rejected the API key (401/403)."}
            return {"workflows": [], "count": 0, "error": f"n8n API returned HTTP {resp.status_code}"}
    except Exception as exc:
        return {"workflows": [], "count": 0, "error": str(exc)}
