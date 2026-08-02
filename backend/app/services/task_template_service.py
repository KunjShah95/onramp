"""
Task Template Service — reusable task blueprints per module.

Seniors create a template once (title, description, module, repo, unlock
modules, estimate) and later instantiate it for a trainee in one click via
``instantiate_template`` or ``bulk_assign_from_templates`` (assign a whole
onboarding plan of templates to a new dev).

Backed by the ``task_templates`` collection (Postgres table task_templates).
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.task_templates")

COLLECTION = "task_templates"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def create_template(
    team_id: str,
    created_by: str,
    name: str,
    description: str = "",
    module: str = "",
    priority: str = "medium",
    repo_url: str = "",
    unlock_modules: Optional[List[str]] = None,
    estimated_hours: Optional[float] = None,
) -> dict:
    """Create a reusable task template."""
    storage = get_storage()
    now = _utcnow()
    template_id = generate_id()
    template = {
        "template_id": template_id,
        "team_id": team_id,
        "created_by": created_by,
        "name": name,
        "description": description,
        "module": module,
        "priority": priority,
        "repo_url": repo_url,
        "unlock_modules": unlock_modules or [],
        "estimated_hours": estimated_hours,
        "created_at": now,
        "updated_at": now,
    }
    await storage.create_document(COLLECTION, template_id, template)
    return template


async def get_template(template_id: str) -> Optional[dict]:
    storage = get_storage()
    return await storage.get_document(COLLECTION, template_id)


async def list_templates(team_id: Optional[str] = None, module: Optional[str] = None) -> List[dict]:
    """List templates, optionally filtered by team and/or module."""
    storage = get_storage()
    filters = []
    if team_id:
        filters.append(("team_id", "==", team_id))
    templates = await storage.query_documents(COLLECTION, filters)
    if module:
        templates = [t for t in templates if t.get("module", "") == module]
    templates.sort(key=lambda t: t.get("created_at", ""), reverse=True)
    return templates


async def update_template(template_id: str, updates: dict) -> Optional[dict]:
    storage = get_storage()
    updates["updated_at"] = _utcnow()
    return await storage.update_document(COLLECTION, template_id, updates)


async def delete_template(template_id: str) -> bool:
    storage = get_storage()
    existing = await storage.get_document(COLLECTION, template_id)
    if not existing:
        return False
    await storage.delete_document(COLLECTION, template_id)
    return True


async def instantiate_template(
    template: dict,
    team_id: str,
    assignee_id: str,
    created_by: str,
) -> dict:
    """Create a real task from a template for a trainee.

    Deferred import of create_task keeps this module free of heavy service
    dependencies at import time.
    """
    from app.services.task_service import create_task

    task = await create_task(
        team_id=team_id,
        created_by=created_by,
        title=template.get("name", "Untitled task"),
        description=template.get("description") or "",
        module=template.get("module", "") or "",
        priority=template.get("priority", "medium"),
        repo_url=template.get("repo_url", "") or "",
        unlock_modules=template.get("unlock_modules", []) or [],
        estimated_hours=template.get("estimated_hours"),
        assigned_to=assignee_id,
    )
    return task


async def bulk_assign_templates(
    team_id: str,
    assignee_id: str,
    template_ids: List[str],
    created_by: str,
) -> dict:
    """Instantiate a full set of templates for one trainee in a single call.

    Returns the created tasks plus a summary. Fails soft on unknown template
    ids so a stale plan doesn't block the whole assignment.
    """
    storage = get_storage()
    created: List[dict] = []
    missing: List[str] = []

    for tid in template_ids:
        template = await storage.get_document(COLLECTION, tid)
        if not template:
            missing.append(tid)
            continue
        try:
            task = await instantiate_template(template, team_id, assignee_id, created_by)
            created.append(task)
        except Exception:
            logger.exception("Failed to instantiate template %s", tid)
            missing.append(tid)

    return {
        "created_count": len(created),
        "missing_count": len(missing),
        "missing_template_ids": missing,
        "tasks": created,
    }
