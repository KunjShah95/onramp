"""
Access Control Service — Module-Level RBAC for the Senior → Trainee workflow.

Stores per-member module permissions in a dedicated DynamicDocument collection,
allowing seniors to progressively unlock codebase areas for trainees based on
demonstrated competence (completed tasks).

Built-in patterns:
- Auto-grant on task completion (called from task_service.complete_task)
- Manual grant by senior/lead
- Revoke when needed
- Permission checks for middleware/guards
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from app.services.postgres_db import get_storage, generate_id

COLLECTION = "member_modules"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Module Permission CRUD ───────────────────────────────────


async def grant_module_access(
    team_id: str,
    user_id: str,
    module: str,
    granted_by: str,
    source: str = "manual",
) -> dict:
    """Grant a user access to a specific module.

    Args:
        team_id: The team context
        user_id: The user to grant access to
        module: The module name (e.g. "api-core", "frontend-auth")
        granted_by: Who granted the access (senior/lead UID)
        source: How the access was granted — "manual" or "task_completion"

    Returns:
        The created permission record

    Raises:
        ValueError: If the user already has access to this module in this team
    """
    storage = get_storage()

    # Check if already granted
    existing = await storage.query_documents(
        COLLECTION,
        [
            ("team_id", "==", team_id),
            ("user_id", "==", user_id),
            ("module", "==", module),
        ],
    )
    if existing:
        raise ValueError(f"User {user_id} already has access to module '{module}'")

    now = _utcnow()
    record = {
        "team_id": team_id,
        "user_id": user_id,
        "module": module,
        "granted_by": granted_by,
        "granted_at": now,
        "source": source,
    }

    perm_id = generate_id()
    created = await storage.create_document(COLLECTION, perm_id, record)
    return created


async def revoke_module_access(
    team_id: str,
    user_id: str,
    module: str,
) -> bool:
    """Revoke a user's access to a specific module.

    Returns:
        True if a permission was revoked, False if it didn't exist
    """
    storage = get_storage()

    existing = await storage.query_documents(
        COLLECTION,
        [
            ("team_id", "==", team_id),
            ("user_id", "==", user_id),
            ("module", "==", module),
        ],
    )

    if not existing:
        return False

    for record in existing:
        await storage.delete_document(COLLECTION, record["id"])

    return True


async def revoke_all_module_access(
    team_id: str,
    user_id: str,
) -> int:
    """Revoke ALL module access for a user in a team.

    Returns:
        Number of permissions revoked
    """
    storage = get_storage()

    existing = await storage.query_documents(
        COLLECTION,
        [
            ("team_id", "==", team_id),
            ("user_id", "==", user_id),
        ],
    )

    count = 0
    for record in existing:
        await storage.delete_document(COLLECTION, record["id"])
        count += 1

    return count


async def get_user_modules(
    team_id: str,
    user_id: str,
) -> List[dict]:
    """Get all module permissions for a user in a team.

    Returns:
        List of permission records with module, granted_by, granted_at, source
    """
    storage = get_storage()

    records = await storage.query_documents(
        COLLECTION,
        [
            ("team_id", "==", team_id),
            ("user_id", "==", user_id),
        ],
    )

    # Sort by granted_at descending
    records.sort(key=lambda r: r.get("granted_at", ""), reverse=True)
    return records


async def has_module_access(
    team_id: str,
    user_id: str,
    module: str,
) -> bool:
    """Check if a user has access to a specific module.

    Team owners have implicit access to everything.
    """
    storage = get_storage()

    # Check if user is team owner (owners have implicit access)
    members = await storage.query_documents(
        "team_members",
        [
            ("team_id", "==", team_id),
            ("user_id", "==", user_id),
        ],
    )

    for m in members:
        if m.get("role") == "owner":
            return True

    # Check module permission
    existing = await storage.query_documents(
        COLLECTION,
        [
            ("team_id", "==", team_id),
            ("user_id", "==", user_id),
            ("module", "==", module),
        ],
    )

    return len(existing) > 0


async def list_team_module_permissions(
    team_id: str,
) -> List[dict]:
    """Get all module permissions across all members of a team.

    Returns:
        List of permission records grouped with user info
    """
    storage = get_storage()

    records = await storage.query_documents(
        COLLECTION,
        [("team_id", "==", team_id)],
    )

    # Augment with user names
    user_ids = list(set(r.get("user_id", "") for r in records))
    users = await storage.query_documents(
        "users",
        [("id", "in", user_ids)],
    )
    user_map = {u.get("id", ""): u.get("name", "") for u in users}

    result = []
    for r in records:
        result.append({
            "id": r.get("id"),
            "user_id": r.get("user_id"),
            "user_name": user_map.get(r.get("user_id", ""), r.get("user_id")),
            "module": r.get("module"),
            "granted_by": r.get("granted_by"),
            "granted_at": r.get("granted_at"),
            "source": r.get("source", "manual"),
        })

    # Sort by granted_at descending
    result.sort(key=lambda r: r.get("granted_at", ""), reverse=True)
    return result


async def get_team_modules(team_id: str) -> List[str]:
    """Get the distinct set of all modules that have been granted in a team."""
    storage = get_storage()

    records = await storage.query_documents(
        COLLECTION,
        [("team_id", "==", team_id)],
    )

    modules = set()
    for r in records:
        mod = r.get("module")
        if mod:
            modules.add(mod)

    return sorted(modules)



