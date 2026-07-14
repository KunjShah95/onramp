from typing import Dict, Any, List, Optional
from datetime import datetime
from app.services.postgres_db import get_storage, generate_id


class PlaybookService:
    COLLECTION = "onramp_playbooks"

    def __init__(self):
        self.storage = get_storage()

    async def create_playbook(self, team_id: str, title: str, description: str, steps: List[str], created_by: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        pb_id = generate_id()
        playbook = {
            "playbook_id": pb_id,
            "team_id": team_id,
            "title": title,
            "description": description,
            "steps": steps,
            "tags": tags or [],
            "created_by": created_by,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "version": 1,
            "is_archived": False,
            "use_count": 0,
        }
        await self.storage.create_document(self.COLLECTION, pb_id, playbook)
        return playbook

    async def get_playbook(self, playbook_id: str) -> Optional[Dict[str, Any]]:
        return await self.storage.get_document(self.COLLECTION, playbook_id)

    async def list_playbooks(self, team_id: str) -> List[Dict[str, Any]]:
        return await self.storage.query_documents(
            self.COLLECTION,
            [("team_id", "==", team_id), ("is_archived", "==", False)],
        )

    async def update_playbook(self, playbook_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        pb = await self.get_playbook(playbook_id)
        if not pb:
            return None
        updates["updated_at"] = datetime.now().isoformat()
        updates["version"] = pb.get("version", 1) + 1
        await self.storage.update_document(self.COLLECTION, playbook_id, updates)
        return {**pb, **updates}

    async def archive_playbook(self, playbook_id: str) -> bool:
        pb = await self.get_playbook(playbook_id)
        if not pb:
            return False
        await self.storage.update_document(self.COLLECTION, playbook_id, {"is_archived": True})
        return True

    async def increment_use(self, playbook_id: str) -> None:
        pb = await self.get_playbook(playbook_id)
        if pb:
            await self.storage.update_document(self.COLLECTION, playbook_id, {"use_count": pb.get("use_count", 0) + 1})
