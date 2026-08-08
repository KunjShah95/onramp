from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from app.agents import ArchitectureExplorer
from app.services.quota import enforce_quota
from app.api.v1.llm_route import attach_served_route_header

router = APIRouter(prefix="/explore", tags=["architecture"])


class ExploreRequest(BaseModel):
    repo_url: str
    branch: str = "main"
    github_token: Optional[str] = None
    index_id: Optional[str] = None  # reuse a cached repo-context index (parse-once)


def _extract_github_token(request: ExploreRequest, req: Request) -> Optional[str]:
    """Extract token from request body or Authorization header."""
    if request.github_token:
        return request.github_token
    auth_header = req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        # Only use it if it looks like a GitHub token (not an auth JWT)
        if token.startswith(("ghp_", "gho_", "ghu_", "ghs_", "github_pat_")):
            return token
    return None


@router.post("/analyze")
async def analyze_repo(request: ExploreRequest, req: Request, response: Response, _q=enforce_quota("explore")):
    llm = getattr(req.app.state, "llm", None)
    github_token = _extract_github_token(request, req)
    explorer = ArchitectureExplorer(llm, github_token=github_token)
    before_route = getattr(llm, "last_route", None)
    try:
        result = await explorer.execute(
            repo_url=request.repo_url,
            branch=request.branch,
            index_id=request.index_id,
        )
        # Debug header showing which provider/model produced the analysis.
        attach_served_route_header(llm, before_route, response)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health():
    return {"status": "ok"}
