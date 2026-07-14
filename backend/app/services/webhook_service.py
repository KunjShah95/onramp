"""
Webhook Service — manage webhook endpoints for external integrations.

Users can register webhook URLs that receive HTTP POST requests when
certain events occur (task assigned, PR submitted, etc.).
"""

import hashlib
import hmac
import json
import os
from cryptography.fernet import Fernet
from datetime import datetime, timezone
from typing import Optional, List
from app.services.postgres_db import get_storage, generate_id


def _get_fernet() -> Optional[Fernet]:
    key = os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return None


def encrypt_token(plaintext: str) -> str:
    f = _get_fernet()
    if f is None:
        env = os.getenv("ENV", "development").lower()
        if env == "production":
            raise RuntimeError(
                "GITHUB_TOKEN_ENCRYPTION_KEY must be set in production — "
                "refusing to store secrets in plaintext."
            )
        logger.warning("GITHUB_TOKEN_ENCRYPTION_KEY not set — storing token in plaintext (dev only)")
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    f = _get_fernet()
    if f is None:
        env = os.getenv("ENV", "development").lower()
        if env == "production":
            raise RuntimeError(
                "GITHUB_TOKEN_ENCRYPTION_KEY must be set in production — "
                "refusing to read secrets in plaintext."
            )
        logger.warning("GITHUB_TOKEN_ENCRYPTION_KEY not set — reading token in plaintext (dev only)")
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        logger.error("Failed to decrypt GitHub token — key may have changed")
        return ciphertext

COLLECTION = "onramp_webhooks"
DELIVERIES_COLLECTION = "onramp_webhook_deliveries"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_secret() -> str:
    """Generate a webhook signing secret."""
    import secrets
    return f"whsec_{secrets.token_hex(20)}"


SUPPORTED_EVENTS = [
    "task.assigned",
    "task.started",
    "task.submitted",
    "task.reviewed",
    "task.approved",
    "task.completed",
    "task.needs_changes",
    "task.cancelled",
    "module.granted",
    "pr.merged",
    "milestone.reached",
    "team.invite",
    "*",  # wildcard — all events
]

EVENT_LABELS = {
    "task.assigned": "Task Assigned",
    "task.started": "Task Started",
    "task.submitted": "Task Submitted",
    "task.reviewed": "Task Reviewed",
    "task.approved": "Task Approved",
    "task.completed": "Task Completed",
    "task.needs_changes": "Changes Requested",
    "task.cancelled": "Task Cancelled",
    "module.granted": "Module Granted",
    "pr.merged": "PR Merged",
    "milestone.reached": "Milestone Reached",
    "team.invite": "Team Invite",
    "*": "All Events",
}


async def create_webhook(
    user_id: str,
    url: str,
    events: List[str],
    description: str = "",
    team_id: Optional[str] = None,
) -> dict:
    """Register a new webhook endpoint."""
    storage = get_storage()
    now = _utcnow()
    webhook_id = generate_id()

    webhook = {
        "webhook_id": webhook_id,
        "user_id": user_id,
        "url": url,
        "events": events,
        "secret": _generate_secret(),
        "description": description,
        "team_id": team_id or "",
        "active": True,
        "created_at": now,
        "updated_at": now,
        "last_success_at": None,
        "last_failure_at": None,
        "delivery_count": 0,
        "failure_count": 0,
    }

    await storage.create_document(COLLECTION, webhook_id, webhook)
    return webhook


async def list_webhooks(user_id: str) -> List[dict]:
    """List all webhooks for a user."""
    storage = get_storage()
    webhooks = await storage.query_documents(
        COLLECTION, [("user_id", "==", user_id)]
    )
    webhooks.sort(key=lambda w: w.get("created_at", ""), reverse=True)
    return webhooks


async def get_webhook(webhook_id: str) -> Optional[dict]:
    """Get a single webhook by ID."""
    storage = get_storage()
    return await storage.get_document(COLLECTION, webhook_id)


async def update_webhook(
    webhook_id: str,
    user_id: str,
    updates: dict,
) -> Optional[dict]:
    """Update a webhook (url, events, active, description)."""
    storage = get_storage()
    webhook = await storage.get_document(COLLECTION, webhook_id)
    if not webhook or webhook.get("user_id") != user_id:
        return None

    allowed_fields = {"url", "events", "active", "description"}
    clean_updates = {k: v for k, v in updates.items() if k in allowed_fields}
    if not clean_updates:
        return webhook

    clean_updates["updated_at"] = _utcnow()
    return await storage.update_document(COLLECTION, webhook_id, clean_updates)


