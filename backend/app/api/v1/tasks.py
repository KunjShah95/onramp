import os
import re
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.services.task_service import (
    create_task,
    get_task,
    list_tasks,
    update_task,
    transition_task,
    assign_task,
    start_task,
    submit_task,
    review_task,
    approve_task,
    complete_task,
    cancel_task,
    delete_task,
    get_team_progress,
    get_user_progress,
)
from app.api.v1.auth import get_current_user
from app.agents import PRReviewAgent

logger = logging.getLogger("codeflow.tasks")
router = APIRouter(prefix="/tasks", tags=["workflow"])


# ── Helpers ──────────────────────────────────────────────


def _parse_pr_number(pr_url: str) -> Optional[int]:
    """Extract the PR number from a GitHub PR URL.

    Examples:
      https://github.com/owner/repo/pull/42      → 42
      https://github.com/owner/repo/pull/42/      → 42
      https://github.com/owner/repo/pull/42/files → 42
    """
    match = re.search(r"/pull/(\d+)/?", pr_url)
    if match:
        return int(match.group(1))
    return None


def _infer_repo_url(pr_url: str) -> Optional[str]:
    """Extract the repository URL from a GitHub PR URL.

    Examples:
      https://github.com/owner/repo/pull/42 → https://github.com/owner/repo
    """
    match = re.match(r"(https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/pull/", pr_url)
    if match:
        return match.group(1)
    return None


# ── Request Schemas ──────────────────────────────────────────


class CreateTaskRequest(BaseModel):
    team_id: str
    title: str
    description: Optional[str] = None
    module: Optional[str] = None
    priority: str = "medium"
    repo_url: Optional[str] = None
    branch: Optional[str] = None
    unlock_modules: Optional[List[str]] = None
    estimated_hours: Optional[float] = None
    assigned_to: Optional[str] = None


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    module: Optional[str] = None
    priority: Optional[str] = None
    repo_url: Optional[str] = None
    branch: Optional[str] = None
    unlock_modules: Optional[List[str]] = None
    estimated_hours: Optional[float] = None


class AssignRequest(BaseModel):
    assignee_id: str


class SubmitRequest(BaseModel):
    pr_url: str


class ReviewRequest(BaseModel):
    feedback: Optional[Dict[str, Any]] = None
    approve: bool = False
    needs_product: bool = False


class TransitionRequest(BaseModel):
    new_state: str
    feedback: Optional[Dict[str, Any]] = None
    pr_url: Optional[str] = None


class ReviewFeedbackRequest(BaseModel):
    feedback: Optional[Dict[str, Any]] = None


# ── Task CRUD ────────────────────────────────────────────────


@router.post("")
async def create_task_endpoint(
    request: CreateTaskRequest,
    user: dict = Depends(get_current_user),
):
    """Create a new task (senior creates, optionally assigns to a trainee)."""
    task = await create_task(
        team_id=request.team_id,
        created_by=user.get("uid", ""),
        title=request.title,
        description=request.description,
        module=request.module,
        priority=request.priority,
        repo_url=request.repo_url,
        branch=request.branch,
        unlock_modules=request.unlock_modules,
        estimated_hours=request.estimated_hours,
        assigned_to=request.assigned_to,
    )
    return task


@router.get("")
async def list_tasks_endpoint(
    team_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    created_by: Optional[str] = None,
    state: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List tasks with optional filters."""
    tasks = await list_tasks(
        team_id=team_id,
        assigned_to=assigned_to,
        created_by=created_by,
        state=state,
    )
    return {"tasks": tasks, "count": len(tasks)}


@router.get("/{task_id}")
async def get_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a single task by ID."""
    task = await get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}")
