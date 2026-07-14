"""
Gamification Service — XP, badges, streaks, and leaderboard for Onramp.

Tracks user engagement through experience points (XP), achievement badges,
daily login streaks, and team leaderboards. Integrates with the existing
DynamicDocument storage pattern.
"""

from datetime import datetime, timezone, date, timedelta
from typing import Optional, List, Dict, Any
from app.services.postgres_db import get_storage, generate_id

XP_COLLECTION = "onramp_gamification_xp"
BADGE_COLLECTION = "onramp_gamification_badges"
STREAK_COLLECTION = "onramp_gamification_streaks"
LEADERBOARD_COLLECTION = "onramp_gamification_leaderboard"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_str() -> str:
    return date.today().isoformat()


# ── XP Sources & Amounts ──────────────────────────────────────

XP_SOURCES: Dict[str, int] = {
    "learning_module_completed": 50,
    "quiz_passed": 10,
    "quiz_perfect_score": 25,
    "first_pr_merged": 200,
    "task_completed": 30,
    "question_asked": 5,
    "playbook_created": 100,
    "repo_analyzed": 20,
    "pr_review_completed": 15,
    "daily_login": 5,
}

# Daily caps per source
XP_DAILY_CAPS: Dict[str, int] = {
    "question_asked": 1,    # 5 XP max per day for questions
    "daily_login": 1,       # 5 XP once per day
}

# ── Badge Definitions ──────────────────────────────────────────

BADGES: Dict[str, Dict[str, Any]] = {
    "explorer": {
        "name": "Explorer",
        "icon": "🗺️",
        "description": "Analyze 3 repositories",
        "requirement": ("repo_analyzed", 3),
        "xp_bonus": 50,
    },
    "scholar": {
        "name": "Scholar",
        "icon": "📚",
        "description": "Complete 5 learning modules",
        "requirement": ("learning_module_completed", 5),
        "xp_bonus": 100,
    },
    "squasher": {
        "name": "Squasher",
        "icon": "🐛",
        "description": "Merge first PR",
        "requirement": ("first_pr_merged", 1),
        "xp_bonus": 200,
    },
    "streak_master": {
        "name": "Streak Master",
        "icon": "🔥",
        "description": "7-day login streak",
        "requirement": ("streak", 7),
        "xp_bonus": 100,
    },
    "speed_runner": {
        "name": "Speed Runner",
        "icon": "⚡",
        "description": "Complete onboarding in < 2 weeks",
        "requirement": ("speed_run", 1),
        "xp_bonus": 500,
    },
    "code_champion": {
        "name": "Code Champion",
        "icon": "🏆",
        "description": "Earn 1000+ XP",
        "requirement": ("total_xp", 1000),
        "xp_bonus": 1000,
    },
}


# ═══════════════════════════════════════════════════════════════
# XP Operations
# ═══════════════════════════════════════════════════════════════


