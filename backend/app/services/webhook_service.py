"""
Webhook Service — manage webhook endpoints for external integrations.

Users can register webhook URLs that receive HTTP POST requests when
certain events occur (task assigned, PR submitted, etc.).

Supports key rotation via GITHUB_TOKEN_ENCRYPTION_KEY (current) and
GITHUB_TOKEN_ENCRYPTION_KEY_PREV (previous key for migration).
"""

import hashlib
import hmac
import json
import logging
import os
import httpx
from cryptography.fernet import Fernet, InvalidToken
from datetime import datetime, timezone
from typing import Optional, List
from app.services.postgres_db import get_storage, generate_id
from app.services.outbound_url import OutboundURLError, validate_outbound_url

logger = logging.getLogger(__name__)


def _get_fernet_keys() -> List[Fernet]:
    """Get all valid Fernet keys in order: current first, then previous keys."""
    keys = []
    
    # Current key (required in production)
    current = os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY")
    if current:
        try:
            keys.append(Fernet(current.encode() if isinstance(current, str) else current))
        except Exception:
            logger.exception("Invalid GITHUB_TOKEN_ENCRYPTION_KEY format")
    
    # Previous key for rotation migration
    prev = os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY_PREV")
    if prev:
        try:
            keys.append(Fernet(prev.encode() if isinstance(prev, str) else prev))
        except Exception:
            logger.exception("Invalid GITHUB_TOKEN_ENCRYPTION_KEY_PREV format")
    
    return keys


def _get_fernet() -> Optional[Fernet]:
    """Get the current Fernet instance for encryption (backward compat)."""
    current = os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY")
    if not current:
        return None
    try:
        return Fernet(current.encode() if isinstance(current, str) else current)
    except Exception:
        logger.exception("Invalid GITHUB_TOKEN_ENCRYPTION_KEY format")
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
    """Strict decrypt using multi-key fallback for rotation support."""
    fernet_keys = _get_fernet_keys()
    if not fernet_keys:
        env = os.getenv("ENV", "development").lower()
        if env == "production":
            raise RuntimeError(
                "GITHUB_TOKEN_ENCRYPTION_KEY must be set in production — "
                "refusing to read secrets in plaintext."
            )
        logger.warning("GITHUB_TOKEN_ENCRYPTION_KEY not set — reading token in plaintext (dev only)")
        return ciphertext
    
    last_error = None
    for f in fernet_keys:
        try:
            return f.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            last_error = "InvalidToken"
            continue
        except Exception as e:
            last_error = str(e)
            continue
    
    logger.error("Failed to decrypt GitHub token with all available keys — key rotation mismatch or corrupted data: %s", last_error)
    # In production, raise to prevent using corrupted tokens
    env = os.getenv("ENV", "development").lower()
    if env == "production":
        raise ValueError(f"Failed to decrypt GitHub token — key mismatch (last error: {last_error})")
    return ciphertext


def reencrypt_token(ciphertext: str) -> str:
    """Re-encrypt a token with the current key (for migration scripts)."""
    try:
        plaintext = decrypt_token(ciphertext)
        return encrypt_token(plaintext)
    except Exception:
        logger.warning("Failed to re-encrypt token, keeping original")
        return ciphertext

COLLECTION = "onramp_webhooks"
DELIVERIES_COLLECTION = "onramp_webhook_deliveries"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


def _validate_webhook_url(url: str) -> None:
    """Validate a webhook URL. Raises ValueError on failure."""
    if not isinstance(url, str) or not url.strip():
        raise ValueError("Webhook URL is required")
    if not url.strip().startswith(("http://", "https://")):
        raise ValueError("Webhook URL must start with http:// or https://")


def _validate_webhook_events(events) -> None:
    """Validate a webhook events list. Raises ValueError on failure."""
    if not isinstance(events, list) or len(events) == 0:
        raise ValueError("Webhook must subscribe to at least one event")


async def create_webhook(
    user_id: str,
    url: str,
    events: List[str],
    description: str = "",
    team_id: Optional[str] = None,
) -> dict:
    """Register a new webhook endpoint."""
    _validate_webhook_url(url)
    _validate_webhook_events(events)
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

    if "url" in clean_updates:
        _validate_webhook_url(clean_updates["url"])
    if "events" in clean_updates:
        _validate_webhook_events(clean_updates["events"])

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
        validate_outbound_url(webhook["url"])
        secret = webhook.get("secret", "")
        body = json.dumps(payload)
        signature = hmac.new(
            secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
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
    config = dict(result.get("config", {}))
    if integration in ("github", "gitlab") and config.get("token"):
        config["token"] = decrypt_token(config["token"])
        result["config"] = config
    if integration == "bitbucket" and config.get("app_password"):
        config["app_password"] = decrypt_token(config["app_password"])
        result["config"] = config
    if integration == "jira" and config.get("api_token"):
        config["api_token"] = decrypt_token(config["api_token"])
        result["config"] = config
    if integration == "linear" and config.get("api_key"):
        config["api_key"] = decrypt_token(config["api_key"])
    if integration == "n8n" and config.get("api_key"):
        config["api_key"] = decrypt_token(config["api_key"])
        result["config"] = config
    if integration == "slack" and config.get("webhook_url"):
        config["webhook_url"] = decrypt_token(config["webhook_url"])
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

    # Encrypt tokens at rest for supported integrations
    if integration in ("github", "gitlab") and config.get("token"):
        config["token"] = encrypt_token(config["token"])
    if integration == "bitbucket" and config.get("app_password"):
        config["app_password"] = encrypt_token(config["app_password"])
    if integration == "jira" and config.get("api_token") and config["api_token"] != "••••••••":
        config["api_token"] = encrypt_token(config["api_token"])
    if integration == "linear" and config.get("api_key") and config["api_key"] != "••••••••":
        config["api_key"] = encrypt_token(config["api_key"])
    if integration == "n8n" and config.get("api_key") and config["api_key"] != "••••••••":
        config["api_key"] = encrypt_token(config["api_key"])
    if integration == "slack" and config.get("webhook_url") and "••" not in config["webhook_url"]:
        config["webhook_url"] = encrypt_token(config["webhook_url"])

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


# ── API key event webhooks ─────────────────────────────────

async def send_webhook(
    webhook_url: str,
    event_type: str,
    key_id: str,
    org_name: str,
    details: dict,
) -> bool:
    """Send webhook notification asynchronously.

    Returns True if successful, False otherwise. Failures are logged
    but do not block the main operation.
    """
    if not webhook_url:
        return True

    payload = {
        "event": event_type,
        "key_id": key_id,
        "org_name": org_name,
        "timestamp": details.get("timestamp"),
        "details": details,
    }

    try:
        validate_outbound_url(webhook_url)
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
            return True
    except Exception as e:
        logger.error(f"Webhook delivery failed to {webhook_url}: {e}")
        return False
