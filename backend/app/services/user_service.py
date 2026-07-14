"""User service — tracks registered users in the backend storage.

Prevents duplicate records: each email can only register once.
The provider field (google.com | password) is locked at first registration.
If someone tries to sign in with a different provider than their original,
the service returns a MIGRATION_NEEDED error so the frontend can show a
dedicated error message instead of creating a duplicate.

PII fields (email, name) are encrypted at rest via field_encryption.
Lookups use email_hash (deterministic SHA-256) so the raw email is never
exposed in the database.
"""

from datetime import datetime, timezone
from app.services.postgres_db import get_storage
from app.services.field_encryption import encrypt_field, decrypt_field, email_hash

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
        "email": encrypt_field(email),
        "name": encrypt_field(name),
        "email_hash": email_hash(email),
        "provider": provider,
        "created_at": now,
        "updated_at": now,
    }

    doc = await storage.create_document(STORAGE_COLLECTION, uid, record)
    return _normalize(doc)


def _decrypt_pii(record: dict) -> dict:
    if record is None:
        return None
    record = dict(record)
    if "email" in record:
        record["email"] = decrypt_field(record["email"])
    if "name" in record:
        record["name"] = decrypt_field(record["name"])
    return record


def _normalize(record: dict | None) -> dict | None:
    if record is not None:
        record = _decrypt_pii(record)
        if "id" in record and "uid" not in record:
            record["uid"] = record.pop("id")
    return record


async def get_user_by_uid(uid: str) -> dict | None:
    storage = get_storage()
    return _normalize(await storage.get_document(STORAGE_COLLECTION, uid))


async def get_user_by_email(email: str) -> dict | None:
    storage = get_storage()
    results = await storage.query_documents(
        STORAGE_COLLECTION, [("email_hash", "==", email_hash(email))]
    )
    return _normalize(results[0]) if results else None


async def get_user_by_email_fast(email: str) -> dict | None:
    return await get_user_by_email(email)


async def list_users() -> list[dict]:
    storage = get_storage()
    return [_normalize(u) for u in await storage.list_documents(STORAGE_COLLECTION)]


async def deactivate_user(uid: str) -> dict:
    """Deactivate a user account — GDPR account deletion.

    Removes the user from all teams, deletes webhooks/integrations/notifications,
    anonymizes PII fields, and marks the account as inactive.

    Returns the updated (anonymized) user record.
    """
    storage = get_storage()

    # 1. Remove from all teams
    memberships = await storage.query_documents(
        "team_members", [("user_id", "==", uid)]
    )
    for m in memberships:
        await storage.delete_document("team_members", m["id"])

    # 2. Delete webhooks and integration configs (contains GitHub tokens)
    webhooks = await storage.query_documents(
        "onramp_webhooks", [("user_id", "==", uid)]
    )
    for w in webhooks:
        await storage.delete_document("onramp_webhooks", w["id"])

    integrations = await storage.query_documents(
        "onramp_integrations", [("user_id", "==", uid)]
    )
    for i in integrations:
        await storage.delete_document("onramp_integrations", i["id"])

    # 3. Delete notifications
    notifications = await storage.query_documents(
        "onramp_notifications", [("user_id", "==", uid)]
    )
    for n in notifications:
        await storage.delete_document("onramp_notifications", n["id"])

    notification_prefs = await storage.get_document("onramp_notification_preferences", uid)
    if notification_prefs:
        await storage.delete_document("onramp_notification_preferences", uid)

    # 4. Clean gamification data (XP, badges, streaks)
    for coll in ("onramp_gamification_xp", "onramp_gamification_badges",
                  "onramp_gamification_streaks"):
        records = await storage.query_documents(coll, [("user_id", "==", uid)])
        for r in records:
            await storage.delete_document(coll, r["id"])

    # 5. Delete conversations
    conversations = await storage.query_documents(
        "onramp_conversations", [("user_id", "==", uid)]
    )
    for c in conversations:
        await storage.delete_document("onramp_conversations", c["id"])

    # 6. Delete quizzes and quiz results
    for coll in ("onramp_quizzes", "onramp_quiz_results"):
        records = await storage.query_documents(coll, [("user_id", "==", uid)])
        for r in records:
            await storage.delete_document(coll, r["id"])

    # 7. Delete learning paths
    paths = await storage.query_documents(
        "onramp_learning_paths", [("user_id", "==", uid)]
    )
    for p in paths:
        await storage.delete_document("onramp_learning_paths", p["id"])

    # 8. Anonymize user record and mark inactive
    anonymized = {
        "email": encrypt_field(f"deleted-{uid[:8]}@onramp.ai"),
        "name": encrypt_field("Deleted User"),
        "email_hash": email_hash(f"deleted-{uid[:8]}@onramp.ai"),
        "is_active": False,
        "updated_at": datetime.now(timezone.utc),
        "deactivated_at": datetime.now(timezone.utc),
    }
    updated = await storage.update_document(STORAGE_COLLECTION, uid, anonymized)
    return _normalize(updated)
