"""Audit logging service for API key management operations.

Tracks all key creation, rotation, revocation, and listing actions
for compliance and security auditing.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from app.services.postgres_db import get_storage, generate_id

AUDIT_COLLECTION = "api_key_audit_logs"


async def log_key_action(
    org_name: str,
    action: str,  # "created", "rotated", "revoked", "listed"
    user_id: str,
    user_role: str,
    key_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> dict:
    """Log an API key management action to audit trail."""
    storage = get_storage()

    record = {
        "org_name": org_name,
        "action": action,
        "user_id": user_id,
        "user_role": user_role,
        "key_id": key_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": details or {},
    }

    doc = await storage.create_document(AUDIT_COLLECTION, generate_id(), record)
    return doc


async def get_audit_logs(
    org_name: str,
    limit: int = 50,
    action_filter: Optional[str] = None,
) -> list[dict]:
    """Fetch audit logs for an org, optionally filtered by action."""
    storage = get_storage()

    query = [("org_name", "==", org_name)]
    if action_filter:
        query.append(("action", "==", action_filter))

    logs = await storage.query_documents(AUDIT_COLLECTION, query)
    return sorted(logs, key=lambda x: x.get("timestamp", ""), reverse=True)[:limit]
