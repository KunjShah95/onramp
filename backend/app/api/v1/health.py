from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import HealthScorer

router = APIRouter(prefix="/repos", tags=["health"])


class HealthRequest(BaseModel):
    owner: str
    repo: str
    repo_structure: dict
    mode: str = "normal"


@router.post("/{owner}/{repo}/health")
async def get_health(owner: str, repo: str, request: HealthRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    scorer = HealthScorer(llm)
    try:
        result = await scorer.score(request.repo_structure)
        result["owner"] = owner
        result["repo"] = repo
        if request.mode == "roast" and llm:
            result = await scorer._add_roast(result, request.repo_structure)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
