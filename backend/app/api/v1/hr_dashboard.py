"""
HR dashboard API — onboarding-analytics endpoints for HR managers.

Exposes read-only cohort metrics (ramp time, completion, engagement) and an
attrition-risk view for a given team. All endpoints require authentication.

This router is intentionally NOT registered in main.py by this module. See the
service module ``app.services.hr_metrics_service`` for the computations.
"""

import logging

from fastapi import APIRouter, Depends, Request

from app.api.v1.auth import get_current_user
from app.services import hr_metrics_service
from app.services.cache_service import cached

logger = logging.getLogger("onramp.hr")

router = APIRouter(prefix="/hr", tags=["hr"])


@router.get("/cohort/{team_id}")
@cached("hr", ttl=300)
async def get_cohort(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Full onboarding-analytics rollup for a team's cohort.

    Returns ramp time, onboarding completion %, engagement, and attrition risk.
    """
    return await hr_metrics_service.cohort_summary(team_id)


@router.get("/attrition/{team_id}")
@cached("hr", ttl=300)
async def get_attrition(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Attrition-risk list for a team: members with stalled tasks or lost streaks."""
    return await hr_metrics_service.attrition_risk(team_id)


@router.get("/heatmap/{team_id}")
@cached("hr", ttl=600)
async def get_heatmap(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Daily activity heatmap data for all team members over the last 12 weeks."""
    return await hr_metrics_service.activity_heatmap(team_id)


@router.get("/developers/{team_id}")
@cached("hr", ttl=300)
async def get_developers(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Onboarding overview for each developer: progress, ramp, streak, stage."""
    return await hr_metrics_service.developer_onboarding(team_id)


@router.get("/cohort-comparison/{team_id}")
@cached("hr", ttl=600)
async def get_cohort_comparison(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Compare onboarding speed across hiring cohorts (by join month).

    Returns avg ramp days, avg days to first PR, completion %, and top
    blockers per cohort so HR can see improvement over time.
    """
    return await hr_metrics_service.cohort_comparison(team_id)


@router.get("/timeline/{team_id}")
@cached("hr", ttl=300)
async def get_timeline(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Onboarding progress timeline — each developer as a lane, task states as milestones."""
    return await hr_metrics_service.onboarding_timeline(team_id)


@router.get("/mentor-match/{team_id}/{user_id}")
@cached("hr", ttl=600)
async def get_mentor_match(
    request: Request, team_id: str, user_id: str, user: dict = Depends(get_current_user),
):
    """Match a new dev to senior devs by shared tech stack (simple scoring)."""
    return await hr_metrics_service.mentor_matching(team_id, user_id)

@router.get("/review-analytics/{team_id}")
@cached("hr", ttl=300)
async def get_review_analytics(request: Request, team_id: str, user: dict = Depends(get_current_user)):
    """Review-quality analytics: rework rate, turnaround, reviewer load."""
    return await hr_metrics_service.review_analytics(team_id)
