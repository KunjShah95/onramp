from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import HealthScorer

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
    scorer = HealthScorer(llm)
    try:
        result = await scorer.execute(
            repo_structure=repo_structure,
            index_id=index_id,
            mode=request.mode,
        )
        result["owner"] = owner
        result["repo"] = repo
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
