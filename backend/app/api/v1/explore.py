from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.agents import ArchitectureExplorer

router = APIRouter(prefix="/explore", tags=["architecture"])


class ExploreRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    github_token: Optional[str] = None


def _extract_github_token(request: ExploreRequest, req: Request) -> Optional[str]:
    """Extract token from request body or Authorization header."""
    if request.github_token:
        return request.github_token
    auth_header = req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        # Only use it if it looks like a GitHub token, avoiding Firebase JWTs
        if token.startswith(("ghp_", "gho_", "ghu_", "ghs_", "github_pat_")):
            return token
    return None


@router.post("/analyze")
async def analyze_repo(request: ExploreRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    github_token = _extract_github_token(request, req)
    explorer = ArchitectureExplorer(llm, github_token=github_token)
    try:
        result = await explorer.execute(repo_url=request.repo_url, branch=request.branch)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health():
    return {"status": "ok"}
