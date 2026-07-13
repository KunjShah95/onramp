from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from app.api.v1.auth import get_current_user
from app.services import gamification_service as gs

router = APIRouter(prefix="/gamification", tags=["gamification"])


# ── Request Models ────────────────────────────────────────────


class AwardXpRequest(BaseModel):
    source: str
    amount: Optional[int] = None
    team_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ── Award XP ──────────────────────────────────────────────────


@router.post("/xp")
async def award_xp(
    request: AwardXpRequest,
    user: dict = Depends(get_current_user),
):
    """Award XP to the current user from a specific source."""
    uid = user.get("uid", "")
    result = await gs.award_xp(
        user_id=uid,
        source=request.source,
        amount=request.amount,
        team_id=request.team_id,
        metadata=request.metadata,
    )
    return result


# ── Gamification Summary ──────────────────────────────────────


@router.get("/summary")
async def get_gamification_summary(
    team_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Get complete gamification summary for the current user.

    Returns XP total, level, progress to next level, badges, and streak info.
    """
    uid = user.get("uid", "")
    summary = await gs.get_user_gamification_summary(
        user_id=uid, team_id=team_id
    )
    return summary


# ── Badges ────────────────────────────────────────────────────


@router.get("/badges")
async def list_badges(
    user: dict = Depends(get_current_user),
):
    """Get all badges earned by the current user."""
    uid = user.get("uid", "")
    badges = await gs.get_earned_badges(uid)
    return {"badges": badges, "count": len(badges)}


@router.get("/badges/definitions")
async def list_badge_definitions(
    _user: dict = Depends(get_current_user),
):
    """Get all available badge definitions with their requirements."""
    definitions = []
    for key, defn in gs.BADGES.items():
        req_type, req_value = defn["requirement"]
        definitions.append({
            "badge_key": key,
            "name": defn["name"],
            "icon": defn["icon"],
            "description": defn["description"],
            "requirement_type": req_type,
            "requirement_value": req_value,
            "xp_bonus": defn["xp_bonus"],
        })
    return {"badge_definitions": definitions, "count": len(definitions)}


# ── Streaks ───────────────────────────────────────────────────


@router.post("/login")
async def record_login(
    user: dict = Depends(get_current_user),
):
    """Record a daily login and update streak. Call on user authentication.

    Returns updated streak info and any XP awarded for daily login.
    """
    uid = user.get("uid", "")

    # Record the login and update streak
    streak_info = await gs.record_login(uid)

    # Award daily login XP (will be capped at 1/day by service)
    xp_result = await gs.award_xp(
        user_id=uid,
        source="daily_login",
        team_id=None,
    )

    return {
        "streak": streak_info,
        "xp_awarded": xp_result.get("awarded", False),
        "xp_amount": xp_result.get("amount", 0) if xp_result.get("awarded") else 0,
    }


@router.get("/streak")
async def get_streak(
    user: dict = Depends(get_current_user),
):
    """Get the current login streak for the current user."""
    uid = user.get("uid", "")
    streak = await gs.get_streak(uid)
    return streak


# ── Leaderboard ───────────────────────────────────────────────


@router.get("/leaderboard")
async def get_leaderboard(
    team_id: str = Query(..., description="Team ID to scope leaderboard to"),
    period: str = Query("all_time", description="Period: all_time, monthly, or weekly"),
    limit: int = Query(20, description="Max number of entries"),
    _user: dict = Depends(get_current_user),
):
    """Get the team leaderboard sorted by XP descending."""
    if period not in ("all_time", "monthly", "weekly"):
        raise HTTPException(
            status_code=400,
            detail="Invalid period. Must be 'all_time', 'monthly', or 'weekly'.",
        )
    leaderboard = await gs.get_leaderboard(
        team_id=team_id, period=period, limit=limit
    )
    return leaderboard


# ── XP Sources (reference) ────────────────────────────────────


@router.get("/sources")
async def list_xp_sources(
    _user: dict = Depends(get_current_user),
):
    """Get all available XP sources and their default amounts."""
    return {
        "sources": [
            {"source": key, "default_amount": value}
            for key, value in gs.XP_SOURCES.items()
        ]
    }
