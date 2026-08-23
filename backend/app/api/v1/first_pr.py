import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from app.agents import FirstPRAccelerator
from app.services.quota import enforce_quota
from app.services.agent_session_helper import get_session, complete_session, fail_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/first-pr", tags=["onboarding"])


class IssuesRequest(BaseModel):
    repo_url: str
    user_level: str = "junior"
    github_token: Optional[str] = None


class GuideRequest(BaseModel):
    issue_id: int
    repo_structure: dict
    github_token: Optional[str] = None


def extract_github_token(request_body: BaseModel, req: Request) -> Optional[str]:
    """Extract token from request body or Authorization header.

    Returns None if no GitHub token found; caller should expect this and use
    GitHub API without authentication (subject to rate limits).
    """
    if getattr(request_body, "github_token", None):
        token = request_body.github_token
        logger.debug("Using GitHub token from request body")
        return token
    auth_header = req.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        # Only use it if it looks like a GitHub token (not an auth JWT)
        if token.startswith(("ghp_", "gho_", "ghu_", "ghs_", "github_pat_")):
            logger.debug("Using GitHub token from Authorization header")
            return token
    logger.info("No GitHub token provided; GitHub API calls will use unauthenticated rate limit")
    return None


@router.post("/issues")
async def find_issues(request: IssuesRequest, req: Request, _q=enforce_quota("generate")):
    llm = getattr(req.app.state, "llm", None)
    github_token = extract_github_token(request, req)
    sid = await get_session("first_pr_accelerator", scratchpad={"repo_url": request.repo_url, "user_level": request.user_level})
    agent = FirstPRAccelerator(llm, github_token=github_token, session_id=sid) if sid else FirstPRAccelerator(llm, github_token=github_token)
    try:
        result = await agent.find_issues(
            repo_url=request.repo_url,
            user_level=request.user_level,
        )
        if isinstance(result, dict) and sid:
            result["session_id"] = sid
        await complete_session(sid, "first_pr_accelerator", success=True, payload={"repo_url": request.repo_url})
        return result
    except Exception as e:
        await fail_session(sid, "first_pr_accelerator")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/guide")
async def generate_guide(request: GuideRequest, req: Request, _q=enforce_quota("generate")):
    llm = getattr(req.app.state, "llm", None)
    github_token = extract_github_token(request, req)
    agent = FirstPRAccelerator(llm, github_token=github_token)
    try:
        result = await agent.generate_guide(
            issue_id=request.issue_id,
            repo_structure=request.repo_structure,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
