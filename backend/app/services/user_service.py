"""User service — tracks registered users in the backend storage.

Prevents duplicate records: each email can only register once.
The provider field (google.com | password) is locked at first registration.
If someone tries to sign in with a different provider than their original,
the service returns a MIGRATION_NEEDED error so the frontend can show a
dedicated error message instead of creating a duplicate.
"""

import uuid
from datetime import datetime, timezone
from app.services.postgres_db import get_storage, generate_id

STORAGE_COLLECTION = "users"


async def create_user(
    uid: str,
    email: str,
    name: str,
    provider: str,
) -> dict:
    """Create a backend user record. Returns the record or raises on duplicate."""
    storage = get_storage()

    existing = await get_user_by_email(email)
    if existing:
        if existing["provider"] != provider:
            raise ValueError(
                f"This email is already registered with {existing['provider']}. "
                f"Please sign in with {existing['provider']} instead."
            )
        return existing

    now = datetime.now(timezone.utc)
    record = {
        "email": email,
        "name": name,
        "provider": provider,
        "created_at": now,
        "updated_at": now,
    }

    doc = await storage.create_document(STORAGE_COLLECTION, uid, record)
    return _normalize(doc)


def _normalize(record: dict | None) -> dict | None:
    if record is not None and "id" in record and "uid" not in record:
        record["uid"] = record.pop("id")
    return record


async def get_user_by_uid(uid: str) -> dict | None:
    storage = get_storage()
    return _normalize(await storage.get_document(STORAGE_COLLECTION, uid))


async def get_user_by_email(email: str) -> dict | None:
    storage = get_storage()
    results = await storage.query_documents(
        STORAGE_COLLECTION, [("email", "==", email)]
    )
    return _normalize(results[0]) if results else None


async def get_user_by_email_fast(email: str) -> dict | None:
    return await get_user_by_email(email)


async def list_users() -> list[dict]:
    storage = get_storage()
    return [_normalize(u) for u in await storage.list_documents(STORAGE_COLLECTION)]
