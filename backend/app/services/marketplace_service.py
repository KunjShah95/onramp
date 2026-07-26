"""Community playbook marketplace.

Lets teams publish their onboarding playbooks to a shared, searchable catalog,
import listings into their own team, and rate what they use. Listings and
ratings live in flexible ``DynamicDocument`` collections so the marketplace can
evolve without a schema migration; imports round-trip through the existing
``PlaybookService`` so imported playbooks are ordinary team playbooks.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.postgres_db import get_storage, generate_id
from app.services.playbook_service import PlaybookService

logger = logging.getLogger("onramp.marketplace")

LISTINGS = "marketplace_playbooks"
RATINGS = "marketplace_ratings"

_SORTS = {"popular", "top_rated", "newest"}


def _now_iso() -> str:
    """ISO-8601 UTC string. Marketplace docs live in JSONB, which can't hold
    native datetime objects — always store timestamps as strings."""
    return datetime.now(timezone.utc).isoformat()


class MarketplaceService:
    def __init__(self):
        self.storage = get_storage()
        self.playbooks = PlaybookService()

    # ── Publish ─────────────────────────────────────────────────────────────

    async def publish(
        self, source_playbook_id: str, publisher_id: str, publisher_name: str = ""
    ) -> Dict[str, Any]:
        """Publish an existing team playbook to the public marketplace.

        Idempotent per source playbook: re-publishing refreshes the existing
        listing instead of creating a duplicate.
        """
        pb = await self.playbooks.get_playbook(source_playbook_id)
        if not pb:
            raise ValueError("Playbook not found")

        existing = await self._listing_for_source(source_playbook_id)
        now = _now_iso()
        snapshot = {
            "title": pb.get("title", "Untitled"),
            "description": pb.get("description", ""),
            "steps": pb.get("steps", []),
            "tags": pb.get("tags", []),
            "updated_at": now,
        }

        if existing:
            await self._merge_update(LISTINGS, existing["id"], snapshot)
            return await self.get_listing(existing["id"])

        listing_id = generate_id()
        listing = {
            "listing_id": listing_id,
            "source_playbook_id": source_playbook_id,
            "publisher_id": publisher_id,
            "publisher_name": publisher_name or "A team",
            "origin_team_id": pb.get("team_id"),
            "import_count": 0,
            "rating_avg": 0.0,
            "rating_count": 0,
            "is_public": True,
            "published_at": now,
            **snapshot,
        }
        await self.storage.create_document(LISTINGS, listing_id, listing)
        return listing

    async def unpublish(self, listing_id: str, requester_id: str) -> bool:
        """Remove a listing. Only the original publisher may unpublish."""
        listing = await self.get_listing(listing_id)
        if not listing:
            return False
        if listing.get("publisher_id") != requester_id:
            raise PermissionError("Only the publisher can unpublish this listing")
        await self.storage.delete_document(LISTINGS, listing_id)
        return True

    # ── Discover ────────────────────────────────────────────────────────────

    async def list_listings(
        self,
        search: str = "",
        tag: str = "",
        sort: str = "popular",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        rows = await self.storage.query_documents(LISTINGS, [("is_public", "==", True)])
        listings = [self._flatten(r) for r in rows]

        if search:
            q = search.lower()
            listings = [
                l for l in listings
                if q in (l.get("title", "").lower() + " " + l.get("description", "").lower())
            ]
        if tag:
            t = tag.lower()
            listings = [l for l in listings if t in [str(x).lower() for x in l.get("tags", [])]]

        sort = sort if sort in _SORTS else "popular"
        if sort == "top_rated":
            listings.sort(key=lambda l: (l.get("rating_avg", 0), l.get("rating_count", 0)), reverse=True)
        elif sort == "newest":
            listings.sort(key=lambda l: str(l.get("published_at", "")), reverse=True)
        else:  # popular
            listings.sort(key=lambda l: l.get("import_count", 0), reverse=True)

        return listings[:limit]

    async def get_listing(self, listing_id: str) -> Optional[Dict[str, Any]]:
        row = await self.storage.get_document(LISTINGS, listing_id)
        return self._flatten(row) if row else None

    # ── Import ──────────────────────────────────────────────────────────────

    async def import_listing(
        self, listing_id: str, team_id: str, user_id: str
    ) -> Dict[str, Any]:
        """Copy a marketplace listing into a team as a normal playbook."""
        listing = await self.get_listing(listing_id)
        if not listing:
            raise ValueError("Listing not found")

        steps = listing.get("steps", [])
        tags = list(listing.get("tags", []))
        if "imported" not in tags:
            tags.append("imported")

        playbook = await self.playbooks.create_playbook(
            team_id=team_id,
            title=listing.get("title", "Imported playbook"),
            description=listing.get("description", ""),
            steps=steps,
            created_by=user_id,
            tags=tags,
        )
        await self._bump_import_count(listing_id)
        return {"imported_playbook": playbook, "listing_id": listing_id}

    # ── Rate ────────────────────────────────────────────────────────────────

    async def rate_listing(
        self, listing_id: str, user_id: str, rating: int, comment: str = ""
    ) -> Dict[str, Any]:
        if rating < 1 or rating > 5:
            raise ValueError("Rating must be between 1 and 5")
        listing = await self.get_listing(listing_id)
        if not listing:
            raise ValueError("Listing not found")

        now = _now_iso()
        existing = await self._rating_by_user(listing_id, user_id)
        if existing:
            await self._merge_update(
                RATINGS, existing["id"], {"rating": rating, "comment": comment, "updated_at": now}
            )
        else:
            rid = generate_id()
            await self.storage.create_document(RATINGS, rid, {
                "rating_id": rid,
                "listing_id": listing_id,
                "user_id": user_id,
                "rating": rating,
                "comment": comment,
                "created_at": now,
            })

        return await self._recompute_rating(listing_id)

    async def list_ratings(self, listing_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        rows = await self.storage.query_documents(RATINGS, [("listing_id", "==", listing_id)])
        ratings = [self._flatten(r) for r in rows]
        ratings.sort(key=lambda r: str(r.get("created_at", "")), reverse=True)
        return ratings[:limit]

    # ── Internal ────────────────────────────────────────────────────────────

    async def _listing_for_source(self, source_playbook_id: str) -> Optional[Dict[str, Any]]:
        rows = await self.storage.query_documents(
            LISTINGS, [("source_playbook_id", "==", source_playbook_id)]
        )
        return rows[0] if rows else None

    async def _rating_by_user(self, listing_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        rows = await self.storage.query_documents(
            RATINGS, [("listing_id", "==", listing_id), ("user_id", "==", user_id)]
        )
        return rows[0] if rows else None

    async def _bump_import_count(self, listing_id: str) -> None:
        listing = await self.storage.get_document(LISTINGS, listing_id)
        if listing:
            current = self._flatten(listing).get("import_count", 0)
            await self._merge_update(LISTINGS, listing_id, {"import_count": current + 1})

    async def _recompute_rating(self, listing_id: str) -> Dict[str, Any]:
        rows = await self.storage.query_documents(RATINGS, [("listing_id", "==", listing_id)])
        scores = [self._flatten(r).get("rating", 0) for r in rows]
        count = len(scores)
        avg = round(sum(scores) / count, 2) if count else 0.0
        await self._merge_update(LISTINGS, listing_id, {"rating_avg": avg, "rating_count": count})
        return {"rating_avg": avg, "rating_count": count}

    async def _merge_update(self, collection: str, doc_id: str, changes: Dict[str, Any]) -> None:
        """Merge *changes* into an existing document.

        ``update_document`` REPLACES the whole JSONB payload for
        DynamicDocument-backed collections, so a partial update would silently
        drop every other field. Read-merge-write preserves the full record.
        """
        current = await self.storage.get_document(collection, doc_id)
        base = self._flatten(current) if current else {}
        for wrapper_key in ("id", "collection", "created_at", "updated_at"):
            base.pop(wrapper_key, None)
        base.update(changes)
        await self.storage.update_document(collection, doc_id, base)

    @staticmethod
    def _flatten(row: Dict[str, Any]) -> Dict[str, Any]:
        """DynamicDocument.to_dict() nests payload under ``data`` and adds ``id``.
        Physical-table rows are already flat. Normalize both to a flat dict."""
        if row is None:
            return {}
        if isinstance(row.get("data"), dict):
            merged = {**row["data"]}
            merged.setdefault("id", row.get("id"))
            return merged
        return row
