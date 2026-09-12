"""AuditStore — unified writer/reader over get_storage(), collections unchanged."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _utcnow():
    return datetime.now(timezone.utc)


class AuditStore:
    def __init__(self, collection: str):
        self.collection = collection

    async def log(self, record: Dict[str, Any]) -> dict:
        from app.services.postgres_db import get_storage, generate_id
        payload = {"timestamp": _utcnow(), **record}
        doc_id = generate_id()
        await get_storage().create_document(self.collection, doc_id, payload)
        return {"event_id": doc_id, **payload}

    async def query(self, filters: Optional[list] = None, limit: int = 50) -> List[dict]:
        from app.services.postgres_db import get_storage
        storage = get_storage()
        if filters:
            rows = await storage.query_documents(self.collection, filters)
        else:
            rows = await storage.list_documents(self.collection)
        rows = sorted(rows, key=lambda r: str(r.get("timestamp", "")), reverse=True)
        return rows[:limit]
