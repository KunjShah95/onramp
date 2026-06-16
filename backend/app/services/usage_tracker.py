from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
from app.services.firestore_db import get_storage, generate_id


class UsageTracker:
    COLLECTION = "codeflow_usage"

    def __init__(self):
        self.storage = get_storage()
        self._local_cache: Dict[str, int] = defaultdict(int)

    async def track(self, org_name: str, endpoint: str, credits: int = 1, api_key_id: Optional[str] = None) -> Dict[str, Any]:
        now = datetime.now()
        period_key = now.strftime("%Y-%m")

        entry_id = generate_id()
        entry = {
            "org_name": org_name,
            "endpoint": endpoint,
            "credits": credits,
            "api_key_id": api_key_id or "",
            "timestamp": now.isoformat(),
            "period": period_key,
        }
        await self.storage.create_document(self.COLLECTION, entry_id, entry)
        self._local_cache[f"{org_name}:{period_key}"] += credits
        return entry

    async def get_usage(self, org_name: str, period: Optional[str] = None) -> Dict[str, Any]:
        if not period:
            period = datetime.now().strftime("%Y-%m")

        docs = await self.storage.query_documents(
            self.COLLECTION,
            [("org_name", "==", org_name), ("period", "==", period)],
        )
        total_credits = sum(d.get("credits", 0) for d in docs)
        endpoint_breakdown: Dict[str, int] = defaultdict(int)
        for d in docs:
            ep = d.get("endpoint", "unknown")
            endpoint_breakdown[ep] += d.get("credits", 0)

        return {
            "org_name": org_name,
            "period": period,
            "total_credits": total_credits,
            "total_requests": len(docs),
            "endpoint_breakdown": dict(endpoint_breakdown),
        }

    async def get_org_summary(self, org_name: str) -> Dict[str, Any]:
        docs = await self.storage.query_documents(
            self.COLLECTION,
            [("org_name", "==", org_name)],
        )
        total_credits = sum(d.get("credits", 0) for d in docs)
        period_breakdown: Dict[str, int] = defaultdict(int)
        for d in docs:
            period_breakdown[d.get("period", "unknown")] += d.get("credits", 0)

        return {
            "org_name": org_name,
            "lifetime_credits": total_credits,
            "lifetime_requests": len(docs),
            "period_breakdown": dict(period_breakdown),
        }

    async def check_quota(self, org_name: str, tier_limits: Dict[str, int]) -> Dict[str, bool]:
        period = datetime.now().strftime("%Y-%m")
        usage = await self.get_usage(org_name, period)
        monthly_limit = tier_limits.get("credits_per_month", 50)
        remaining = monthly_limit - usage["total_credits"]
        return {
            "within_quota": remaining > 0,
            "credits_used": usage["total_credits"],
            "credits_remaining": max(0, remaining),
            "monthly_limit": monthly_limit,
        }
