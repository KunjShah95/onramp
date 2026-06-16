import secrets
import hashlib
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from app.services.firestore_db import get_storage, generate_id


API_KEY_PREFIX = "cf_"

TIER_LIMITS = {
    "free": {"requests_per_min": 50, "credits_per_month": 50, "max_repos": 1, "max_team_members": 1},
    "startup": {"requests_per_min": 500, "credits_per_month": 5000, "max_repos": 10, "max_team_members": 5},
    "professional": {"requests_per_min": 2000, "credits_per_month": 50000, "max_repos": 50, "max_team_members": 20},
    "enterprise": {"requests_per_min": 10000, "credits_per_month": 1000000, "max_repos": 999, "max_team_members": 999},
}

CREDIT_COSTS = {
    "explore": 10, "learn": 5, "first_pr_issues": 3, "first_pr_guide": 5,
    "ask_index": 10, "ask_query": 2, "pair": 20, "patterns": 15, "test_checklist": 10,
    "health": 3, "report": 5,
}


class APIKeyService:
    COLLECTION = "codeflow_api_keys"

    def __init__(self):
        self.storage = get_storage()

    async def create_key(self, org_name: str, tier: str = "free", created_by: str = "system") -> Dict[str, Any]:
        tier = tier.lower()
        if tier not in TIER_LIMITS:
            return {"error": f"Invalid tier. Choose: {', '.join(TIER_LIMITS.keys())}"}

        raw_key = API_KEY_PREFIX + secrets.token_hex(32)
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_id = generate_id()

        doc = {
            "key_id": key_id,
            "key_hash": key_hash,
            "org_name": org_name,
            "tier": tier,
            "created_by": created_by,
            "created_at": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(days=365)).isoformat(),
            "is_active": True,
            "last_used": None,
            "usage_count": 0,
        }
        await self.storage.create_document(self.COLLECTION, key_id, doc)
        return {**doc, "raw_key": raw_key, "key_hash": "***"}

    async def validate_key(self, raw_key: str) -> Optional[Dict[str, Any]]:
        if not raw_key.startswith(API_KEY_PREFIX):
            return None
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        keys = await self.storage.query_documents(self.COLLECTION, [("key_hash", "==", key_hash)])
        if not keys:
            return None
        key = keys[0]
        if not key.get("is_active", True):
            return None
        expires = key.get("expires_at")
        if expires and datetime.fromisoformat(expires) < datetime.now():
            return None
        key_id = key.get("key_id", key.get("id", ""))
        await self.storage.update_document(self.COLLECTION, key_id, {
            "last_used": datetime.now().isoformat(),
            "usage_count": key.get("usage_count", 0) + 1,
        })
        return key

    async def list_keys(self, org_name: Optional[str] = None) -> List[Dict[str, Any]]:
        if org_name:
            keys = await self.storage.query_documents(self.COLLECTION, [("org_name", "==", org_name)])
        else:
            keys = await self.storage.list_documents(self.COLLECTION)
        for k in keys:
            k.pop("key_hash", None)
        return keys

    async def revoke_key(self, key_id: str) -> bool:
        key = await self.storage.get_document(self.COLLECTION, key_id)
        if not key:
            return False
        await self.storage.update_document(self.COLLECTION, key_id, {"is_active": False})
        return True

    @staticmethod
    def get_tier_limits(tier: str) -> Dict[str, Any]:
        return TIER_LIMITS.get(tier, TIER_LIMITS["free"])

    @staticmethod
    def get_credit_cost(endpoint: str) -> int:
        return CREDIT_COSTS.get(endpoint, 5)
