"""
Analytics Tasks — Data aggregation and computation for dashboards.

Routed to the 'analytics-tasks' queue. These tasks aggregate raw data into
cached summary collections that dashboards and reports can query quickly.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from celery import shared_task

logger = logging.getLogger("onramp.tasks.analytics")


# ── Usage Aggregation ────────────────────────────────────────────────────────

@shared_task(
    queue="analytics-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def aggregate_daily_usage(self) -> dict:
    """Compute and cache daily usage aggregates for all teams.

    Intended to run nightly via Celery Beat.
    """
    import asyncio
    from app.services.postgres_db import get_storage

    async def _run() -> dict:
        storage = get_storage()
        now = datetime.now(timezone.utc)
        yesterday = now - timedelta(days=1)

        # Fetch all usage records from yesterday
        records = await storage.query_documents(
            "usage_records",
            [("created_at", ">=", yesterday.isoformat())],
        )

        # Aggregate per team
        team_totals: dict = {}
        for r in records:
            tid = r.get("team_id", "unknown")
            if tid not in team_totals:
                team_totals[tid] = {
                    "team_id": tid,
                    "requests": 0,
                    "tokens": 0,
                    "cost": 0.0,
                }
            team_totals[tid]["requests"] += 1
            team_totals[tid]["tokens"] += r.get("tokens_used", 0)
            team_totals[tid]["cost"] += r.get("cost_usd", 0.0)

        # Store each team's aggregate
        for tid, agg in team_totals.items():
            agg_id = f"daily_{yesterday.strftime('%Y%m%d')}_{tid}"
            try:
                await storage.create_document("usage_aggregates", agg_id, {
                    **agg,
                    "date": yesterday.strftime("%Y-%m-%d"),
                    "period": "daily",
                    "created_at": now.isoformat(),
                })
            except Exception:
                logger.warning("Aggregate already exists for %s, updating", tid)
                await storage.update_document("usage_aggregates", agg_id, {
                    **agg,
                    "updated_at": now.isoformat(),
                })

        return {
            "period": yesterday.strftime("%Y-%m-%d"),
            "teams_aggregated": len(team_totals),
            "total_records": len(records),
        }

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Daily usage aggregation failed")
        raise self.retry(exc=exc)
    finally:
        loop.close()


# ── Leaderboard Refresh ──────────────────────────────────────────────────────

@shared_task(
    queue="analytics-tasks",
    bind=True,
    max_retries=2,
)
def refresh_leaderboard(
    self,
    team_id: str,
    period: str = "all_time",
) -> dict:
    """Refresh cached leaderboard for a team."""
    import asyncio
    from app.services.gamification_service import get_leaderboard

    async def _run() -> dict:
        result = await get_leaderboard(team_id, period=period)
        return result

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Leaderboard refresh failed for team %s", team_id)
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="analytics-tasks",
    bind=True,
    max_retries=2,
)
def refresh_all_leaderboards(self) -> dict:
    """Refresh leaderboards for all teams. Intended for periodic execution."""
    import asyncio
    from app.services.postgres_db import get_storage

    async def _run() -> dict:
        storage = get_storage()
        teams = await storage.list_documents("teams")
        refreshed = 0

        for team in teams:
            tid = team.get("id") or team.get("team_id")
            if not tid:
                continue
            try:
                from app.services.gamification_service import get_leaderboard
                await get_leaderboard(tid)
                refreshed += 1
            except Exception:
                logger.exception("Leaderboard refresh failed for team %s", tid)

        return {"teams_refreshed": refreshed, "total_teams": len(teams)}

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Bulk leaderboard refresh failed")
        raise self.retry(exc=exc)
    finally:
        loop.close()


# ── Team Dashboard Cache ─────────────────────────────────────────────────────

@shared_task(
    queue="analytics-tasks",
    bind=True,
    max_retries=2,
)
def refresh_team_dashboard_cache(self, team_id: str) -> dict:
    """Pre-compute and cache dashboard metrics for a team."""
    import asyncio
    from app.services.postgres_db import get_storage

    async def _run() -> dict:
        storage = get_storage()
        now = datetime.now(timezone.utc).isoformat()

        # Fetch tasks for this team
        tasks = await storage.query_documents(
            "workflow_tasks",
            [("team_id", "==", team_id)],
        )

        total = len(tasks)
        completed = sum(1 for t in tasks if t.get("state") in ("completed", "approved"))
        in_progress = sum(1 for t in tasks if t.get("state") == "in_progress")
        needs_review = sum(1 for t in tasks if t.get("state") in ("submitted", "under_review"))
        needs_changes = sum(1 for t in tasks if t.get("state") == "needs_changes")

        cache = {
            "team_id": team_id,
            "total_tasks": total,
            "completed_tasks": completed,
            "in_progress_tasks": in_progress,
            "needs_review_tasks": needs_review,
            "needs_changes_tasks": needs_changes,
            "completion_rate": round((completed / total * 100) if total else 0, 1),
            "computed_at": now,
        }

        await storage.create_document("dashboard_cache", f"team_{team_id}", cache)
        return cache

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Dashboard cache refresh failed for team %s", team_id)
        raise self.retry(exc=exc)
    finally:
        loop.close()
