from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.agents import PRReviewAgent
from app.services.quota import enforce_quota
from app.api.v1.auth import get_current_user
import os

router = APIRouter(prefix="/pr-review", tags=["pr-review"])


class PRReviewRequest(BaseModel):
    repo_url: str
    pr_number: int
    focus_areas: Optional[List[str]] = None


@router.post("/review")
async def review_pr(
    request: PRReviewRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("pr_review"),
):
    """Review a GitHub PR and return structured feedback."""
    llm = getattr(req.app.state, "llm", None)
    github_token = os.getenv("GITHUB_TOKEN")
    agent = PRReviewAgent(llm, github_token)

    try:
        result = await agent.review_pr(
            repo_url=request.repo_url,
            pr_number=request.pr_number,
            focus_areas=request.focus_areas,
        )
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))