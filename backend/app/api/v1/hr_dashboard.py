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
