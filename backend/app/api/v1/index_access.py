"""Shared repository-index authorization for API routers."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from app.services.repo_context import RepoContextService
from app.services.repo_index_access import (
    find_registered_repository,
    grant_index_access,
    list_index_grants,
)


async def _team_ids(user: dict) -> set[str]:
    uid = user.get("uid", "")
    if not uid or uid.startswith("api:"):
        return {str(user["team_id"])} if user.get("team_id") else set()
    try:
        from app.services.team_service import get_user_teams
        teams = await get_user_teams(uid)
    except Exception:
        return set()
    return {
        str(team.get("id") or team.get("team_id"))
        for team in (teams or [])
        if team.get("id") or team.get("team_id")
    }


async def authorize_registered_repository(
    user: dict,
    repo_url: str,
    requested_team_id: Optional[str] = None,
) -> str:
    """Require a registered, team-owned repository for direct analysis."""
    from app.services.repo_index_access import parse_github_repo

    if not parse_github_repo(repo_url):
        raise HTTPException(status_code=400, detail="Only strict GitHub HTTPS repository URLs are supported")
    repository = await find_registered_repository(repo_url)
    if not repository:
        raise HTTPException(status_code=404, detail="Repository is not registered for this workspace")
    team_id = str(repository.get("team_id")) if repository.get("team_id") else None
    if not team_id:
        raise HTTPException(status_code=403, detail="Repository is not assigned to a team")
    accessible = await _team_ids(user)
    if team_id not in accessible:
        raise HTTPException(status_code=403, detail="Repository belongs to another team")
    if requested_team_id and str(requested_team_id) != team_id:
        raise HTTPException(status_code=403, detail="Repository belongs to another team")
    return team_id


async def authorize_repo_index(
    user: dict,
    index_id: str,
    requested_team_id: Optional[str] = None,
    service: Optional[RepoContextService] = None,
) -> str:
    """Authorize an index and return its workspace/team scope.

    Index grants are checked first.  A compatibility fallback can authorize a
    legacy index only when the repository registry proves that the caller
    belongs to the owning team.
    """
    accessible = await _team_ids(user)
    if requested_team_id and str(requested_team_id) not in accessible:
        raise HTTPException(status_code=403, detail="Not a member of this team")

    grants = await list_index_grants(index_id)
    if grants:
        allowed = {
            str(grant.get("team_id"))
            for grant in grants
            if grant.get("team_id") and str(grant.get("team_id")) in accessible
        }
        if requested_team_id and str(requested_team_id) not in allowed:
            raise HTTPException(status_code=403, detail="Index belongs to another team")
        if allowed:
            return str(requested_team_id) if requested_team_id else sorted(allowed)[0]
        raise HTTPException(status_code=403, detail="Index belongs to another team")

    service = service or RepoContextService()
    doc = await service.get(index_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Index not found")
    repository = await find_registered_repository(doc.get("repo_url", ""))
    team_id = str(repository.get("team_id")) if repository and repository.get("team_id") else None
    if not team_id or team_id not in accessible:
        raise HTTPException(status_code=403, detail="Index belongs to another team")
    if requested_team_id and str(requested_team_id) != team_id:
        raise HTTPException(status_code=403, detail="Index belongs to another team")
    await grant_index_access(index_id, team_id, doc.get("repo_url", ""), doc.get("branch", "main"))
    return team_id
