from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.agents import HealthScorer
from app.api.v1.auth import get_current_user
from app.api.v1.index_access import authorize_registered_repo, authorize_repo_index
from app.services.agent_session_helper import get_session, complete_session, fail_session

router = APIRouter(prefix="/repos", tags=["health"])


class HealthRequest(BaseModel):
    owner: str
    repo: str
    repo_structure: dict | None = None
    index_id: str | None = None  # reuse a cached repo-context index (parse-once)
    mode: str = "normal"


@router.post("/{owner}/{repo}/health")
async def get_health(
    owner: str,
    repo: str,
    request: HealthRequest,
    req: Request,
    user: dict = Depends(get_current_user),
):
    index_id = request.index_id
    repo_structure = request.repo_structure
    if not repo_structure and not index_id:
        # Callers that only know owner/repo (e.g. the frontend health pages)
        # reuse the parse-once repo-context index: derive its stable id from
        # the tracked repository's URL.
        from app.services.postgres_db import get_storage
        from app.services.repo_context import index_id_for

        repos = await get_storage().query_documents(
            "repositories", [("owner", "==", owner), ("name", "==", repo)]
        )
        if repos and repos[0].get("url"):
            repo_url = repos[0]["url"]
            index_id = index_id_for(repo_url)
            # Registered but never indexed (Explore not run yet): check the
            # caller's team owns the registration, then build the index now
            # instead of failing with "Index not found".
            from app.services.repo_context import RepoContextService

            service = RepoContextService()
            if not await service.get(index_id):
                await authorize_registered_repo(user, repo_url)
                try:
                    await service.build(repo_url)
                except Exception as e:
                    raise HTTPException(status_code=502, detail="Could not index repository") from e
    if not repo_structure and not index_id:
        raise HTTPException(
            status_code=400,
            detail="Repository is not registered for your team — add it in Explore first (or provide repo_structure/index_id)",
        )
    team_id = await authorize_repo_index(user, index_id) if index_id else None
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session(
        "health_scorer",
        user_id=user.get("uid"),
        team_id=team_id,
        index_id=index_id,
        scratchpad={"owner": owner, "repo": repo, "mode": request.mode},
    )
    scorer = HealthScorer(llm, session_id=sid) if sid else HealthScorer(llm)
    try:
        result = await scorer.execute(
            repo_structure=repo_structure,
            index_id=index_id,
            mode=request.mode,
        )
        result["owner"] = owner
        result["repo"] = repo
        if sid:
            result["session_id"] = sid
        await complete_session(sid, "health_scorer", success=True, payload={"owner": owner, "repo": repo, "score": result.get("score")})
        return result
    except Exception as e:
        await fail_session(sid, "health_scorer")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{owner}/{repo}/work-graph")
async def get_work_graph(
    owner: str,
    repo: str,
    user: dict = Depends(get_current_user),
):
    """Return the stored architecture ↔ developer work graph for a repo.

    Generated offline by ``scripts/generate_work_graph.py --store``.
    """
    from app.services.postgres_db import get_storage

    await authorize_registered_repo(user, f"https://github.com/{owner}/{repo}")
    doc = await get_storage().get_document("repo_work_graphs", f"{owner}/{repo}")
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="No work graph stored for this repository yet. Run scripts/generate_work_graph.py --store.",
        )
    return doc
