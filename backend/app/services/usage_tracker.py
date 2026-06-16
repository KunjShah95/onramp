"""
Usage Tracker Service - PostgreSQL backend
Tracks API usage for billing and analytics
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from app.services.postgres_db import get_storage, generate_id


async def track_usage(
    user_id: Optional[str],
    team_id: Optional[str],
    endpoint: str,
    method: str,
    status_code: int,
    response_time_ms: int,
    tokens_used: int = 0,
    cost_usd: float = 0.0,
    metadata: Optional[Dict[str, Any]] = None,
) -> dict:
    """Record a usage entry"""
    storage = get_storage()

    data = {
        "user_id": user_id,
        "team_id": team_id,
        "endpoint": endpoint,
        "method": method,
        "status_code": status_code,
        "response_time_ms": response_time_ms,
        "tokens_used": tokens_used,
        "cost_usd": cost_usd,
        "metadata": metadata or {},
    }

    record = await storage.create_document("usage_records", generate_id(), data)
    return record


async def get_usage_by_user(
    user_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[dict]:
    """Get usage records for a user"""
    storage = get_storage()

    filters = [("user_id", "==", user_id)]

    if start_date:
        filters.append(("created_at", ">=", start_date.isoformat()))
    if end_date:
        filters.append(("created_at", "<=", end_date.isoformat()))

    return await storage.query_documents("usage_records", filters)


async def get_usage_by_team(
    team_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[dict]:
    """Get usage records for a team"""
    storage = get_storage()

    filters = [("team_id", "==", team_id)]

    if start_date:
        filters.append(("created_at", ">=", start_date.isoformat()))
    if end_date:
        filters.append(("created_at", "<=", end_date.isoformat()))

    return await storage.query_documents("usage_records", filters)


async def get_total_usage(
    user_id: Optional[str] = None,
    team_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> dict:
    """Get aggregated usage statistics"""
    records = []

    if user_id:
        records = await get_usage_by_user(user_id, start_date, end_date)
    elif team_id:
        records = await get_usage_by_team(team_id, start_date, end_date)

    total_requests = len(records)
    total_tokens = sum(r.get("tokens_used", 0) for r in records)
    total_cost = sum(r.get("cost_usd", 0.0) for r in records)
    avg_response_time = (
        sum(r.get("response_time_ms", 0) for r in records) / total_requests
        if total_requests > 0
        else 0
    )

    return {
        "total_requests": total_requests,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost,
        "avg_response_time_ms": round(avg_response_time, 2),
    }


class UsageTracker:
    """Class-based wrapper exposing the usage operations ai_gateway expects."""

    async def track(self, org_name: str, endpoint: str, credits: int) -> dict:
        """Track usage for an org."""
        await track_usage(
            user_id=None,
            team_id=org_name,
            endpoint=endpoint,
            method="POST",
            status_code=200,
            response_time_ms=0,
            tokens_used=credits,
            cost_usd=0.0
        )
        return {
            "org_name": org_name,
            "credits": credits,
            "endpoint": endpoint
        }

    async def get_usage(self, org_name: str, period: Optional[str] = None) -> dict:
        """Return usage for an org (team) over a period."""
        now = datetime.utcnow()
        if period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "day":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start = now - timedelta(days=7)
        else:
            start = None

        records = await get_usage_by_team(org_name, start_date=start)
        total_requests = len(records)
        total_credits = sum(r.get("tokens_used", 0) for r in records)

        endpoint_breakdown = {}
        for r in records:
            ep = r.get("endpoint", "unknown")
            endpoint_breakdown[ep] = endpoint_breakdown.get(ep, 0) + 1

        return {
            "org_name": org_name,
            "period": period or "all",
            "total_credits": total_credits,
            "total_requests": total_requests,
            "endpoint_breakdown": endpoint_breakdown,
        }

    async def get_org_summary(self, org_name: str) -> dict:
        """Return a high-level usage summary for an org."""
        usage = await self.get_usage(org_name, period="month")
        return {
            "org_name": org_name,
            "total_requests": usage["total_requests"],
            "total_credits": usage["total_credits"],
            "endpoint_breakdown": usage["endpoint_breakdown"],
        }

    async def check_quota(self, org_name: str, limits: dict) -> dict:
        """Check whether an org is within its quota."""
        usage = await self.get_usage(org_name, period="month")
        total = usage["total_requests"]
        monthly_limit = limits.get("credits_per_month", limits.get("requests_per_month", 0))
        within_quota = total < monthly_limit if monthly_limit else True
        remaining = max(0, monthly_limit - total) if monthly_limit else -1
        return {
            "org_name": org_name,
            "within_quota": within_quota,
            "monthly_limit": monthly_limit,
            "used": total,
            "remaining": remaining,
        }
