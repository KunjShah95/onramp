"""
API Key Service - PostgreSQL backend
Manages API key creation, validation, and rotation
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from app.services.postgres_db import get_storage, generate_id


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


def hash_api_key(key: str) -> str:
    """Hash an API key using HMAC-SHA256 with a server-side pepper.
    
    The pepper (API_KEY_HMAC_SECRET) adds defense-in-depth: even if the
    hash column is leaked, keys cannot be brute-forced without the pepper.
    Falls back to raw SHA-256 if no pepper is configured (acceptable given
    the high entropy of the key format: cf_ + token_urlsafe(32)).
    """
    pepper = os.getenv("API_KEY_HMAC_SECRET", "")
    if pepper:
        return hmac.new(pepper.encode(), key.encode(), hashlib.sha256).hexdigest()
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key() -> str:
    """Generate a secure random API key"""
    return f"cf_{secrets.token_urlsafe(32)}"


TIER_LIMITS = {
    "free": {"requests_per_minute": 20, "requests_per_day": 100, "credits_per_month": 500, "max_repos": 1},
    "pro": {"requests_per_minute": 200, "requests_per_day": 10000, "credits_per_month": 10000, "max_repos": 50},
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
}


async def create_api_key(
    name: str,
    user_id: Optional[str] = None,
    team_id: Optional[str] = None,
    expires_in_days: Optional[int] = None,
    permissions: Optional[Dict[str, Any]] = None,
) -> tuple[str, dict]:
    """
    Create a new API key.
    Returns (plain_key, key_record) - plain_key is shown only once.
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
        # Bug #9: store as ISO string so validate_api_key can parse consistently.
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=expires_in_days)
        ).isoformat()

    data = {
        "key_hash": key_hash,
        "name": name,
        "user_id": user_id,
        "team_id": team_id,
        "is_active": True,
        "expires_at": expires_at,
        "permissions": permissions or {},
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
    key_hash = hash_api_key(plain_key)

    results = await storage.query_documents(
        "api_keys",
        [("key_hash", "==", key_hash)]
    )

    if not results:
        return None

    key_record = results[0]

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
        {"last_used_at": datetime.now(timezone.utc).isoformat()}
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
            "name": k["name"],
            "is_active": k["is_active"],
            "created_at": k["created_at"],
            "last_used_at": k.get("last_used_at"),
            "expires_at": k.get("expires_at"),
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
    ) -> dict:
        """Create an API key scoped to an org (stored as a team)."""
        if tier not in TIER_LIMITS:
            return {"error": f"Invalid tier: {tier}"}
        try:
            # Org-centric: the org/team id IS the tenant scope for the key.
            team_scope = org_id or org_name
            plain_key, record = await create_api_key(
                name=org_name,
                team_id=team_scope,
                permissions={"tier": tier, "created_by": created_by, "org_name": org_name},
            )
            return {
                "raw_key": plain_key,
                "key_id": record["id"],
                "org_name": org_name,
                "team_id": team_scope,
                "tier": tier,
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
        """Validate an API key and return its record (enriched with org_name/tier)."""
        rec = await validate_api_key(raw_key)
        if rec is None:
            return None
        perms = rec.get("permissions") or {}
        return {
            **rec,
            "org_name": perms.get("org_name") or rec.get("name"),
            "tier": perms.get("tier", "free"),
        }

    @classmethod
    def get_tier_limits(cls, tier: str) -> dict:
        """Return limits for a given tier."""
        return TIER_LIMITS.get(tier, TIER_LIMITS["free"])

    @classmethod
    def get_credit_cost(cls, action: str) -> int:
        """Return the credit cost for an action (default if unlisted)."""
        return CREDIT_COSTS.get(action, DEFAULT_CREDIT_COST)