async def delete_webhook(webhook_id: str, user_id: str) -> bool:
    """Delete a webhook."""
    storage = get_storage()
    webhook = await storage.get_document(COLLECTION, webhook_id)
    if not webhook or webhook.get("user_id") != user_id:
        return False
    await storage.delete_document(COLLECTION, webhook_id)
    return True


async def rotate_secret(webhook_id: str, user_id: str) -> Optional[dict]:
    """Rotate the signing secret for a webhook."""
    storage = get_storage()
    webhook = await storage.get_document(COLLECTION, webhook_id)
    if not webhook or webhook.get("user_id") != user_id:
        return None
    return await storage.update_document(COLLECTION, webhook_id, {
        "secret": _generate_secret(),
        "updated_at": _utcnow(),
    })


async def test_webhook(webhook_id: str, user_id: str) -> dict:
    """Send a test event to a webhook to verify it works."""
    import httpx

    webhook = await get_webhook(webhook_id)
    if not webhook or webhook.get("user_id") != user_id:
        return {"success": False, "error": "Webhook not found"}

    payload = {
        "event": "test.ping",
        "webhook_id": webhook_id,
        "timestamp": _utcnow(),
        "data": {
            "message": "This is a test ping from Onramp.",
        },
    }

    try:
        secret = webhook.get("secret", "")
        body = json.dumps(payload)
        signature = hmac.new(
            secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                webhook["url"],
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Onramp-Event": "test.ping",
                    "X-Onramp-Signature": f"sha256={signature}",
                    "X-Onramp-Delivery": webhook_id,
                },
            )

        return {
            "success": resp.status_code < 400,
            "status_code": resp.status_code,
            "error": None if resp.status_code < 400 else f"HTTP {resp.status_code}",
        }
    except Exception as e:
        return {"success": False, "status_code": None, "error": str(e)}


# ── Integration configs (Slack, GitHub) ─────────────────────

INTEGRATION_CONFIG_COLLECTION = "onramp_integrations"


async def get_integration_config(user_id: str, integration: str) -> Optional[dict]:
    """Get a user's integration configuration."""
    storage = get_storage()
    results = await storage.query_documents(
        INTEGRATION_CONFIG_COLLECTION,
        [("user_id", "==", user_id), ("integration", "==", integration)],
    )
    if not results:
        return None
    result = results[0]
    config = result.get("config", {})
    if integration == "github" and config.get("token"):
        config["token"] = decrypt_token(config["token"])
        result["config"] = config
    return result


async def save_integration_config(
    user_id: str,
    integration: str,
    config: dict,
) -> dict:
    """Save or update integration configuration."""
    storage = get_storage()
    existing = await storage.query_documents(
        INTEGRATION_CONFIG_COLLECTION,
        [("user_id", "==", user_id), ("integration", "==", integration)],
    )

    # Encrypt GitHub token at rest
    if integration == "github" and config.get("token"):
        config["token"] = encrypt_token(config["token"])

    now = _utcnow()
    entry = {
        "user_id": user_id,
        "integration": integration,
        "config": config,
        "updated_at": now,
    }

    if existing:
        await storage.update_document(
            INTEGRATION_CONFIG_COLLECTION, existing[0]["id"], entry
        )
        entry["id"] = existing[0]["id"]
    else:
        entry_id = generate_id()
        entry["id"] = entry_id
        entry["created_at"] = now
        await storage.create_document(INTEGRATION_CONFIG_COLLECTION, entry_id, entry)

    return entry


async def delete_integration_config(user_id: str, integration: str) -> bool:
    """Delete integration configuration."""
    storage = get_storage()
    existing = await storage.query_documents(
        INTEGRATION_CONFIG_COLLECTION,
        [("user_id", "==", user_id), ("integration", "==", integration)],
    )
    for entry in existing:
        await storage.delete_document(INTEGRATION_CONFIG_COLLECTION, entry["id"])
    return len(existing) > 0


async def list_integrations(user_id: str) -> List[dict]:
    """List all integrations for a user."""
    storage = get_storage()
    return await storage.query_documents(
        INTEGRATION_CONFIG_COLLECTION,
        [("user_id", "==", user_id)],
    )
