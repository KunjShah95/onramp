from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from app.agents import ArchitectureExplorer
from app.services.quota import enforce_quota
from app.api.v1.llm_route import attach_served_route_header
from app.services.agent_session_helper import get_session, complete_session, fail_session

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
    sid = await get_session("architecture_explorer", index_id=request.index_id, scratchpad={"repo_url": request.repo_url, "branch": request.branch})
    explorer = ArchitectureExplorer(llm, github_token=github_token, session_id=sid) if sid else ArchitectureExplorer(llm, github_token=github_token)
    before_route = getattr(llm, "last_route", None)
    try:
        result = await explorer.execute(
            repo_url=request.repo_url,
            branch=request.branch,
            index_id=request.index_id,
        )
        attach_served_route_header(llm, before_route, response)
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "architecture_explorer", success=True, payload={"repo_url": request.repo_url, "index_id": request.index_id})
        return result
    except Exception as e:
        await fail_session(sid, "architecture_explorer")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health():
    return {"status": "ok"}