async def award_xp(
    user_id: str,
    source: str,
    amount: Optional[int] = None,
    team_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> dict:
    """Award XP to a user.

    Args:
        user_id: The user receiving XP
        source: The XP source key (must be in XP_SOURCES)
        amount: Override the default XP amount. If None, uses XP_SOURCES value.
        team_id: Optional team context
        metadata: Optional metadata about the event

    Returns:
        The XP record created, or a "capped" response if daily limit reached.
    """
    storage = get_storage()
    today = _today_str()
    now = _utcnow()

    # Resolve XP amount
    xp_amount = amount if amount is not None else XP_SOURCES.get(source, 0)
    if xp_amount <= 0:
        return {"awarded": False, "reason": "Invalid XP source", "source": source}

    # Check daily cap
    daily_cap = XP_DAILY_CAPS.get(source)
    if daily_cap is not None:
        today_events = await storage.query_documents(
            XP_COLLECTION,
            [
                ("user_id", "==", user_id),
                ("source", "==", source),
                ("date", "==", today),
            ],
        )
        if len(today_events) >= daily_cap:
            return {
                "awarded": False,
                "reason": f"Daily cap reached for {source} ({daily_cap}/day)",
                "source": source,
                "daily_cap": daily_cap,
            }

    # Create XP record
    xp_id = generate_id()
    record = {
        "xp_id": xp_id,
        "user_id": user_id,
        "source": source,
        "amount": xp_amount,
        "date": today,
        "team_id": team_id or "",
        "metadata": metadata or {},
        "created_at": now,
    }
    await storage.create_document(XP_COLLECTION, xp_id, record)

    # Check for new badges
    new_badges = await check_badges(user_id, team_id)

    return {
        "awarded": True,
        "xp_id": xp_id,
        "source": source,
        "amount": xp_amount,
        "total_xp": await get_total_xp(user_id),
        "new_badges": new_badges,
    }


async def get_total_xp(user_id: str) -> int:
    """Get total XP for a user."""
    storage = get_storage()
    records = await storage.query_documents(
        XP_COLLECTION, [("user_id", "==", user_id)]
    )
    return sum(r.get("amount", 0) for r in records)


async def get_xp_breakdown(user_id: str) -> Dict[str, int]:
    """Get XP grouped by source for a user."""
    storage = get_storage()
    records = await storage.query_documents(
        XP_COLLECTION, [("user_id", "==", user_id)]
    )
    breakdown: Dict[str, int] = {}
    for r in records:
        source = r.get("source", "unknown")
        breakdown[source] = breakdown.get(source, 0) + r.get("amount", 0)
    return breakdown


# ═══════════════════════════════════════════════════════════════
# Badge Operations
# ═══════════════════════════════════════════════════════════════


async def get_earned_badges(user_id: str) -> List[Dict[str, Any]]:
    """Get all badges earned by a user."""
    storage = get_storage()
    records = await storage.query_documents(
        BADGE_COLLECTION, [("user_id", "==", user_id)]
    )
    # Enrich with badge definitions
    result = []
    for r in records:
        badge_key = r.get("badge_key", "")
        badge_def = BADGES.get(badge_key, {})
        result.append({
            "badge_key": badge_key,
            "badge_name": badge_def.get("name", badge_key),
            "icon": badge_def.get("icon", "🏅"),
            "description": badge_def.get("description", ""),
            "xp_bonus": r.get("xp_bonus", 0),
            "earned_at": r.get("earned_at", ""),
        })
    return result


async def check_badges(
    user_id: str, team_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Check all badge conditions and award any newly earned badges.

    Returns a list of newly awarded badges.
    """
    storage = get_storage()
    earned = await storage.query_documents(
        BADGE_COLLECTION, [("user_id", "==", user_id)]
    )
    earned_keys = {r.get("badge_key") for r in earned}

    # Get user's XP records for checking conditions
    xp_records = await storage.query_documents(
        XP_COLLECTION, [("user_id", "==", user_id)]
    )
    total_xp = sum(r.get("amount", 0) for r in xp_records)

    # Count XP events by source
    source_counts: Dict[str, int] = {}
    for r in xp_records:
        src = r.get("source", "")
        source_counts[src] = source_counts.get(src, 0) + 1

    # Get streak info
    streak_info = await get_streak(user_id)

    new_badges = []
    now = _utcnow()

    for badge_key, badge_def in BADGES.items():
        if badge_key in earned_keys:
            continue  # Already earned

        req_type, req_value = badge_def["requirement"]
        earned_it = False

        if req_type == "total_xp":
            earned_it = total_xp >= req_value
        elif req_type == "streak":
            earned_it = (streak_info.get("current_streak", 0) or 0) >= req_value
        elif req_type == "speed_run":
            # Speed run: check if user completed onboarding quickly
            # This is triggered externally via award_xp with source="speed_run"
            earned_it = source_counts.get("speed_run", 0) > 0
        else:
            # Source-based count
            earned_it = source_counts.get(req_type, 0) >= req_value

        if earned_it:
            # Award the badge
            badge_id = generate_id()
            await storage.create_document(BADGE_COLLECTION, badge_id, {
                "badge_id": badge_id,
                "user_id": user_id,
                "badge_key": badge_key,
                "badge_name": badge_def["name"],
                "icon": badge_def["icon"],
                "description": badge_def["description"],
                "xp_bonus": badge_def["xp_bonus"],
                "team_id": team_id or "",
                "earned_at": now,
            })

            new_badges.append({
                "badge_key": badge_key,
                "badge_name": badge_def["name"],
                "icon": badge_def["icon"],
                "description": badge_def["description"],
                "xp_bonus": badge_def["xp_bonus"],
                "earned_at": now,
            })

            # Award XP bonus for badge
            if badge_def["xp_bonus"] > 0:
                bonus_id = generate_id()
                await storage.create_document(XP_COLLECTION, bonus_id, {
                    "xp_id": bonus_id,
                    "user_id": user_id,
                    "source": "badge_bonus",
                    "amount": badge_def["xp_bonus"],
                    "date": _today_str(),
                    "team_id": team_id or "",
                    "metadata": {"badge_key": badge_key},
                    "created_at": now,
                })

    return new_badges


# ═══════════════════════════════════════════════════════════════
# Streak Operations
# ═══════════════════════════════════════════════════════════════


async def record_login(user_id: str) -> Dict[str, Any]:
    """Record a daily login and update streak. Call on user authentication.

    Returns updated streak info.
    """
    storage = get_storage()
    today = _today_str()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # Check for existing streak record
    existing = await storage.query_documents(
        STREAK_COLLECTION, [("user_id", "==", user_id)]
    )

    now = _utcnow()
    if existing:
        streak_doc = existing[0]
        streak_id = streak_doc.get("streak_id")
        last_active = streak_doc.get("last_active_date", "")
        current_streak = streak_doc.get("current_streak", 0)
        longest_streak = streak_doc.get("longest_streak", 0)

        if last_active == today:
            # Already logged in today, no streak update needed
            return {
                "current_streak": current_streak,
                "longest_streak": longest_streak,
                "streak_frozen": streak_doc.get("streak_frozen", False),
                "last_active": today,
                "already_logged_today": True,
            }

        # Check if consecutive (yesterday or today)
        if last_active == yesterday:
            current_streak += 1
        else:
            # Streak broken (gap of more than 1 day)
            current_streak = 1

        longest_streak = max(longest_streak, current_streak)

        await storage.update_document(STREAK_COLLECTION, streak_id, {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "last_active_date": today,
            "updated_at": now,
        })
    else:
        # First login
        streak_id = generate_id()
        current_streak = 1
        longest_streak = 1

        await storage.create_document(STREAK_COLLECTION, streak_id, {
            "streak_id": streak_id,
            "user_id": user_id,
            "current_streak": 1,
            "longest_streak": 1,
            "last_active_date": today,
            "streak_frozen": False,
            "created_at": now,
            "updated_at": now,
        })

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "last_active": today,
    }


async def get_streak(user_id: str) -> Dict[str, Any]:
    """Get the current streak info for a user."""
    storage = get_storage()
    existing = await storage.query_documents(
        STREAK_COLLECTION, [("user_id", "==", user_id)]
    )

    if not existing:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "last_active": None,
            "streak_frozen": False,
        }

    doc = existing[0]
    return {
        "current_streak": doc.get("current_streak", 0),
        "longest_streak": doc.get("longest_streak", 0),
        "last_active": doc.get("last_active_date"),
        "streak_frozen": doc.get("streak_frozen", False),
    }


# ═══════════════════════════════════════════════════════════════
# Leaderboard Operations
# ═══════════════════════════════════════════════════════════════


async def get_leaderboard(
    team_id: str,
    period: str = "all_time",
    limit: int = 20,
) -> Dict[str, Any]:
    """Get the leaderboard for a team.

    Args:
        team_id: The team to scope the leaderboard to
        period: "all_time", "monthly", or "weekly"
        limit: Max number of entries

    Returns:
        Leaderboard data with entries sorted by XP descending.
    """
    storage = get_storage()

    # Query all XP records for this team
    all_records = await storage.query_documents(
        XP_COLLECTION, [("team_id", "==", team_id)]
    )

    # Filter by period
    now = datetime.now(timezone.utc)
    if period == "weekly":
        cutoff = now - timedelta(days=7)
        records = [
            r for r in all_records
            if datetime.fromisoformat(r.get("created_at", now.isoformat())).replace(tzinfo=timezone.utc) > cutoff
        ]
    elif period == "monthly":
        cutoff = now - timedelta(days=30)
        records = [
            r for r in all_records
            if datetime.fromisoformat(r.get("created_at", now.isoformat())).replace(tzinfo=timezone.utc) > cutoff
        ]
    else:
        records = all_records

    # Aggregate XP per user
    user_xp: Dict[str, int] = {}
    for r in records:
        uid = r.get("user_id", "")
        user_xp[uid] = user_xp.get(uid, 0) + r.get("amount", 0)

    # Sort by XP descending
    sorted_users = sorted(user_xp.items(), key=lambda x: x[1], reverse=True)

    # Build leaderboard entries
    entries = []
    for rank, (uid, xp) in enumerate(sorted_users[:limit], start=1):
        # Get user info from storage
        user_doc = await storage.get_document("users", uid)
        user_name = user_doc.get("name", uid[:8]) if user_doc else uid[:8]

        # Get badges count
        badges = await storage.query_documents(
            BADGE_COLLECTION, [("user_id", "==", uid)]
        )

        # Get streak
        streak_doc = await get_streak(uid)

        entries.append({
            "rank": rank,
            "user_id": uid,
            "name": user_name,
            "xp": xp,
            "badges_count": len(badges),
            "current_streak": streak_doc.get("current_streak", 0),
        })

    return {
        "team_id": team_id,
        "period": period,
        "entries": entries,
        "total_entries": len(user_xp),
    }


# ═══════════════════════════════════════════════════════════════
# User Summary
# ═══════════════════════════════════════════════════════════════


async def get_user_gamification_summary(
    user_id: str, team_id: Optional[str] = None
) -> Dict[str, Any]:
    """Get complete gamification summary for a user."""
    total_xp = await get_total_xp(user_id)
    breakdown = await get_xp_breakdown(user_id)
    badges = await get_earned_badges(user_id)
    streak = await get_streak(user_id)

    # Calculate level based on XP
    level = (total_xp // 250) + 1
    next_level_xp = level * 250
    current_level_xp = (level - 1) * 250
    xp_progress = total_xp - current_level_xp
    xp_needed = next_level_xp - current_level_xp

    return {
        "user_id": user_id,
        "total_xp": total_xp,
        "level": level,
        "xp_progress": xp_progress,
        "xp_needed": xp_needed,
        "xp_breakdown": breakdown,
        "badges": badges,
        "badges_count": len(badges),
        "streak": streak,
    }
