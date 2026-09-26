import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, HttpUrl
from app.agents import ArchitectureExplorer
from app.services.quota import enforce_quota
from app.api.v1.llm_route import attach_served_route_header
from app.api.v1.auth import get_current_user
from app.api.v1.index_access import authorize_registered_repository, authorize_repo_index
from app.services.agent_session_helper import get_session, complete_session, fail_session

logger = logging.getLogger("onramp.explore")

router = APIRouter(prefix="/explore", tags=["architecture"])


class ExploreRequest(BaseModel):
    repo_url: HttpUrl = Field(..., description="GitHub repo URL https")
    branch: str = Field(default="main", max_length=100)
    github_token: Optional[str] = Field(default=None, max_length=500)
    index_id: Optional[str] = Field(default=None, max_length=100)


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


def _same_github_repo(left: str, right: str) -> bool:
    from app.services.repo_index_access import parse_github_repo

    a = parse_github_repo(left or "")
    b = parse_github_repo(right or "")
    return bool(a and b and a[0].lower() == b[0].lower() and a[1].lower() == b[1].lower())


async def _authorize_explore_target(user: dict, request: ExploreRequest) -> str:
    """Bind an optional index to the exact registered repository being analyzed."""
    if request.index_id:
        team_id = await authorize_repo_index(user, request.index_id)
        from app.services.repo_context import RepoContextService

        index = await RepoContextService().get(request.index_id)
        if not index:
            raise HTTPException(status_code=404, detail="Index not found")
        if not _same_github_repo(str(request.repo_url), str(index.get("repo_url") or "")):
            raise HTTPException(status_code=400, detail="index_id does not match repo_url")
        # Re-check the explicit repository against the selected index tenant.
        return await authorize_registered_repository(user, str(request.repo_url), team_id)
    return await authorize_registered_repository(user, str(request.repo_url))


@router.post("/analyze")
async def analyze_repo(
    request: ExploreRequest,
    req: Request,
    response: Response,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("explore"),
):
    # Authorization is completed before a client or server GitHub token can
    # reach ArchitectureExplorer/GitHubService.
    team_id = await _authorize_explore_target(user, request)
    # HttpUrl is a pydantic object, not a str — the explorer's URL validation
    # and JSON session payloads both need the plain string.
    repo_url = str(request.repo_url)
    llm = getattr(req.app.state, "llm", None)
    github_token = _extract_github_token(request, req)
    sid = await get_session(
        "architecture_explorer",
        user_id=user.get("uid"),
        team_id=team_id,
        index_id=request.index_id,
        scratchpad={"repo_url": repo_url, "branch": request.branch},
    )
    explorer = ArchitectureExplorer(llm, github_token=github_token, session_id=sid) if sid else ArchitectureExplorer(llm, github_token=github_token)
    before_route = getattr(llm, "last_route", None)
    try:
        result = await explorer.execute(
            repo_url=repo_url,
            branch=request.branch,
            index_id=request.index_id,
        )
        if result is None:
            await fail_session(sid, "architecture_explorer")
            raise HTTPException(
                status_code=502,
                detail="Architecture analysis failed: explorer returned no result",
            )
        attach_served_route_header(llm, before_route, response)
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "architecture_explorer", success=True, payload={"repo_url": repo_url, "index_id": request.index_id})
        # Persist a durable snapshot so the graph survives reloads and Redis
        # TTL expiry (best-effort — never block analysis on storage).
        if isinstance(result, dict):
            try:
                from app.services.architecture_store import architecture_store

                await architecture_store.save_from_analyze(
                    result,
                    repo_url=repo_url,
                    branch=request.branch,
                    index_id=request.index_id,
                )
            except Exception:
                pass
        return result
    except HTTPException:
        raise
    except Exception as e:
        await fail_session(sid, "architecture_explorer")
        logger.exception("Internal error"); raise HTTPException(status_code=500, detail="An internal error occurred. Please try again.")


@router.get("/health")
async def health():
    return {"status": "ok"}
