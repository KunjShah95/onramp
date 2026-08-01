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
from app.services.notification_helpers import (
    notify_task_assigned_all_channels,
    notify_task_submitted_all_channels,
    notify_task_reviewed_all_channels,
    notify_task_approved_all_channels,
    notify_task_completed_all_channels,
)
from app.services.audit_service import log_event
from app.services.cache_service import cached, invalidate_prefix

logger = logging.getLogger("onramp.tasks")
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


async def _verify_task_access(task_id: str, uid: str) -> dict:
    """Fetch task and verify uid belongs to its team. Returns task or raises 403/404."""
    from app.services.team_service import get_user_teams

    task = await get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_team = task.get("team_id")
    if task_team:
        teams = await get_user_teams(uid)
        team_ids = {t.get("team_id") or t.get("id") for t in teams}
        if task_team not in team_ids:
            raise HTTPException(status_code=403, detail="Access denied")

    return task


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
    """Create a new task. Any authenticated team member can create tasks for themselves or their team."""
    uid = user.get("uid", "")
    task = await create_task(
        team_id=request.team_id,
        created_by=uid,
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
    try:
        await log_event(
            "task_created", uid, task.get("task_id", ""),
            team_id=request.team_id,
            metadata={"title": request.title, "module": request.module},
        )
    except Exception:
        logger.exception("Failed to log task creation audit event")
    await invalidate_prefix("tasks")
    return task


@router.get("")
@cached("tasks", ttl=60)
async def list_tasks_endpoint(
    request: Request,
    team_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    created_by: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    """List tasks scoped to the caller's teams. Max 200 per page."""
    from app.services.team_service import get_user_teams

    limit = min(limit, 200)
    uid = user.get("uid", "")
    user_teams = await get_user_teams(uid)
    user_team_ids = {t.get("team_id") or t.get("id") for t in user_teams}

    if team_id:
        if team_id not in user_team_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        scoped_team_id = team_id
    else:
        scoped_team_id = None

    tasks = await list_tasks(
        team_id=scoped_team_id,
        assigned_to=assigned_to,
        created_by=created_by,
        state=state,
    )

    if not scoped_team_id:
        tasks = [t for t in tasks if t.get("team_id") in user_team_ids]

    total = len(tasks)
    page = tasks[offset: offset + limit]
    return {"tasks": page, "count": len(page), "total": total, "offset": offset, "limit": limit}


@router.get("/{task_id}")
async def get_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Get a single task by ID. Requires team membership."""
    return await _verify_task_access(task_id, user.get("uid", ""))


@router.patch("/{task_id}")
async def update_task_endpoint(
    task_id: str,
    request: UpdateTaskRequest,
    user: dict = Depends(get_current_user),
):
    """Update task fields (non-state). Requires team membership."""
    await _verify_task_access(task_id, user.get("uid", ""))
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
    """Hard-delete a task. Requires team membership."""
    await _verify_task_access(task_id, user.get("uid", ""))
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
    """Transition a task to a new state (generic endpoint). Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await transition_task(
            task_id,
            request.new_state,
            uid,
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
    """Assign a task to a trainee. Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await assign_task(task_id, request.assignee_id, uid)
        try:
            created_by_name = user.get("name") or user.get("email", "A senior")
            if task:
                await notify_task_assigned_all_channels(task, request.assignee_id, created_by_name)
        except Exception:
            logger.exception("Failed to send assignment notification")
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/start")
async def start_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Mark task as in_progress (trainee starts working). Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await start_task(task_id, uid)
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
    """Submit a task for review with a PR URL. Requires team membership.

    After transitioning to 'submitted', the system automatically fetches
    the PR diff and runs the AI review agent. Results are stored in
    the task's `ai_review` field for the senior to inspect.
    """
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    # 1. Transition task to submitted
    try:
        task = await submit_task(task_id, uid, request.pr_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Audit log
    try:
        await log_event(
            "task_submitted", user.get("uid", ""), task_id,
            team_id=task.get("team_id"),
            metadata={"pr_url": request.pr_url},
        )
    except Exception:
        logger.exception("Failed to log task submission audit event")

    # 3. Fetch full task to get repo_url and other context
    full_task = await get_task(task_id)
    if not full_task:
        return task  # Shouldn't happen, but guard

    repo_url = full_task.get("repo_url") or _infer_repo_url(request.pr_url)
    pr_number = _parse_pr_number(request.pr_url)

    # 4. Run AI review if we have the needed data
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

    # 5. Notify the task creator (senior) that work was submitted (fire-and-forget)
    try:
        submitter_name = user.get("name") or user.get("email", "A trainee")
        if full_task:
            await notify_task_submitted_all_channels(full_task, user.get("uid", ""), submitter_name)
    except Exception:
        logger.exception("Failed to send submission notifications")

    # 6. Return the updated task (re-fetch to include ai_review if stored)
    updated = await get_task(task_id)
    return updated or task


@router.post("/{task_id}/review")
async def review_task_endpoint(
    task_id: str,
    request: ReviewRequest,
    user: dict = Depends(get_current_user),
):
    """Review a submitted task — approve, request changes, or route to product. Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await review_task(
            task_id,
            uid,
            feedback=request.feedback or {},
            approve=request.approve,
            needs_product=request.needs_product,
        )
        try:
            reviewer_name = user.get("name") or user.get("email", "A senior")
            if task:
                await notify_task_reviewed_all_channels(task, reviewer_name, approved=request.approve)
        except Exception:
            logger.exception("Failed to send review notification")
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/approve")
async def approve_task_endpoint(
    task_id: str,
    request: ReviewFeedbackRequest = ReviewFeedbackRequest(),
    user: dict = Depends(get_current_user),
):
    """Approve a task (senior or product sign-off). Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await approve_task(task_id, uid, feedback=request.feedback)
        try:
            approver_name = user.get("name") or user.get("email", "A senior")
            if task:
                await notify_task_approved_all_channels(task, approver_name)
        except Exception:
            logger.exception("Failed to send approval notification")
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/complete")
async def complete_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Mark task as completed — modules unlocked. Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await complete_task(task_id, uid)
        try:
            unlocked = task.get("unlock_modules", [])
            await log_event(
                "task_completed", uid, task_id,
                team_id=task.get("team_id"),
                metadata={"unlocked_modules": unlocked},
            )
        except Exception:
            logger.exception("Failed to log completion audit event")
        try:
            if task:
                await notify_task_completed_all_channels(task)
        except Exception:
            logger.exception("Failed to send completion notification")
        try:
            from app.services.gamification_service import award_xp as _award_xp
            assignee = task.get("assigned_to") or uid
            await _award_xp(user_id=assignee, source="task_completed", team_id=task.get("team_id"))
        except Exception:
            logger.exception("Failed to award XP for task completion")
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/cancel")
async def cancel_task_endpoint(
    task_id: str,
    user: dict = Depends(get_current_user),
):
    """Cancel a task. Requires team membership."""
    uid = user.get("uid", "")
    await _verify_task_access(task_id, uid)
    try:
        task = await cancel_task(task_id, uid)
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Progress & Aggregation ───────────────────────────────────


@router.get("/progress/team/{team_id}")
async def team_progress_endpoint(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    """Get aggregate progress metrics for a team. Requires team membership."""
    from app.services.team_service import get_user_teams

    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    team_ids = {t.get("team_id") or t.get("id") for t in teams}
    if team_id not in team_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    return await get_team_progress(team_id)


@router.get("/progress/user/{user_id}")
async def user_progress_endpoint(
    user_id: str,
    team_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Get aggregate progress metrics for a user. Caller must be that user or a teammate."""
    from app.services.team_service import get_user_teams

    uid = user.get("uid", "")
    if uid != user_id:
        caller_teams = await get_user_teams(uid)
        caller_team_ids = {t.get("team_id") or t.get("id") for t in caller_teams}
        target_teams = await get_user_teams(user_id)
        target_team_ids = {t.get("team_id") or t.get("id") for t in target_teams}
        if not caller_team_ids.intersection(target_team_ids):
            raise HTTPException(status_code=403, detail="Access denied")
    return await get_user_progress(user_id, team_id=team_id)
