"""Account Service — handles account provisioning by admins/seniors/HR."""
import uuid
import secrets
import bcrypt
from datetime import datetime, timezone
from app.services.postgres_db import get_storage
from app.services.field_encryption import encrypt_field, email_hash


async def create_provisioned_user(
    name: str,
    email: str,
    role: str = "new_dev",
    team_id: str | None = None,
) -> dict:
    """Create a provisioned user account with a temp password.

    Returns the user record with the temporary password (shown once).
    """
    storage = get_storage()
    uid = str(uuid.uuid4())
    temp_password = secrets.token_urlsafe(12)
    password_hash = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()

    now = datetime.now(timezone.utc)
    record = {
        "email": encrypt_field(email),
        "name": encrypt_field(name),
        "email_hash": email_hash(email),
        "provider": "password",
        "password_hash": password_hash,
        "is_active": True,
        "email_verified": True,
        "password_reset_required": True,
        "created_at": now,
        "updated_at": now,
    }

    await storage.create_document("users", uid, record)

    result = {
        "uid": uid,
        "email": email,
        "name": name,
        "role": role,
        "temp_password": temp_password,
        "password_reset_required": True,
    }

    if team_id:
        from app.services.team_service import add_member
        await add_member(team_id, uid, role=role)
        result["team_id"] = team_id

    from app.services.audit_service import log_event
    await log_event(
        "account_created",
        actor_id="system",
        target_id=uid,
        metadata={"resource_type": "user", "email": email, "role": role, "team_id": team_id, "mode": "provisioned"},
    )

    return result


async def check_email_exists(email: str) -> bool:
    """Check if an email is already registered."""
    storage = get_storage()
    results = await storage.query_documents(
        "users", [("email_hash", "==", email_hash(email))]
    )
    return len(results) > 0
