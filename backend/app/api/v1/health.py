from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import HealthScorer
from app.services.agent_session_helper import get_session, complete_session, fail_session

router = APIRouter(prefix="/repos", tags=["health"])


class HealthRequest(BaseModel):
    owner: str
    repo: str
    repo_structure: dict | None = None
    index_id: str | None = None  # reuse a cached repo-context index (parse-once)
    mode: str = "normal"


@router.post("/{owner}/{repo}/health")
async def get_health(owner: str, repo: str, request: HealthRequest, req: Request):
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
            index_id = index_id_for(repos[0]["url"])
    if not repo_structure and not index_id:
        raise HTTPException(status_code=400, detail="Provide either repo_structure or index_id")
    llm = getattr(req.app.state, "llm", None)
    sid = await get_session("health_scorer", index_id=index_id, scratchpad={"owner": owner, "repo": repo, "mode": request.mode})
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
