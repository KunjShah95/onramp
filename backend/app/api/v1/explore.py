from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import ArchitectureExplorer

router = APIRouter(prefix="/explore", tags=["architecture"])


class ExploreRequest(BaseModel):
    repo_url: str
    branch: str = "main"


@router.post("/analyze")
async def analyze_repo(request: ExploreRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    explorer = ArchitectureExplorer(llm)
    try:
        result = await explorer.execute(repo_url=request.repo_url, branch=request.branch)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health():
    return {"status": "ok"}
