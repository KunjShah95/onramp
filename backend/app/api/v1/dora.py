"""
DORA Metrics API — team velocity & DORA endpoints.

Exposes the DORA metrics service (deployment frequency, lead time for
changes, change failure rate, MTTR) plus velocity trends and per-member
throughput. All endpoints require authentication and are scoped to a team.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.v1.auth import get_current_user
from app.services import dora_metrics_service as dora
from app.services.team_service import get_user_teams
from app.services.cache_service import cached

router = APIRouter(prefix="/dora", tags=["dora"])


async def _assert_team_access(team_id: str, uid: str) -> None:
    """Raise 403 unless the caller belongs to the team."""
    teams = await get_user_teams(uid)
    team_ids = {t.get("team_id") or t.get("id") for t in teams}
    if team_id not in team_ids:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/summary")
@cached("dora", ttl=300)
async def dora_summary(
    request: Request,
    team_id: str,
    days: int = 90,
    user: dict = Depends(get_current_user),
):
    """Compute all four DORA metrics for a team over the given window."""
    await _assert_team_access(team_id, user.get("uid", ""))
    return await dora.dora_summary(team_id, days=days)


@router.get("/velocity")
@cached("dora", ttl=300)
async def velocity_trends(
    request: Request,
    team_id: str,
    weeks: int = 12,
    user: dict = Depends(get_current_user),
):
    """Weekly completion trend for a team (velocity chart)."""
    await _assert_team_access(team_id, user.get("uid", ""))
    return await dora.velocity_trends(team_id, weeks=weeks)


@router.get("/throughput")
@cached("dora", ttl=300)
async def team_throughput(
    request: Request,
    team_id: str,
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    """Per-member throughput (completed / in-progress tasks) over the window."""
    await _assert_team_access(team_id, user.get("uid", ""))
    return await dora.team_throughput(team_id, days=days)