async def update_task_endpoint(
    task_id: str,
    request: UpdateTaskRequest,
    user: dict = Depends(get_current_user),
):
    """Update task fields (non-state)."""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await update_task(task_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found or task is in terminal state")
    return result


@router.delete("/{task_id}")
async def delete_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Hard-delete a task."""
    success = await delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"deleted": True}


# ── Workflow Transitions ─────────────────────────────────────


@router.post("/{task_id}/transition")
async def transition_task_endpoint(
    task_id: str,
    request: TransitionRequest,
    user: dict = Depends(get_current_user),
):
    """Transition a task to a new state (generic endpoint)."""
    try:
        task = await transition_task(
            task_id,
            request.new_state,
            user.get("uid", ""),
            feedback=request.feedback,
            pr_url=request.pr_url,
        )
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/assign")
async def assign_task_endpoint(
    task_id: str,
    request: AssignRequest,
    user: dict = Depends(get_current_user),
):
    """Assign a task to a trainee."""
    try:
        task = await assign_task(task_id, request.assignee_id, user.get("uid", ""))
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/start")
async def start_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Mark task as in_progress (trainee starts working)."""
    try:
        task = await start_task(task_id, user.get("uid", ""))
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/submit")
async def submit_task_endpoint(
    task_id: str,
    request: SubmitRequest,
    req: Request,
    user: dict = Depends(get_current_user),
):
    """Submit a task for review with a PR URL.

    After transitioning to 'submitted', the system automatically fetches
    the PR diff and runs the AI review agent. Results are stored in
    the task's `ai_review` field for the senior to inspect.
    """
    # 1. Transition task to submitted
    try:
        task = await submit_task(task_id, user.get("uid", ""), request.pr_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Fetch full task to get repo_url and other context
    full_task = await get_task(task_id)
    if not full_task:
        return task  # Shouldn't happen, but guard

    repo_url = full_task.get("repo_url") or _infer_repo_url(request.pr_url)
    pr_number = _parse_pr_number(request.pr_url)

    # 3. Run AI review if we have the needed data
    if repo_url and pr_number is not None:
        llm = getattr(req.app.state, "llm", None)
        github_token = os.getenv("GITHUB_TOKEN")

        try:
            agent = PRReviewAgent(llm, github_token)
            review_result = await agent.review_pr(
                repo_url=repo_url,
                pr_number=pr_number,
                focus_areas=["security", "performance", "maintainability", "correctness"],
            )

            # Store AI review on the task
            if "error" not in review_result:
                await update_task(task_id, {"ai_review": review_result})
                logger.info(
                    "AI review completed for task %s (PR #%d, score: %s)",
                    task_id,
                    pr_number,
                    review_result.get("score", "N/A"),
                )
            else:
                logger.warning("AI review returned error for task %s: %s", task_id, review_result["error"])
        except Exception as e:
            # AI review failure must never block the submission
            logger.exception("AI review failed for task %s: %s", task_id, e)

    # 4. Return the updated task (re-fetch to include ai_review if stored)
    updated = await get_task(task_id)
    return updated or task


@router.post("/{task_id}/review")
async def review_task_endpoint(
    task_id: str,
    request: ReviewRequest,
    user: dict = Depends(get_current_user),
):
    """Review a submitted task — approve, request changes, or route to product."""
    try:
        task = await review_task(
            task_id,
            user.get("uid", ""),
            feedback=request.feedback or {},
            approve=request.approve,
            needs_product=request.needs_product,
        )
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/approve")
async def approve_task_endpoint(
    task_id: str,
    request: ReviewFeedbackRequest = ReviewFeedbackRequest(),
    user: dict = Depends(get_current_user),
):
    """Approve a task (senior or product sign-off)."""
    try:
        task = await approve_task(task_id, user.get("uid", ""), feedback=request.feedback)
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/complete")
async def complete_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Mark task as completed — modules unlocked."""
    try:
        task = await complete_task(task_id, user.get("uid", ""))
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/cancel")
async def cancel_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Cancel a task."""
    try:
        task = await cancel_task(task_id, user.get("uid", ""))
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Progress & Aggregation ───────────────────────────────────


@router.get("/progress/team/{team_id}")
async def team_progress_endpoint(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    """Get aggregate progress metrics for a team."""
    return await get_team_progress(team_id)


@router.get("/progress/user/{user_id}")
async def user_progress_endpoint(
    user_id: str,
    team_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Get aggregate progress metrics for a specific user/trainee."""
    return await get_user_progress(user_id, team_id=team_id)
