from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.services.postgres_db import get_storage, generate_id
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/repos", tags=["repositories"])


_storage = get_storage()  # shared storage singleton (respects STORAGE_BACKEND=memory)


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

    if not stats.get("available"):
        # Honest unavailable state — no fabricated graph or scores.
        return {
            "available": False,
            "owner": owner,
            "repo": repo,
            "graph": {"nodes": 0, "edges": 0},
            "learning_paths": 0,
            "first_issues_identified": 0,
            "health_score": None,
            "message": "Repository not found on GitHub or not yet analyzed.",
        }

    # Real count of beginner-friendly open issues.
    repo_url = f"https://github.com/{owner}/{repo}"
    try:
        first_issues = await gh.get_issues(
            repo_url, labels=["good first issue"], limit=30
        )
    except Exception:
        first_issues = []

    return {
        "available": True,
        "owner": owner,
        "repo": repo,
        "language": stats.get("language"),
        "stars": stats.get("stars", 0),
        "forks": stats.get("forks", 0),
        "open_issues": stats.get("open_issues", 0),
        "topics": stats.get("topics", []),
        "health_score": stats.get("health_score"),
        "health_factors": stats.get("health_factors", []),
        "first_issues_identified": len(first_issues),
        # Code-graph analysis requires cloning + parsing the repo, which is a
        # separate pipeline; 0 here means "not yet computed", not fabricated.
        "graph": {"nodes": 0, "edges": 0},
        "learning_paths": len(stats.get("topics", [])),
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
    # Real milestones only — empty list when none exist, no fabricated roadmap.
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
