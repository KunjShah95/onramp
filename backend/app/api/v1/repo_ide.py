"""In-browser IDE endpoints: repo tree, file contents, agent proposals, commit + PR.

All routes require membership of the team the repository is registered to
(same check as the rest of /repos). Git operations act with the caller's
saved GitHub token (Settings → Integrations → GitHub), else GITHUB_TOKEN.
"""
import logging
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.api.v1.auth import get_current_user
from app.api.v1.repositories import _verify_repo_access
from app.services.quota import enforce_quota
from app.services.repo_ide_service import IdeError, RepoIde, resolve_token, valid_branch

router = APIRouter(prefix="/repos", tags=["ide"])
logger = logging.getLogger(__name__)


class IdeFileChange(BaseModel):
    path: str = Field(..., max_length=500)
    content: Optional[str] = Field(None, description="New file content; null deletes the file")


class IdeCommitRequest(BaseModel):
    base: str = Field("main", max_length=200)
    branch: Optional[str] = Field(None, max_length=200, description="Defaults to onramp/ide-<timestamp>")
    message: str = Field(..., min_length=1, max_length=5000)
    files: List[IdeFileChange] = Field(..., min_length=1, max_length=50)
    open_pr: bool = True
    pr_title: Optional[str] = Field(None, max_length=250)
    pr_body: Optional[str] = Field(None, max_length=20000)


class IdeProposeRequest(BaseModel):
    issue_description: str = Field(..., min_length=3, max_length=8000)
    branch: str = Field("main", max_length=200)


async def _workspace(owner: str, repo: str, user: dict) -> tuple[RepoIde, dict]:
    repo_data = await _verify_repo_access(owner, repo, user)
    # Use the registered owner/name, never raw path input, for the GitHub calls.
    ide = RepoIde(repo_data.get("owner") or owner, repo_data.get("name") or repo, await resolve_token(user))
    return ide, repo_data


def _raise(e: IdeError):
    raise HTTPException(status_code=e.status, detail=str(e)) from e


@router.get("/{owner}/{repo}/ide/tree")
async def ide_tree(owner: str, repo: str, ref: str = Query("main", max_length=200), user: dict = Depends(get_current_user)):
    if not valid_branch(ref):
        raise HTTPException(status_code=400, detail="Invalid ref")
    ide, _ = await _workspace(owner, repo, user)
    try:
        return await ide.tree(ref)
    except IdeError as e:
        _raise(e)
    except HTTPException:
        raise
    except Exception as e:  # never let a crash escape as a bare 500 (loses CORS headers)
        logger.exception("IDE request failed for %s/%s", owner, repo)
        raise HTTPException(status_code=502, detail="Workspace operation failed") from e


@router.get("/{owner}/{repo}/ide/file")
async def ide_file(
    owner: str,
    repo: str,
    path: str = Query(..., max_length=500),
    ref: str = Query("main", max_length=200),
    user: dict = Depends(get_current_user),
):
    if not valid_branch(ref):
        raise HTTPException(status_code=400, detail="Invalid ref")
    ide, _ = await _workspace(owner, repo, user)
    try:
        return await ide.file(path, ref)
    except IdeError as e:
        _raise(e)
    except HTTPException:
        raise
    except Exception as e:  # never let a crash escape as a bare 500 (loses CORS headers)
        logger.exception("IDE request failed for %s/%s", owner, repo)
        raise HTTPException(status_code=502, detail="Workspace operation failed") from e


@router.post("/{owner}/{repo}/ide/commit")
async def ide_commit(owner: str, repo: str, body: IdeCommitRequest, user: dict = Depends(get_current_user)):
    ide, _ = await _workspace(owner, repo, user)
    branch = body.branch or f"onramp/ide-{int(time.time())}"
    if branch == body.base:
        raise HTTPException(status_code=400, detail="Commit to a new branch, not the base branch")
    try:
        result = await ide.commit(body.base, branch, body.message, [f.model_dump() for f in body.files])
        if body.open_pr:
            title = body.pr_title or body.message.strip().splitlines()[0][:120]
            pr_body = body.pr_body or f"{body.message}\n\n_Opened from the Onramp IDE._"
            result.update(await ide.open_pr(branch, body.base, title, pr_body))
        return result
    except IdeError as e:
        _raise(e)
    except HTTPException:
        raise
    except Exception as e:  # never let a crash escape as a bare 500 (loses CORS headers)
        logger.exception("IDE request failed for %s/%s", owner, repo)
        raise HTTPException(status_code=502, detail="Workspace operation failed") from e


@router.post("/{owner}/{repo}/ide/propose")
async def ide_propose(
    owner: str,
    repo: str,
    body: IdeProposeRequest,
    req: Request,
    user: dict = Depends(get_current_user),
    _q=enforce_quota("analyze"),
):
    """Ask the coding agent for changes WITHOUT applying them (review in the IDE)."""
    from app.llm import LLMRouter
    from app.services.issue_orchestrator import IssueOrchestrator

    if not valid_branch(body.branch):
        raise HTTPException(status_code=400, detail="Invalid branch")
    _, repo_data = await _workspace(owner, repo, user)
    llm = getattr(req.app.state, "llm", None) or LLMRouter()
    orchestrator = IssueOrchestrator(llm_client=llm, github_token=await resolve_token(user))
    url = (repo_data.get("url") or f"https://github.com/{owner}/{repo}").strip()
    result = await orchestrator.resolve_issue(
        repo_url=url,
        issue_description=body.issue_description,
        branch=body.branch,
        team_id=repo_data.get("team_id"),
        user_id=user.get("uid"),
        apply=False,
    )
    if result.get("error") and not result.get("fixes"):
        logger.error("IDE propose failed for %s/%s: %s", owner, repo, result["error"])
        if result.get("status") == "no_fix_proposed":
            return result
        raise HTTPException(status_code=502, detail="The coding agent failed — try a more specific brief")
    return result
