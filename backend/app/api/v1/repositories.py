import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional, List
from pydantic import BaseModel
from app.services.postgres_db import get_storage, generate_id
from app.api.v1.auth import get_current_user
from app.services.quota import enforce_quota
from app.llm import LLMRouter
from app.services.issue_orchestrator import IssueOrchestrator
from app.services.architecture_store import architecture_store

router = APIRouter(prefix="/repos", tags=["repositories"])
logger = logging.getLogger(__name__)

class ResolveIssueRequest(BaseModel):
    repo_url: str
    issue_description: str
    branch: Optional[str] = "main"

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
    if repo_team:
        if str(repo_team) not in {str(tid) for tid in team_ids}:
            raise HTTPException(status_code=403, detail="Access denied")
    elif not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Repository is not assigned to a team")
    return repo_data


@router.get("")
async def list_repos(
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Return tracked repositories for the user's team."""
    from app.services.team_service import get_user_teams

    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    user_team_ids = {str(t.get("team_id") or t.get("id")) for t in teams}

    if team_id:
        if str(team_id) not in user_team_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        query_team_ids = {str(team_id)}
    else:
        query_team_ids = user_team_ids

    if not query_team_ids:
        return {"repos": []}

    repos = []
    for tid in query_team_ids:
        team_repos = await _storage.query_documents(
            "repositories", [("team_id", "==", tid)]
        )
        repos.extend(team_repos)

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
    """Register a new repository for tracking.

    Returns 409 if an identical (owner, name) is already tracked — the DB
    unique constraint (uq_repositories_owner_name) would otherwise surface
    as a 500 on re-allocation.
    """
    if url:
        from app.services.repo_index_access import parse_github_repo
        if not parse_github_repo(url):
            raise HTTPException(status_code=400, detail="Only strict GitHub HTTPS repository URLs are supported")
    if not owner.strip() or not name.strip() or any(part in {".", ".."} for part in (owner, name)):
        raise HTTPException(status_code=400, detail="Invalid repository owner or name")

    existing = await _storage.query_documents(
        "repositories",
        [("owner", "==", owner), ("name", "==", name)],
    )
    if existing:
        raise HTTPException(status_code=409, detail="Repository already tracked")

    uid = user.get("uid", "")
    from app.services.team_service import get_user_teams
    teams = await get_user_teams(uid)
    team_ids = {t.get("team_id") or t.get("id") for t in (teams or [])}
    resolved_team_id = team_id or (next(iter(team_ids), None) if team_ids else None)
    if not resolved_team_id:
        raise HTTPException(status_code=403, detail="A team membership is required")
    if str(resolved_team_id) not in {str(tid) for tid in team_ids}:
        raise HTTPException(status_code=403, detail="Not a member of this team")

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


@router.delete("/{repo_id}",
    responses={404: {"description": "Repository not found"}})
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
    if repo_team and str(repo_team) not in {str(tid) for tid in team_ids}:
        raise HTTPException(status_code=403, detail="Access denied")
    await _storage.delete_document("repositories", repo_id)
    try:
        from app.services.embeddings_service import EmbeddingsService
        from app.services.repo_context import RepoContextService, index_id_for
        from app.services.repo_index_access import revoke_index_access
        repo_url = (repo.get("url") or f"https://github.com/{repo.get('owner', '')}/{repo.get('name', '')}").strip()
        index_id = index_id_for(repo_url, repo.get("branch") or "main")
        # Delete derived vectors/documents as well as the access grant. This
        # makes repository removal an actual retention boundary rather than
        # merely hiding the registry row.
        await EmbeddingsService().delete_index(index_id)
        await RepoContextService().evict(index_id)
        await revoke_index_access(index_id)
    except Exception:
        logger.exception("Failed to revoke index grants for repository %s", repo_id)
    return {"ok": True}


@router.get("/{owner}/{repo}/analysis")
async def repo_analysis(
    owner: str,
    repo: str,
    user: dict = Depends(get_current_user),
):
    """Return analysis summary for a specific repository."""
    repo_data = await _verify_repo_access(owner, repo, user)

    from app.services.github_service import GitHubService, detect_provider
    gh = GitHubService()

    # Use the stored URL when available (otherwise falls back to github.com)
    repo_url = repo_data.get("url", "") or f"https://github.com/{owner}/{repo}"

    # Durable architecture snapshot (if one was ever built) backs the graph
    # counts below — real numbers instead of the old hardcoded 0/0 stub.
    snapshot = await architecture_store.latest(repo_url=repo_url)
    if snapshot is None:
        snapshot = await architecture_store.latest(owner=owner, name=repo)
    graph_counts = _graph_counts(snapshot)

    provider = detect_provider(repo_url)
    
    if provider == 'gitlab':
        from app.services.gitlab_service import GitLabService
        gl = GitLabService()
        stats = await gl.get_repo_stats(owner, repo)
    elif provider == 'bitbucket':
        from app.services.bitbucket_service import BitbucketService
        bb = BitbucketService()
        stats = await bb.get_repo_stats(owner, repo)
    else:
        stats = await gh.get_repo_stats(owner, repo)

    if not stats.get("available"):
        # Honest unavailable state — no fabricated graph or scores. A stored
        # snapshot (if any) still reports its real counts.
        return {
            "available": False,
            "owner": owner,
            "repo": repo,
            "graph": graph_counts,
            "architecture_pattern": (snapshot or {}).get("architecture_pattern"),
            "last_analyzed_at": (snapshot or {}).get("built_at"),
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
        # From the durable architecture snapshot; 0/0 means "not built yet",
        # not fabricated. Build it via POST /repos/{owner}/{repo}/graph/rebuild.
        "graph": graph_counts,
        "architecture_pattern": (snapshot or {}).get("architecture_pattern"),
        "last_analyzed_at": (snapshot or {}).get("built_at"),
        "learning_paths": len(stats.get("topics", [])),
    }


def _repo_url_from_row(repo_data: dict, owner: str, repo: str) -> str:
    """Stored clone/html URL, or a synthesized GitHub URL fallback."""
    return (repo_data.get("url") or "").strip() or f"https://github.com/{owner}/{repo}"


def _graph_counts(snapshot: dict | None) -> dict:
    """Node/edge counts for a persisted snapshot (0 when absent)."""
    if not snapshot:
        return {"nodes": 0, "edges": 0}
    services = snapshot.get("services") or []
    deps = snapshot.get("dependencies") or {}
    edges = 0
    for targets in deps.values():
        edges += len(targets or [])
    return {"nodes": len(services), "edges": edges}


@router.get("/{owner}/{repo}/graph")
async def repo_graph(
    owner: str,
    repo: str,
    branch: str = Query("main"),
    include_history: bool = Query(False),
    history_limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Return the persisted architecture snapshot for a tracked repository.

    Durable (Postgres ``repo_analyses``) — survives reloads, Redis restarts
    and TTL expiry. ``stale`` is True when the cached index is pinned to a
    newer commit than the snapshot, False when they match, and null when
    there is no cache to compare against.
    """
    repo_data = await _verify_repo_access(owner, repo, user)
    repo_url = _repo_url_from_row(repo_data, owner, repo)

    snapshot = await architecture_store.latest(repo_url=repo_url, branch=branch)
    if snapshot is None:
        # Snapshots may have been saved under a different URL form (clone vs
        # html URL) — fall back to the owner/name pair.
        snapshot = await architecture_store.latest(owner=owner, name=repo, branch=branch)

    index_id = snapshot.get("index_id") if snapshot else None
    building = await architecture_store.is_building(index_id)

    stale = None
    try:
        from app.services.repo_context import RepoContextService, index_id_for

        idx = await RepoContextService().get(index_id or index_id_for(repo_url, branch))
        if idx is not None:
            stale = (idx.get("commit") or "") != ((snapshot or {}).get("commit") or "")
    except Exception:
        stale = None

    payload = {
        "snapshot": snapshot,
        "repo_url": repo_url,
        "branch": branch,
        "stale": stale,
        "building": building,
    }
    if include_history:
        payload["history"] = await architecture_store.history(
            repo_url=repo_url, branch=branch, limit=history_limit
        )
    return payload


@router.post("/{owner}/{repo}/graph/rebuild")
async def rebuild_repo_graph(
    owner: str,
    repo: str,
    branch: str = Query("main"),
    user: dict = Depends(get_current_user),
    _q=enforce_quota("explore"),
):
    """Force-rebuild the repo index and persist a fresh architecture snapshot.

    Clones + parses once, then reuses the cached index to write the snapshot —
    so the graph is durable and pinned to the new HEAD commit.
    """
    repo_data = await _verify_repo_access(owner, repo, user)
    repo_url = _repo_url_from_row(repo_data, owner, repo)

    from app.services.repo_context import RepoContextService, index_id_for

    index_id = index_id_for(repo_url, branch)
    await architecture_store.mark_building(index_id)
    try:
        index_doc = await RepoContextService().build(repo_url, branch=branch, force=True)
        snapshot = await architecture_store.save_from_index(
            index_doc,
            source="manual",
            team_id=repo_data.get("team_id"),
            repo_id=repo_data.get("id"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Rebuild failed: {exc}")
    finally:
        await architecture_store.clear_building(index_id)

    return {
        "snapshot": snapshot,
        "repo_url": repo_url,
        "branch": branch,
        "stale": False,
        "building": False,
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


@router.post("/{owner}/{repo}/resolve-issue")
async def resolve_repo_issue(
    owner: str,
    repo: str,
    request: ResolveIssueRequest,
    req: Request,
    user: dict = Depends(get_current_user),
):
    """Trigger an autonomous loop to analyze and resolve a specific codebase issue."""
    repo_data = await _verify_repo_access(owner, repo, user)

    # Use the app's shared router instance (app.state.llm) — never a one-off import.
    llm = getattr(req.app.state, "llm", None) or LLMRouter()
    orchestrator = IssueOrchestrator(llm_client=llm)

    result = await orchestrator.resolve_issue(
        repo_url=request.repo_url,
        issue_description=request.issue_description,
        branch=request.branch
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return result

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
