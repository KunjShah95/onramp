from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.agents import PRReviewAgent
from app.services.quota import enforce_quota
from app.services.github_service import GitHubService
from app.api.v1.auth import get_current_user
import os

router = APIRouter(prefix="/pr-review", tags=["pr-review"])


class PRReviewRequest(BaseModel):
    repo_url: str
    pr_number: int
    focus_areas: Optional[List[str]] = None
    mode: str = "normal"


class PRDescriptionRequest(BaseModel):
    repo_url: str
    pr_number: int
    title: str = ""
    branch: str = ""


class AutoApplyRequest(BaseModel):
    repo_url: str
    pr_number: int
    suggestions: List[dict]
    commit_message_prefix: str = "fix: auto-apply PR review suggestion"


class AutoApplySingleRequest(BaseModel):
    repo_url: str
    pr_number: int
    file_path: str
    old_string: str
    new_string: str
    commit_message: str = "fix: auto-apply PR review suggestion"


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
            mode=request.mode,
        )
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])

        # Award XP for completing a PR review (fire-and-forget)
        try:
            from app.services.gamification_service import award_xp as _award_xp
            await _award_xp(user_id=user.get("uid", ""), source="pr_review_completed")
        except Exception:
            pass  # XP award is non-critical

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/describe")
async def describe_pr(
    request: PRDescriptionRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("pr_review"),
):
    """Generate a PR description from the diff."""
    llm = getattr(req.app.state, "llm", None)
    github_token = os.getenv("GITHUB_TOKEN")
    agent = PRReviewAgent(llm, github_token)

    try:
        result = await agent.generate_pr_description(
            repo_url=request.repo_url,
            pr_number=request.pr_number,
            title=request.title,
            branch=request.branch,
        )
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-apply")
async def auto_apply_suggestions(
    request: AutoApplyRequest,
    _user: dict = Depends(get_current_user),
    _q=enforce_quota("pr_review"),
):
    """Apply multiple review suggestions as inline fix commits on the PR branch.

    Each suggestion must have:
      - ``file_path`` (str) — path relative to repo root
      - ``old_string`` (str) — exact snippet to replace
      - ``new_string`` (str) — replacement content

    Uses GitHub's Git Data API (blob -> tree -> commit -> update ref) to create
    one commit per suggestion on the PR's head branch.
    """
    github_token = os.getenv("GITHUB_TOKEN")
    gh = GitHubService(github_token)
    try:
        results = await gh.apply_suggestions_bulk(
            repo_url=request.repo_url,
            pr_number=request.pr_number,
            suggestions=request.suggestions,
            commit_message_prefix=request.commit_message_prefix,
        )
        succeeded = sum(1 for r in results if r.get("success"))
        failed = sum(1 for r in results if not r.get("success"))
        return {
            "total": len(results),
            "succeeded": succeeded,
            "failed": failed,
            "results": results,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-apply/single")
async def auto_apply_single(
    request: AutoApplySingleRequest,
    _user: dict = Depends(get_current_user),
    _q=enforce_quota("pr_review"),
):
    """Apply a single review suggestion as an inline fix commit."""
    github_token = os.getenv("GITHUB_TOKEN")
    gh = GitHubService(github_token)
    try:
        result = await gh.apply_suggestion(
            repo_url=request.repo_url,
            pr_number=request.pr_number,
            file_path=request.file_path,
            old_string=request.old_string,
            new_string=request.new_string,
            commit_message=request.commit_message,
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))