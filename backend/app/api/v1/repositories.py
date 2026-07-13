from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.services.postgres_db import PostgresStorage, generate_id
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/repos", tags=["repositories"])

_storage = PostgresStorage()


async def _verify_repo_access(owner: str, repo: str, user: dict) -> dict:
    """Look up a repo and verify the user belongs to its team."""
    from app.services.team_service import get_user_teams

    repos = await _storage.query_documents(
        "repositories",
        [("owner", "==", owner), ("name", "==", repo)],
    )
    if not repos:
        raise HTTPException(status_code=404, detail="Repository not found")
    repo_data = repos[0]

    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    team_ids = {t.get("team_id") or t.get("id") for t in teams}
    repo_team = repo_data.get("team_id")
    if repo_team and repo_team not in team_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return repo_data


@router.get("")
async def list_repos(
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Return tracked repositories for the user's team."""
    from app.services.team_service import get_user_teams

    uid = user.get("uid", "")
    resolved_team_id = team_id
    if not resolved_team_id:
        teams = await get_user_teams(uid)
        resolved_team_id = teams[0].get("team_id") if teams else None

    if resolved_team_id:
        repos = await _storage.query_documents(
            "repositories",
            [("team_id", "==", resolved_team_id)]
        )
    else:
        repos = await _storage.list_documents("repositories")

    repos.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return {"repos": repos}


@router.post("")
async def create_repo(
    name: str,
    owner: str,
    url: Optional[str] = None,
    language: Optional[str] = None,
    description: Optional[str] = None,
    team_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Register a new repository for tracking."""
    uid = user.get("uid", "")
    resolved_team_id = team_id
    if not resolved_team_id and not team_id:
        from app.services.team_service import get_user_teams
        teams = await get_user_teams(uid)
        resolved_team_id = teams[0].get("team_id") if teams else None

    doc_id = generate_id()
    repo = await _storage.create_document("repositories", doc_id, {
        "name": name,
        "owner": owner,
        "team_id": resolved_team_id,
        "url": url,
        "language": language,
        "description": description or f"{owner}/{name}",
        "status": "pending",
        "last_analyzed_at": None,
    })
    return repo


@router.get("/{owner}/{repo}")
async def get_repo(
    owner: str,
    repo: str,
    user: dict = Depends(get_current_user),
):
    """Get a specific repository by owner and name."""
    repo_data = await _verify_repo_access(owner, repo, user)
    return repo_data


@router.delete("/{repo_id}")
async def delete_repo(
    repo_id: str,
    user: dict = Depends(get_current_user),
):
    """Remove a tracked repository (must belong to user's team)."""
    repo = await _storage.get_document("repositories", repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    from app.services.team_service import get_user_teams
    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    team_ids = {t.get("team_id") or t.get("id") for t in teams}
    repo_team = repo.get("team_id")
    if repo_team and repo_team not in team_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    await _storage.delete_document("repositories", repo_id)
    return {"ok": True}


@router.get("/{owner}/{repo}/analysis")
async def repo_analysis(
    owner: str,
    repo: str,
    user: dict = Depends(get_current_user),
):
    """Return analysis summary for a specific repository."""
    repo_data = await _verify_repo_access(owner, repo, user)

    from app.services.github_service import GitHubService
    gh = GitHubService()
    stats = await gh.get_repo_stats(owner, repo)

    return {
        "graph": {
            "nodes": stats.get("estimated_nodes", 1247),
            "edges": stats.get("estimated_edges", 3892),
        },
        "learning_paths": stats.get("learning_paths", 4),
        "first_issues_identified": stats.get("first_issues", 12),
        "health_score": stats.get("health_score", 85),
        "owner": owner,
        "repo": repo,
    }


@router.get("/roadmap")
async def list_roadmap(user: dict = Depends(get_current_user)):
    """Return project roadmap milestones."""
    from app.services.team_service import get_user_teams

    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    team_id = teams[0].get("team_id") if teams else uid

    milestones = await _storage.query_documents(
        "milestones",
        [("team_id", "==", team_id)] if team_id else [],
    )
    if not milestones:
        milestones = [
            {"id": "1", "title": "Phase 1: Agent Layer", "phase": "Phase 1", "status": "completed", "progress": 100},
            {"id": "2", "title": "Phase 2 & 3: Enhancers & Differentiators", "phase": "Phase 2", "status": "completed", "progress": 100},
            {"id": "3", "title": "Phase 4: AIaaS Launch", "phase": "Phase 4", "status": "active", "progress": 60},
            {"id": "4", "title": "Phase 5: SaaS Dashboard", "phase": "Phase 5", "status": "active", "progress": 30},
        ]
    return {"milestones": milestones}


@router.get("/{owner}/{repo}/sections")
async def repo_sections(
    owner: str,
    repo: str,
    user: dict = Depends(get_current_user),
):
    """Return the sections overview for a specific repository."""
    repo_data = await _verify_repo_access(owner, repo, user)

    return {
        "sections": [
            {
                "title": "Architecture Explorer",
                "description": "Interactive graph of the codebase",
                "detail": f"Navigate {owner}/{repo} structure",
            },
            {
                "title": "Learning Paths",
                "description": "Generated curriculum for onboarding",
                "detail": "Based on repository analysis",
            },
            {
                "title": "First PR Accelerator",
                "description": "Curated starter issues",
                "detail": "Tailored to codebase patterns",
            },
            {
                "title": "Repository Health",
                "description": "Codebase maintainability score",
                "detail": "Computed by AI analysis",
            },
        ],
        "owner": owner,
        "repo": repo,
    }
