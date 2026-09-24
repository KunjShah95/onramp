"""Tenant ownership records for repository context indexes.

The cache itself is intentionally ephemeral, but access grants must be durable.
This module stores a small, metadata-only grant for each ``(team_id,
index_id)`` pair.  It does not store source code or embeddings.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

from app.services.postgres_db import get_storage

COLLECTION = "onramp_repo_index_access"
JOB_COLLECTION = "onramp_index_jobs"


def normalize_repo_url(repo_url: str) -> str:
    """Normalize a repository URL for registry/access comparisons."""
    return (repo_url or "").strip().rstrip("/").lower()


def parse_github_repo(repo_url: str) -> Optional[tuple[str, str]]:
    """Return ``(owner, repo)`` for a strict GitHub HTTPS URL."""
    try:
        parsed = urlparse((repo_url or "").strip())
    except ValueError:
        return None
    if parsed.scheme.lower() != "https" or parsed.netloc.lower() != "github.com":
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 2 or any(part in {".", ".."} for part in parts):
        return None
    if parsed.query or parsed.fragment:
        return None
    owner, repo = parts[0], parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not owner or not repo or ".." in owner or ".." in repo:
        return None
    return owner, repo


async def find_registered_repository(repo_url: str) -> Optional[dict[str, Any]]:
    """Find the workspace's repository registration for a GitHub URL."""
    normalized = normalize_repo_url(repo_url)
    parsed = parse_github_repo(repo_url)
    rows = await get_storage().list_documents("repositories") or []
    for row in rows:
        stored_url = normalize_repo_url(row.get("url") or "")
        if stored_url and stored_url == normalized:
            return row
        if parsed:
            owner = (row.get("owner") or "").strip().lower()
            name = (row.get("name") or "").strip().lower()
            if name.endswith(".git"):
                name = name[:-4]
            if owner == parsed[0].lower() and name == parsed[1].lower():
                return row
    return None


def access_record_id(index_id: str, team_id: str) -> str:
    raw = f"{team_id}:{index_id}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:40]


async def grant_index_access(
    index_id: str,
    team_id: Optional[str],
    repo_url: str,
    branch: str = "main",
) -> Optional[dict[str, Any]]:
    """Create or refresh a team grant for an index.

    Unscoped/background builds may pass ``team_id=None`` and intentionally do
    not create a grant.  User-facing callers should always provide a verified
    team ID.
    """
    if not index_id or not team_id:
        return None

    storage = get_storage()
    record_id = access_record_id(index_id, str(team_id))
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "index_id": index_id,
        "team_id": str(team_id),
        "repo_url": normalize_repo_url(repo_url),
        "branch": branch or "main",
        "updated_at": now,
    }
    existing = await storage.get_document(COLLECTION, record_id)
    if existing:
        return await storage.update_document(COLLECTION, record_id, data)
    return await storage.create_document(COLLECTION, record_id, data)


async def record_index_job(
    task_id: str,
    requested_by: str,
    team_id: Optional[str],
    index_id: str,
    repo_url: str,
) -> dict[str, Any] | None:
    """Persist the tenant/user binding for an async index job."""
    if not task_id or not requested_by:
        return None
    record = {
        "task_id": str(task_id),
        "requested_by": str(requested_by),
        "team_id": str(team_id) if team_id else None,
        "index_id": index_id,
        "repo_url": normalize_repo_url(repo_url),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    storage = get_storage()
    existing = await storage.get_document(JOB_COLLECTION, str(task_id))
    if existing:
        return await storage.update_document(JOB_COLLECTION, str(task_id), record)
    return await storage.create_document(JOB_COLLECTION, str(task_id), record)


async def get_index_job(task_id: str) -> Optional[dict[str, Any]]:
    if not task_id:
        return None
    return await get_storage().get_document(JOB_COLLECTION, str(task_id))


async def list_index_grants(index_id: str) -> list[dict[str, Any]]:
    """Return grants for an index; used only by authorization code."""
    if not index_id:
        return []
    return await get_storage().query_documents(COLLECTION, [("index_id", "==", index_id)])


async def has_index_access(index_id: str, team_id: Optional[str]) -> bool:
    """Check an exact index/team grant without accepting a global match."""
    if not index_id or not team_id:
        return False
    record_id = access_record_id(index_id, str(team_id))
    record = await get_storage().get_document(COLLECTION, record_id)
    return bool(record and record.get("index_id") == index_id)


async def find_grant(index_id: str, team_id: Optional[str]) -> Optional[dict[str, Any]]:
    """Return the exact grant for an index/team pair, if present."""
    if not index_id or not team_id:
        return None
    record_id = access_record_id(index_id, str(team_id))
    record = await get_storage().get_document(COLLECTION, record_id)
    if record and record.get("index_id") == index_id:
        return record
    return None


async def revoke_index_access(index_id: str, team_id: Optional[str] = None) -> int:
    """Revoke one team's grant, or all grants when no team is supplied."""
    if not index_id:
        return 0
    storage = get_storage()
    if team_id:
        await storage.delete_document(COLLECTION, access_record_id(index_id, str(team_id)))
        return 1
    records = await list_index_grants(index_id)
    for record in records:
        await storage.delete_document(COLLECTION, record["id"])
    return len(records)
