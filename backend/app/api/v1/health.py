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
    if not request.repo_structure and not request.index_id:
        raise HTTPException(status_code=400, detail="Provide either repo_structure or index_id")
    llm = getattr(req.app.state, "llm", None)
    scorer = HealthScorer(llm)
    try:
        result = await scorer.execute(
            repo_structure=request.repo_structure,
            index_id=request.index_id,
            mode=request.mode,
        )
        result["owner"] = owner
        result["repo"] = repo
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
