"""Feedback capture — the entry point of the self-learning loop.

Every AI surface (ask, explore, learn, PR review, quiz, digest) can record a
thumbs up/down plus optional free-text and context (index_id, question, answer
preview, etc.). Consumers: eval-set curation, prompt A/B scoring, router
learning, per-feature quality dashboards.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.services.postgres_db import get_storage, generate_id

# AI surfaces that can receive feedback; keep in sync with frontend widgets.
FEEDBACK_FEATURES = {
    "ask", "explore", "learn", "pr_review", "quiz",
    "digest", "first_pr", "report", "playbook",
}


class FeedbackService:
    COLLECTION = "codeflow_feedback"

    def __init__(self):
        self.storage = get_storage()

    async def add_feedback(
        self,
        user_id: str,
        feature: str,
        rating: int,
        context: Optional[Dict[str, Any]] = None,
        comment: Optional[str] = None,
    ) -> Dict[str, Any]:
        if feature not in FEEDBACK_FEATURES:
            raise ValueError(
                f"Unknown feature '{feature}'. Expected one of: {sorted(FEEDBACK_FEATURES)}"
            )
        if rating not in (1, -1):
            raise ValueError("rating must be 1 (thumbs up) or -1 (thumbs down)")

        record = {
            "user_id": user_id,
            "feature": feature,
            "rating": rating,
            "context": context or {},
            "comment": (comment or "")[:2000] or None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return await self.storage.create_document(self.COLLECTION, generate_id(), record)

    async def _query(self, feature: Optional[str] = None) -> List[dict]:
        filters = [("feature", "==", feature)] if feature else []
        return await self.storage.query_documents(self.COLLECTION, filters)

    async def stats(self, feature: Optional[str] = None, days: int = 30) -> Dict[str, Any]:
        """Aggregate thumbs per feature over the trailing window."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        records = [
            r for r in await self._query(feature)
            if r.get("created_at", "") >= cutoff
        ]

        by_feature: Dict[str, Dict[str, int]] = {}
        for r in records:
            bucket = by_feature.setdefault(r["feature"], {"up": 0, "down": 0})
            bucket["up" if r.get("rating", 0) > 0 else "down"] += 1

        up = sum(b["up"] for b in by_feature.values())
        down = sum(b["down"] for b in by_feature.values())
        return {
            "window_days": days,
            "total": up + down,
            "up": up,
            "down": down,
            "satisfaction": round(up / (up + down), 3) if (up + down) else None,
            "by_feature": by_feature,
        }

    async def recent(self, feature: Optional[str] = None, limit: int = 50) -> List[dict]:
        """Most recent feedback entries, newest first (for review/curation)."""
        records = await self._query(feature)
        records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        return records[:limit]
