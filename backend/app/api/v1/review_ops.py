"""
Review Operations API — v1.5 load balancing + consistency scoring.

- ``GET /review-ops/load``        — per-reviewer load board (pending,
  in-review, recent volume, oldest wait, 0-100 load score).
- ``GET /review-ops/suggest``     — least-loaded reviewer suggestion for the
  next review (optionally for a specific task, excluding its assignee).
- ``GET /review-ops/consistency`` — per-reviewer consistency readout
  (turnaround, rework, calibration) + 0-100 score.

All endpoints are read-only and membership-gated (any team member may view —
mirrors the HR analytics endpoints).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.v1.auth import get_current_user
from app.services.review_ops_service import (
    consistency_scores,
    reviewer_load,
    suggest_reviewer,
)
from app.services.team_service import get_team_members, get_user_teams

router = APIRouter(prefix="/review-ops", tags=["review-ops"])


async def _resolve_team(user: dict, team_id: Optional[str]) -> str:
    """Explicit team_id wins; otherwise the user's primary team (or uid)."""
    if team_id:
        return team_id
    teams = await get_user_teams(user.get("uid", ""))
    if teams:
        return teams[0].get("team_id") or teams[0].get("id") or user.get("uid", "")
    return user.get("uid", "")


async def _require_member(user: dict, team_id: str) -> None:
    members = await get_team_members(team_id)
    if not any((m.get("user_id") or m.get("id")) == user.get("uid", "") for m in members):
        raise HTTPException(status_code=403, detail="Not a member of this team")


@router.get("/load")
async def load_board(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Per-reviewer load board for the team."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return await reviewer_load(tid)


@router.get("/suggest")
async def suggest(
    request: Request,
    team_id: Optional[str] = Query(None),
    task_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Least-loaded reviewer suggestion (optionally for a specific task)."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    if task_id:
        from app.services.postgres_db import get_storage
        from app.services.task_service import get_task

        task = await get_task(task_id)
        if not task or task.get("team_id") != tid:
            raise HTTPException(status_code=404, detail="Task not found in this team")
    return await suggest_reviewer(tid, task_id=task_id)


@router.get("/consistency")
async def consistency(
    request: Request,
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Per-reviewer consistency scores for the team."""
    tid = await _resolve_team(user, team_id)
    await _require_member(user, tid)
    return await consistency_scores(tid)
