"""
API Key Service - PostgreSQL backend
Manages API key creation, validation, and rotation
"""

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger(__name__)


def _coerce_aware_datetime(value: Any) -> Optional[datetime]:
    """Normalize a stored expires_at (ISO str or datetime) to a tz-aware datetime."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ── Pepper versioning ──────────────────────────────────────────────────────────
#
# API keys are stored only as HMAC-SHA256 hashes (never plaintext), so a pepper
# rotation cannot re-hash existing keys in place. To keep pre-rotation keys
# working through a transition window, every key records which pepper version
# hashed it (``permissions.pepper_version``) and ``validate_api_key`` falls back
# to the known legacy peppers when the current-pepper lookup misses.
#
# Keys created before versioning existed (hashed with the dev default pepper
# because API_KEY_HMAC_SECRET was unset) carry no version and are matched via
# the legacy fallback below. Regenerate them (create_api_key) to move them to
# the current pepper, then set API_KEY_ALLOW_LEGACY_PEPPER=false to turn the
# fallback off.

_DEV_DEFAULT_PEPPER = "dev-pepper-not-secure"
# Version label for keys hashed with the pepper configured in the environment.
CURRENT_PEPPER_VERSION = "v1"
# Known historical peppers, keyed by version label. The dev default was used
# whenever API_KEY_HMAC_SECRET was unset (any non-production ENV value).
_LEGACY_PEPPERS = {
    "legacy-dev": _DEV_DEFAULT_PEPPER,
}


def _legacy_fallback_enabled() -> bool:
    """Whether legacy-pepper validation is allowed during the rotation window."""
    return os.getenv("API_KEY_ALLOW_LEGACY_PEPPER", "true").lower() in ("1", "true", "yes")


def get_pepper() -> str:
    """Get the current API key HMAC pepper from environment.

    In production this MUST be set. Falls back to a dev default only
    when ENV is not 'production'.
    """
    env = os.getenv("ENV", "development")
    pepper = os.getenv("API_KEY_HMAC_SECRET", "")
    if env == "production" and not pepper:
        raise RuntimeError(
            "API_KEY_HMAC_SECRET is required in production. "
            "Generate one: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    return pepper or _DEV_DEFAULT_PEPPER


def hash_api_key(key: str) -> str:
    """Hash an API key using HMAC-SHA256 with the current server-side pepper.

    The pepper (API_KEY_HMAC_SECRET) adds defense-in-depth: even if the
    hash column is leaked, keys cannot be brute-forced without the pepper.
    HMAC-SHA256 is ALWAYS used — no fallback to raw SHA-256.
    """
    return _hash_with_pepper(key, get_pepper())


def _hash_with_pepper(key: str, pepper: str) -> str:
    """HMAC-SHA256 hash of a key with an explicit pepper (for legacy matching)."""
    return hmac.new(pepper.encode(), key.encode(), hashlib.sha256).hexdigest()


async def _find_key_record(storage, plain_key: str) -> Optional[dict]:
    """Locate the key record for a plaintext key.

    Looks up the hash under the current pepper first, then (during the
    rotation window) under each known legacy pepper. Logs a warning when a
    key validates via a legacy pepper so operators know to regenerate it.
    """
    current_pepper = get_pepper()
    current_hash = _hash_with_pepper(plain_key, current_pepper)
    results = await storage.query_documents(
        "api_keys", [("key_hash", "==", current_hash)]
    )
    if results:
        return results[0]

    if not _legacy_fallback_enabled():
        return None

    for version, pepper in _LEGACY_PEPPERS.items():
        if pepper == current_pepper:
            continue
        legacy_hash = _hash_with_pepper(plain_key, pepper)
        results = await storage.query_documents(
            "api_keys", [("key_hash", "==", legacy_hash)]
        )
        if results:
            logger.warning(
                "API key %s authenticated via legacy pepper '%s' — regenerate the "
                "key to move it to the current pepper, then set "
                "API_KEY_ALLOW_LEGACY_PEPPER=false",
                results[0].get("id"), version,
            )
            return results[0]
    return None


async def rehash_existing_keys() -> dict:
    """Report API key hashing status and classify keys by pepper version.

    Plaintext keys are never stored, so existing hashes cannot be re-computed
    in place. Keys created before pepper versioning was added carry no
    ``permissions.pepper_version`` and are authenticated via the legacy
    fallback (see :func:`validate_api_key`). Regenerate them via
    ``create_api_key()`` to move them onto the current pepper.
    """
    storage = get_storage()
    keys = await storage.list_documents("api_keys")
    total = len(keys)
    active = sum(1 for k in keys if k.get("is_active", False))
    versioned = sum(
        1 for k in keys if (k.get("permissions") or {}).get("pepper_version")
    )
    return {
        "total_keys": total,
        "active_keys": active,
        "keys_on_current_pepper": versioned,
        "legacy_keys": max(total - versioned, 0),
        "note": "Plaintext keys are not stored, so hashes cannot be re-hashed in "
                "place. Keys without a pepper_version authenticate via the legacy "
                "fallback; regenerate them through the key creation endpoint to move "
                "them onto the current pepper, then set API_KEY_ALLOW_LEGACY_PEPPER=false.",
    }


def generate_api_key() -> str:
    """Generate a secure random API key"""
    return f"cf_{secrets.token_urlsafe(32)}"


# Tier mapping: subscription tier → API key tier
TIER_MAPPING = {
    "free": "free",
    "startup": "pro",
    "professional": "enterprise",
    "usage_based": "usage_based",
    "enterprise": "enterprise",
}

TIER_LIMITS = {
    "free": {"requests_per_minute": 20, "requests_per_day": 100, "credits_per_month": 500, "max_repos": 1},
    "pro": {"requests_per_minute": 200, "requests_per_day": 10000, "credits_per_month": 10000, "max_repos": 50},
    "team": {"requests_per_minute": 500, "requests_per_day": 50000, "credits_per_month": 50000, "max_repos": 100},
    "usage_based": {"requests_per_minute": 200, "requests_per_day": 10000, "credits_per_month": 0, "max_repos": 1},
    "enterprise": {"requests_per_minute": 2000, "requests_per_day": 100000, "credits_per_month": 100000, "max_repos": -1},
}

# Default credit cost for any action not explicitly listed.
DEFAULT_CREDIT_COST = 5

CREDIT_COSTS = {
    "chat": 1,
    "embed": 1,
    "generate": 5,
    "learn": 5,
    "explore": 10,
    "analyze": 10,
    "pr_review": 15,
    "trailer": 20,
}


async def create_api_key(
    name: str,
    user_id: Optional[str] = None,
    team_id: Optional[str] = None,
    expires_in_days: Optional[int] = None,
    permissions: Optional[Dict[str, Any]] = None,
    credit_limit: Optional[int] = None,
) -> tuple[str, dict]:
    """
    Create a new API key.
    Returns (plain_key, key_record) - plain_key is shown only once.

    ``credit_limit`` is an optional per-key cost budget (in credits). When set,
    the key stops working once its cumulative credits_used reach the limit.
    It is stored inside the ``permissions`` JSONB dict so no schema migration
    is required.
    """
    storage = get_storage()

    if not user_id and not team_id:
        raise ValueError("Either user_id or team_id must be provided")
    if user_id and team_id:
        raise ValueError("Provide user_id or team_id, not both")

    plain_key = generate_api_key()
    key_hash = hash_api_key(plain_key)

    expires_at = None
    if expires_in_days:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=expires_in_days)
        )

    perms = dict(permissions or {})
    if credit_limit is not None:
        perms["credit_limit"] = int(credit_limit)
    perms.setdefault("credits_used", 0)
    # Record which pepper hashed this key so future rotations can distinguish
    # current-pepper keys from legacy ones (see _find_key_record).
    perms["pepper_version"] = CURRENT_PEPPER_VERSION

    data = {
        "key_hash": key_hash,
        "name": name,
        "user_id": user_id,
        "team_id": team_id,
        "is_active": True,
        "expires_at": expires_at,
        "permissions": perms,
    }

    record = await storage.create_document("api_keys", generate_id(), data)
    return plain_key, record


async def get_api_key(key_id: str) -> Optional[dict]:
    """Get API key record by ID"""
    storage = get_storage()
    return await storage.get_document("api_keys", key_id)


async def validate_api_key(plain_key: str) -> Optional[dict]:
    """Validate an API key and return the key record if valid"""
    storage = get_storage()
    key_record = await _find_key_record(storage, plain_key)

    if key_record is None:
        return None

    if not key_record.get("is_active", False):
        return None

    # Bug #9: expires_at may be a str (ISO) or datetime; handle both
    # defensively and compare tz-aware values.
    expires_at = _coerce_aware_datetime(key_record.get("expires_at"))
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None

    await storage.update_document(
        "api_keys",
        key_record["id"],
        {"last_used_at": datetime.now(timezone.utc)}
    )

    return key_record


async def revoke_api_key(key_id: str) -> bool:
    """Revoke an API key"""
    storage = get_storage()
    existing = await storage.get_document("api_keys", key_id)
    if not existing:
        return False
    await storage.update_document("api_keys", key_id, {"is_active": False})
    return True


async def list_api_keys(owner_id: str, owner_type: str = "user") -> list[dict]:
    """List all API keys for a user or team"""
    storage = get_storage()

    if owner_type == "user":
        results = await storage.query_documents(
            "api_keys",
            [("user_id", "==", owner_id)]
        )
    else:
        results = await storage.query_documents(
            "api_keys",
            [("team_id", "==", owner_id)]
        )

    return [
        {
            "id": k["id"],
            "key_id": k["id"],
            "name": k["name"],
            "is_active": k["is_active"],
            "created_at": k["created_at"],
            "last_used_at": k.get("last_used_at"),
            "expires_at": k.get("expires_at"),
            "permissions": k.get("permissions") or {},
            "org_name": (k.get("permissions") or {}).get("org_name") or k["name"],
            "tier": (k.get("permissions") or {}).get("tier", "free"),
            "credit_limit": (k.get("permissions") or {}).get("credit_limit"),
            "credits_used": int((k.get("permissions") or {}).get("credits_used", 0)),
            "usage_count": int((k.get("permissions") or {}).get("credits_used", 0)),
        }
        for k in results
    ]


class APIKeyService:
    """Class-based wrapper exposing the API key operations ai_gateway expects."""

    def __init__(self):
        pass

    async def create_key(
        self,
        org_name: str,
        tier: str = "free",
        created_by: str = "system",
        org_id: Optional[str] = None,
        name: Optional[str] = None,
        credit_limit: Optional[int] = None,
        expires_in_days: Optional[int] = None,
    ) -> dict:
        """Create an API key scoped to an org (stored as a team).

        ``name`` is the human-friendly label for the key (defaults to the org
        name). ``credit_limit`` is an optional per-key cost budget in credits.
        ``expires_in_days`` optionally auto-expires the key after N days.
        """
        if tier not in TIER_LIMITS:
            return {"error": f"Invalid tier: {tier}"}
        try:
            # Org-centric: the org/team id IS the tenant scope for the key.
            team_scope = org_id or org_name
            plain_key, record = await create_api_key(
                name=name or org_name,
                team_id=team_scope,
                permissions={"tier": tier, "created_by": created_by, "org_name": org_name},
                credit_limit=credit_limit,
                expires_in_days=expires_in_days,
            )
            return {
                "raw_key": plain_key,
                "key_id": record["id"],
                "org_name": org_name,
                "team_id": team_scope,
                "tier": tier,
                "name": record.get("name") or name or org_name,
                "credit_limit": credit_limit,
                "credits_used": 0,
                "expires_at": record.get("expires_at"),
                "is_active": True,
            }
        except Exception as e:
            return {"error": str(e)}

    async def list_keys(
        self,
        owner_id: Optional[str] = None,
        owner_type: str = "team",
    ) -> list[dict]:
        """List API keys scoped to a specific owner.

        Security fix: an owner scope is REQUIRED. This method can never return
        all keys across tenants. Callers must pass owner_id (a user uid or an
        org/team id) and owner_type ("user" or "team").
        """
        if not owner_id:
            raise ValueError("owner_id is required to list API keys")
        if owner_type not in ("user", "team"):
            raise ValueError("owner_type must be 'user' or 'team'")
        return await list_api_keys(owner_id, owner_type=owner_type)

    async def revoke_key(self, key_id: str) -> bool:
        """Revoke an API key by ID."""
        return await revoke_api_key(key_id)

    async def get_key(self, key_id: str) -> Optional[dict]:
        """Fetch a single API key record by ID (for ownership checks)."""
        return await get_api_key(key_id)

    async def validate_key(self, raw_key: str) -> Optional[dict]:
        """Validate an API key and return its record (enriched with org_name/tier).

        Also surfaces the key's id, per-key cost budget (``credit_limit``) and
        cumulative ``credits_used`` so callers can enforce spending limits.
        """
        rec = await validate_api_key(raw_key)
        if rec is None:
            return None
        perms = rec.get("permissions") or {}
        return {
            **rec,
            "org_name": perms.get("org_name") or rec.get("name"),
            "tier": perms.get("tier", "free"),
            "key_id": rec.get("id"),
            "credit_limit": perms.get("credit_limit"),
            "credits_used": int(perms.get("credits_used", 0)),
        }

    async def increment_credits_used(self, key_id: str, credits: int) -> Optional[dict]:
        """Add ``credits`` to a key's cumulative usage counter.

        Returns the updated key record, or None when the key does not exist.
        The counter lives inside the ``permissions`` JSONB dict, so the update
        is a read-modify-write against the storage layer.
        """
        if not key_id:
            return None
        storage = get_storage()
        record = await storage.get_document("api_keys", key_id)
        if record is None:
            return None
        perms = dict(record.get("permissions") or {})
        perms["credits_used"] = int(perms.get("credits_used", 0)) + int(credits)
        return await storage.update_document("api_keys", key_id, {"permissions": perms})

    @staticmethod
    def cost_limit_reached(credit_limit: Optional[int], credits_used: int, cost: int) -> bool:
        """Return True when charging ``cost`` credits would exceed the key budget."""
        if not credit_limit:
            return False
        return int(credits_used) + int(cost) > int(credit_limit)

    @classmethod
    def get_tier_limits(cls, tier: str) -> dict:
        """Return limits for a given tier."""
        mapped_tier = TIER_MAPPING.get(tier, "free")
        return TIER_LIMITS.get(mapped_tier, TIER_LIMITS["free"])

    @classmethod
    def map_subscription_tier(cls, subscription_tier: str) -> str:
        """Map a subscription tier to an API key tier."""
        return TIER_MAPPING.get(subscription_tier, "free")

    @classmethod
    def get_credit_cost(cls, action: str) -> int:
        """Return the credit cost for an action (default if unlisted)."""
        return CREDIT_COSTS.get(action, DEFAULT_CREDIT_COST)
