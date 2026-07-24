import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.api.v1.auth import get_current_user
from app.services.postgres_db import get_storage
from app.services import (
    team_service,
    task_service,
    gamification_service,
    notification_service,
    access_control_service,
)
from app.services.billing_service import BillingService, TIER_PRICING
from app.services.github_service import GitHubService

logger = logging.getLogger("onramp.seed")

router = APIRouter(prefix="/seed", tags=["seed"])


def _rel_time(value) -> str:
    """Render an ISO timestamp as a compact relative string (e.g. '2h', '3d')."""
    if not value:
        return ""
    try:
        if isinstance(value, datetime):
            dt = value
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        diff = datetime.now(timezone.utc) - dt
        mins = int(diff.total_seconds() // 60)
        if mins < 1:
            return "just now"
        if mins < 60:
            return f"{mins}m ago"
        hours = mins // 60
        if hours < 24:
            return f"{hours}h ago"
        return f"{hours // 24}d ago"
    except Exception:
        return ""


async def _global_stats(storage) -> dict:
    """Real counts from the database. No fabricated numbers."""
    try:
        repos = await storage.list_documents("repositories")
    except Exception as exc:
        logger.warning("Failed to list repositories for stats: %s", exc)
        repos = []
    try:
        teams = await storage.list_documents("teams")
    except Exception as exc:
        logger.warning("Failed to list teams for stats: %s", exc)
        teams = []
    try:
        users = await storage.list_documents("users")
    except Exception as exc:
        logger.warning("Failed to list users for stats: %s", exc)
        users = []
    # api_calls_24h: count real usage rows in the last 24h if the collection exists.
    api_calls = 0
    try:
        usage = await storage.list_documents("onramp_usage")
        cutoff = datetime.now(timezone.utc).timestamp() - 86400
        for u in usage:
            ts = u.get("created_at") or u.get("timestamp")
            try:
                dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                if dt.timestamp() >= cutoff:
                    api_calls += 1
            except Exception:
                continue
    except Exception as exc:
        logger.warning("Failed to count API calls: %s", exc)
        api_calls = 0
    return {
        "repos_analyzed": len(repos),
        "active_teams": len(teams),
        "total_users": len(users),
        "api_calls_24h": api_calls,
    }


async def _recent_activity(uid: str) -> list:
    """Real recent activity derived from the user's notifications."""
    try:
        notifs = await notification_service.list_notifications(uid, limit=8)
    except Exception:
        notifs = []
    activity = []
    for n in notifs:
        activity.append({
            "type": n.get("type", "notification"),
            "title": n.get("title") or n.get("message", ""),
            "time": _rel_time(n.get("created_at")),
            "status": "completed" if n.get("read") else "pending",
        })
    return activity


async def _repo_health_scores(storage) -> list:
    """Real per-repo stats from the GitHub API for tracked repositories."""
    try:
        repos = await storage.list_documents("repositories")
    except Exception:
        repos = []
    gh = GitHubService()
    scores = []
    for r in repos[:5]:
        owner, name = r.get("owner"), r.get("name")
        if not owner or not name:
            continue
        try:
            stats = await gh.get_repo_stats(owner, name)
            scores.append({
                "repo": f"{owner}/{name}",
                "score": stats.get("health_score"),
                "stars": stats.get("stars", 0),
                "open_issues": stats.get("open_issues", 0),
                "language": stats.get("language"),
            })
        except Exception:
            logger.exception("Failed to fetch stats for %s/%s", owner, name)
    return scores


async def _billing_rollup(storage) -> dict:
    """Real subscription rollup: MRR and status counts across all teams."""
    try:
        subs = await storage.list_documents(BillingService.COLLECTION)
    except Exception:
        subs = []
    mrr = 0
    by_status: dict = {"active": 0, "past_due": 0, "canceled": 0, "trialing": 0}
    by_tier: dict = {}
    for s in subs:
        status = s.get("status", "active")
        by_status[status] = by_status.get(status, 0) + 1
        tier = s.get("tier", "free")
        price = s.get("price")
        if price is None:
            price = TIER_PRICING.get(tier, TIER_PRICING["free"]).get("price_monthly", 0)
        if status == "active":
            mrr += price or 0
            by_tier[tier] = by_tier.get(tier, 0) + (price or 0)
    return {
        "mrr": mrr,
        "active_subscriptions": by_status.get("active", 0),
        "billing_summary": by_status,
        "revenue_by_tier": by_tier,
    }


async def _top_teams(storage) -> list:
    """Real team roster with member counts and task completion rates."""
    try:
        teams = await storage.list_documents("teams")
    except Exception:
        teams = []
    result = []
    for t in teams[:8]:
        team_id = t.get("team_id") or t.get("id")
        if not team_id:
            continue
        try:
            members = await team_service.get_team_members(team_id)
        except Exception:
            members = []
        try:
            progress = await task_service.get_team_progress(team_id)
        except Exception:
            progress = {"total": 0, "completed": 0}
        total = progress.get("total", 0)
        completed = progress.get("completed", 0)
        result.append({
            "name": t.get("name", "Team"),
            "members": len(members),
            "completion_rate": round((completed / total) * 100) if total else 0,
            "velocity": completed,
        })
    return result


async def _review_items(storage, team_ids: list) -> list:
    """Real tasks awaiting review across the user's teams."""
    items = []
    for team_id in team_ids:
        try:
            for state in ("submitted", "under_review", "needs_changes"):
                tasks = await task_service.list_tasks(team_id=team_id, state=state)
                for t in tasks:
                    items.append({
                        "pr_title": t.get("title", "Untitled task"),
                        "author": t.get("assigned_to", "unassigned"),
                        "status": t.get("state", state),
                        "priority": t.get("priority", "medium"),
                        "age": _rel_time(t.get("created_at")),
                    })
        except Exception:
            logger.exception("Failed to load review items for team %s", team_id)
    return items


@router.get("/role-data")
async def get_seed_role_data(user=Depends(get_current_user)):
    """Return real, role-appropriate dashboard data sourced from the database
    and the GitHub API. No mock constants — empty/zero states reflect an empty
    workspace truthfully."""
    storage = get_storage()
    uid = user["uid"]

    teams = []
    try:
        teams = await team_service.get_user_teams(uid)
    except Exception:
        logger.exception("Failed to load teams for user %s", uid)
    team_ids = [t.get("team_id") or t.get("id") for t in teams if (t.get("team_id") or t.get("id"))]
    primary_team = team_ids[0] if team_ids else None

    # Resolve role from the user's first membership.
    role = "member"
    try:
        memberships = await storage.query_documents(
            "team_members", [("user_id", "==", uid)]
        )
        if memberships:
            role = memberships[0].get("role", "member")
    except Exception:
        logger.exception("Failed to resolve role for user %s", uid)

    stats = await _global_stats(storage)
    base_data = {"stats": stats}

    if role in ("developer",):
        data = {
            **base_data,
            "recent_activity": await _recent_activity(uid),
            "system_health": await _system_health(storage),
            "pending_reviews": sum(
                (await task_service.get_team_progress(tid)).get("pending_review", 0)
                for tid in team_ids
            ) if team_ids else 0,
            "open_incidents": 0,
        }
        portal = "dev"

    elif role in ("owner",):
        billing = await _billing_rollup(storage)
        data = {
            **base_data,
            **billing,
            "top_teams": await _top_teams(storage),
            "recent_audit_events": await _recent_activity(uid),
        }
        portal = "executive"

    elif role in ("senior",):
        review_items = await _review_items(storage, team_ids)
        team_progress = []
        for tid in team_ids:
            try:
                members = await team_service.get_team_members(tid)
                for m in members:
                    prog = await task_service.get_user_progress(m.get("user_id", ""), tid)
                    team_progress.append({
                        "name": m.get("name") or m.get("email", "Member"),
                        "completion": prog.get("completion_rate", 0),
                        "role": m.get("role", "member"),
                    })
            except Exception:
                logger.exception("Failed to load team progress for %s", tid)
        data = {
            **base_data,
            "pending_reviews": len(review_items),
            "review_items": review_items,
            "repo_health_scores": await _repo_health_scores(storage),
            "team_progress": team_progress,
            "active_mentees": len(team_progress),
            "open_tasks": sum(
                (await task_service.get_team_progress(tid)).get("in_progress", 0)
                for tid in team_ids
            ) if team_ids else 0,
        }
        portal = "senior"

    else:  # member / new developer onboarding
        try:
            progress = await task_service.get_user_progress(uid, primary_team)
        except Exception:
            progress = {"total": 0, "completed": 0}
        try:
            streak = await gamification_service.get_streak(uid)
        except Exception:
            streak = {"current_streak": 0}
        modules = []
        if primary_team:
            try:
                perms = await access_control_service.get_user_modules(primary_team, uid)
                modules = [{
                    "name": p.get("module", "module"),
                    "progress": 0,
                    "status": "unlocked",
                } for p in perms]
            except Exception:
                logger.exception("Failed to load modules for user %s", uid)
        completed = progress.get("completed", 0)
        total = progress.get("total", 0)
        data = {
            "welcome_name": user.get("name") or user.get("email", "Developer"),
            "checklist": [
                {"id": "explore", "label": "Explore the repository architecture",
                 "done": stats["repos_analyzed"] > 0},
                {"id": "learn", "label": "Start your learning path",
                 "done": len(modules) > 0},
                {"id": "first_issue", "label": "Find and claim your first issue",
                 "done": progress.get("total", 0) > 0},
                {"id": "first_pr", "label": "Submit your first PR",
                 "done": completed > 0},
                {"id": "profile", "label": "Complete your profile",
                 "done": bool(user.get("name"))},
                {"id": "team", "label": "Join a team", "done": len(teams) > 0},
            ],
            "learning_modules": modules,
            "recent_activity": await _recent_activity(uid),
            "completed_tasks": completed,
            "total_tasks": total,
            "streak_days": streak.get("current_streak", 0),
        }
        portal = "onboarding"

    return {"portal": portal, "data": data, "role": role}


async def _system_health(storage) -> list:
    """Real health probes for core services. Latency/uptime are omitted rather
    than fabricated — only live up/down status is reported."""
    health = []

    # API server: if this handler runs, the API is up.
    health.append({"service": "API Server", "status": "healthy"})

    # PostgreSQL: probe with a trivial listing.
    try:
        await storage.list_documents("users")
        health.append({"service": "PostgreSQL", "status": "healthy"})
    except Exception:
        health.append({"service": "PostgreSQL", "status": "down"})

    # Redis cache: probe via the cache service if configured.
    try:
        from app.services.cache_service import cache_service  # type: ignore
        ok = await cache_service.ping()
        health.append({"service": "Redis Cache", "status": "healthy" if ok else "degraded"})
    except Exception:
        health.append({"service": "Redis Cache", "status": "unavailable"})

    # LLM router: healthy if at least one provider key is configured.
    import os
    llm_keys = any(os.getenv(k) for k in (
        "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
        "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    ))
    health.append({"service": "LLM Router", "status": "healthy" if llm_keys else "unconfigured"})

    return health
