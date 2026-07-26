import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from app.services.postgres_db import get_storage

logger = logging.getLogger(__name__)

FLAGS_COLLECTION = "onramp_feature_flags"


class FeatureFlagService:
    async def get_flags(self, team_id: str) -> List[Dict[str, Any]]:
        storage = get_storage()
        return await storage.query_documents(
            FLAGS_COLLECTION,
            [("team_id", "==", team_id)],
        )

    async def get_flag(self, team_id: str, flag_name: str) -> Optional[Dict[str, Any]]:
        storage = get_storage()
        flags = await storage.query_documents(
            FLAGS_COLLECTION,
            [("team_id", "==", team_id), ("flag_name", "==", flag_name)],
        )
        return flags[0] if flags else None

    async def is_enabled(self, team_id: str, flag_name: str) -> bool:
        flag = await self.get_flag(team_id, flag_name)
        return flag is not None and flag.get("enabled", False)

    async def set_flag(self, team_id: str, flag_name: str, enabled: bool, created_by: str) -> Dict[str, Any]:
        storage = get_storage()
        existing = await self.get_flag(team_id, flag_name)
        now = datetime.now(timezone.utc)

        if existing:
            flag_id = existing["id"]
            await storage.update_document(FLAGS_COLLECTION, flag_id, {
                "enabled": enabled,
                "updated_at": now,
            })
            return {**existing, "enabled": enabled, "updated_at": now.isoformat()}

        import uuid
        flag_id = str(uuid.uuid4())
        doc = {
            "id": flag_id,
            "team_id": team_id,
            "flag_name": flag_name,
            "enabled": enabled,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        await storage.create_document(FLAGS_COLLECTION, flag_id, doc)
        return doc

    async def delete_flag(self, team_id: str, flag_name: str) -> bool:
        storage = get_storage()
        existing = await self.get_flag(team_id, flag_name)
        if not existing:
            return False
        await storage.delete_document(FLAGS_COLLECTION, existing["id"])
        return True


# ── Convenience wrappers (for use outside FastAPI DI) ──────────

_fs = FeatureFlagService()


async def is_feature_flag_enabled(team_id: str, flag_name: str) -> bool:
    """Check if a feature flag is enabled for a team."""
    return await _fs.is_enabled(team_id, flag_name)
