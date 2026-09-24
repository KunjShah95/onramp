"""Architecture snapshot store — durable, permanent repo graphs.

The interactive architecture graph used to live only in React state on
``/explore`` and in Redis (24h TTL). This service makes it *permanent*:

* every successful analysis is persisted to the ``repo_analyses`` collection
  (Postgres ``dynamic_documents``) keyed by ``(repo_url, branch, commit)`` so
  a page reload, a new session, or a different teammate sees the same graph;
* snapshots survive Redis restarts and TTL expiry — Redis stays a fast
  cache, the database becomes the source of truth;
* the push webhook / nightly sweep append a new snapshot per commit, giving
  the UI an "updated to <sha>" history instead of a fabricated "live" badge.

Design notes
------------
* Collection is deliberately an un-migrated fallback collection (handled by
  :class:`DynamicDocument`), so no Alembic migration is required and the
  memory backend used by tests works unchanged.
* ``query_documents`` on the fallback path only supports ``==`` / ``in``
  filters, so ranking/limits are applied in Python after the fetch.
* Every method is defensive: a storage failure must never break analysis or
  a webhook response.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.architecture_store")

COLLECTION = "repo_analyses"
# How many snapshots to keep per repository (history is bounded; the latest
# is what the UI renders, older ones back the "what changed" timeline).
MAX_SNAPSHOTS_PER_REPO = int(os.getenv("REPO_ANALYSIS_HISTORY", "20"))

_BUILDING_PREFIX = "repo:graph:building"
_BUILDING_TTL = int(os.getenv("REPO_GRAPH_BUILDING_TTL", "900"))
_LOCAL_BUILDING: Dict[str, float] = {}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_repo_url(repo_url: str) -> Tuple[str, str]:
    """Return ``(owner, name)`` for a repo URL, best-effort.

    Handles ``https://github.com/owner/name(.git)`` and bare ``owner/name``.
    Returns ``("", "")`` when nothing usable is present.
    """
    if not repo_url:
        return "", ""
    raw = repo_url.strip().rstrip("/")
    if raw.endswith(".git"):
        raw = raw[:-4]
    if "://" not in raw and "/" in raw and " " not in raw:
        parts = [p for p in raw.split("/") if p]
    else:
        path = urlparse(raw).path
        parts = [p for p in path.split("/") if p]
    if len(parts) >= 2:
        return parts[-2], parts[-1]
    return "", ""


def _snapshot_id(repo_url: str, branch: str, commit: Optional[str]) -> Optional[str]:
    """Deterministic id for a commit-pinned snapshot (None when no commit)."""
    if not commit:
        return None
    raw = f"{repo_url.strip().rstrip('/')}|{branch}|{commit}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _sort_key(doc: Dict[str, Any]) -> str:
    return str(doc.get("built_at") or doc.get("created_at") or "")


def _result_to_snapshot(
    result: Dict[str, Any],
    *,
    repo_url: str,
    branch: str,
    source: str,
    team_id: Optional[str] = None,
    repo_id: Optional[str] = None,
    index_id: Optional[str] = None,
    commit: Optional[str] = None,
    evolution: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Project an architecture result (or cached graph) into a snapshot doc."""
    owner, name = parse_repo_url(repo_url)
    entities = result.get("entities") or {}
    stats = {
        "file_count": len(entities.get("files", []) or []),
        "class_count": len(entities.get("classes", []) or []),
        "function_count": len(entities.get("functions", []) or []),
        "import_count": len(entities.get("imports", []) or []),
    }
    # Prefer an explicitly supplied stats block (repo-context index) when the
    # full entities dict isn't carried on the result.
    if isinstance(result.get("stats"), dict):
        stats.update({k: v for k, v in result["stats"].items() if v is not None})

    # Live analysis wraps the graph under ``graph`` while webhook/index saves
    # pass the graph object directly. Preserve the canonical graph in either
    # shape so a persisted snapshot renders the same nodes and edges as the
    # live response.
    graph = result.get("graph")
    if not isinstance(graph, dict) or not graph:
        graph = result

    return {
        "repo_url": repo_url,
        "owner": owner,
        "name": name,
        "branch": branch,
        "team_id": team_id,
        "repo_id": repo_id,
        "index_id": index_id,
        "commit": commit,
        "architecture_pattern": result.get("architecture_pattern") or "unknown",
        "services": result.get("services") or [],
        "dependencies": graph.get("dependencies") or result.get("dependencies") or {},
        "circular_dependencies": graph.get("circular_dependencies") or result.get("circular_dependencies") or [],
        "architecture_diagram": graph.get("architecture_diagram") or result.get("architecture_diagram") or "",
        "graph": {
            "modules": graph.get("modules") or result.get("modules") or [],
            "dependencies": graph.get("dependencies") or result.get("dependencies") or {},
            "node_files": graph.get("node_files") or result.get("node_files") or {},
        },
        "is_collapsed": bool(result.get("is_collapsed")),
        "analysis": result.get("analysis") or {},
        "stats": stats,
        "evolution": evolution or result.get("evolution") or {},
        "source": source,
        "built_at": _iso_now(),
    }


class ArchitectureStore:
    """Persist and read durable architecture snapshots."""

    # ── Write ────────────────────────────────────────────────────────────

    async def save(
        self,
        result: Dict[str, Any],
        *,
        repo_url: str,
        branch: str = "main",
        source: str = "explore",
        team_id: Optional[str] = None,
        repo_id: Optional[str] = None,
        index_id: Optional[str] = None,
        commit: Optional[str] = None,
        evolution: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Persist one snapshot. Returns the stored doc, or None on failure.

        Commit-pinned snapshots upsert (same repo+branch+commit overwrites),
        so repeated webhook deliveries don't duplicate rows.
        """
        if not repo_url:
            return None
        doc = _result_to_snapshot(
            result,
            repo_url=repo_url,
            branch=branch,
            source=source,
            team_id=team_id,
            repo_id=repo_id,
            index_id=index_id,
            commit=commit,
            evolution=evolution,
        )
        try:
            storage = get_storage()
            doc_id = _snapshot_id(repo_url, branch, commit)
            if doc_id:
                existing = await storage.get_document(COLLECTION, doc_id)
                if existing:
                    stored = await storage.update_document(COLLECTION, doc_id, doc)
                    return stored or {**doc, "id": doc_id}
                stored = await storage.create_document(COLLECTION, doc_id, doc)
            else:
                from app.services.postgres_db import generate_id

                doc_id = generate_id()
                stored = await storage.create_document(COLLECTION, doc_id, doc)
            await self._touch_repository(doc)
            await self._prune(repo_url, branch)
            return stored
        except Exception:
            logger.exception("Failed to persist architecture snapshot for %s", repo_url)
            return None

    async def save_from_index(
        self,
        index_doc: Dict[str, Any],
        *,
        source: str = "webhook",
        team_id: Optional[str] = None,
        repo_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Persist a snapshot from a repo-context index document.

        The cached index already carries ``graph`` (services, dependencies,
        pattern) and ``evolution`` (recent commits, changed files) — no
        re-clone and no LLM call needed. This is what makes commit-driven
        updates cheap enough to run on every push.
        """
        graph = index_doc.get("graph") or {}
        repo_url = index_doc.get("repo_url") or ""
        if not repo_url or not graph:
            return None
        if repo_id is None or team_id is None:
            owner, name = parse_repo_url(repo_url)
            try:
                if owner and name:
                    rows = await get_storage().query_documents(
                        "repositories", [("owner", "==", owner), ("name", "==", name)]
                    )
                    if rows:
                        repo_id = repo_id or rows[0].get("id")
                        team_id = team_id or rows[0].get("team_id")
            except Exception:
                logger.debug("Could not resolve repo row for %s", repo_url, exc_info=True)
        return await self.save(
            graph,
            repo_url=repo_url,
            branch=index_doc.get("branch") or "main",
            source=source,
            team_id=team_id,
            repo_id=repo_id,
            index_id=index_doc.get("index_id"),
            commit=index_doc.get("commit"),
            evolution=index_doc.get("evolution") or {},
        )

    async def save_from_analyze(
        self,
        result: Dict[str, Any],
        *,
        repo_url: str,
        branch: str = "main",
        index_id: Optional[str] = None,
        source: str = "explore",
    ) -> Optional[Dict[str, Any]]:
        """Persist the result of an ``/explore/analyze`` call.

        Resolves the registered repository (for team/repo scoping) and, when
        a repo-context index exists, pins the snapshot to its HEAD commit and
        carries the git-evolution signals. All best-effort.
        """
        owner, name = parse_repo_url(repo_url)
        repo_id: Optional[str] = None
        team_id: Optional[str] = None
        commit: Optional[str] = None
        evolution: Optional[Dict[str, Any]] = None

        try:
            if owner and name:
                rows = await get_storage().query_documents(
                    "repositories", [("owner", "==", owner), ("name", "==", name)]
                )
                if rows:
                    repo_id = rows[0].get("id")
                    team_id = rows[0].get("team_id")
        except Exception:
            logger.debug("Could not resolve registered repo for %s", repo_url, exc_info=True)

        try:
            from app.services.repo_context import RepoContextService, index_id_for

            idx = await RepoContextService().get(index_id or index_id_for(repo_url, branch))
            if idx:
                commit = idx.get("commit")
                evolution = idx.get("evolution") or {}
                index_id = idx.get("index_id") or index_id
        except Exception:
            logger.debug("Could not resolve repo-context index for %s", repo_url, exc_info=True)

        return await self.save(
            result,
            repo_url=repo_url,
            branch=branch,
            source=source,
            team_id=team_id,
            repo_id=repo_id,
            index_id=index_id,
            commit=commit,
            evolution=evolution,
        )

    async def _touch_repository(self, snapshot: Dict[str, Any]) -> None:
        """Mark the registered repository as analyzed (best-effort)."""
        try:
            storage = get_storage()
            repo_id = snapshot.get("repo_id")
            rows: List[Dict[str, Any]]
            if repo_id:
                row = await storage.get_document("repositories", repo_id)
                rows = [row] if row else []
            else:
                rows = await storage.query_documents(
                    "repositories",
                    [
                        ("owner", "==", snapshot.get("owner")),
                        ("name", "==", snapshot.get("name")),
                    ],
                )
            for row in rows:
                if not row:
                    continue
                await storage.update_document("repositories", row["id"], {
                    "status": "analyzed",
                    "last_analyzed_at": snapshot.get("built_at"),
                    "file_count": (snapshot.get("stats") or {}).get("file_count"),
                })
        except Exception:
            logger.debug("Could not update repository row after snapshot", exc_info=True)

    async def _prune(self, repo_url: str, branch: str) -> None:
        """Keep only the newest N snapshots for a repo+branch."""
        try:
            rows = await self._query(repo_url=repo_url, branch=branch)
            if len(rows) <= MAX_SNAPSHOTS_PER_REPO:
                return
            storage = get_storage()
            for row in rows[MAX_SNAPSHOTS_PER_REPO:]:
                await storage.delete_document(COLLECTION, row["id"])
        except Exception:
            logger.debug("Snapshot prune failed for %s", repo_url, exc_info=True)

    # ── Read ─────────────────────────────────────────────────────────────

    async def _query(
        self,
        *,
        repo_url: Optional[str] = None,
        owner: Optional[str] = None,
        name: Optional[str] = None,
        branch: Optional[str] = None,
        repo_id: Optional[str] = None,
        index_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        filters: List[Tuple[str, str, Any]] = []
        if repo_url:
            filters.append(("repo_url", "==", repo_url.strip().rstrip("/")))
        if repo_id:
            filters.append(("repo_id", "==", repo_id))
        if index_id:
            filters.append(("index_id", "==", index_id))
        if owner:
            filters.append(("owner", "==", owner))
        if name:
            filters.append(("name", "==", name))
        if branch:
            filters.append(("branch", "==", branch))
        try:
            rows = await get_storage().query_documents(COLLECTION, filters or None)
        except Exception:
            logger.exception("Snapshot query failed (filters=%s)", filters)
            return []
        rows.sort(key=_sort_key, reverse=True)
        return rows

    async def latest(
        self,
        *,
        repo_url: Optional[str] = None,
        owner: Optional[str] = None,
        name: Optional[str] = None,
        branch: Optional[str] = None,
        repo_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        rows = await self._query(
            repo_url=repo_url, owner=owner, name=name, branch=branch, repo_id=repo_id
        )
        return rows[0] if rows else None

    async def history(
        self,
        *,
        repo_url: Optional[str] = None,
        owner: Optional[str] = None,
        name: Optional[str] = None,
        branch: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        rows = await self._query(repo_url=repo_url, owner=owner, name=name, branch=branch)
        return rows[:limit]

    async def latest_for_owner_name(
        self, owner: str, name: str, branch: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        return await self.latest(owner=owner, name=name, branch=branch)

    # ── "Rebuilding" flag (cross-process, best-effort) ───────────────────
    # The Celery worker rebuilds the index; the API process serves reads.
    # A Redis key bridges them so an open page can show "rebuilding…".

    async def _redis(self):
        try:
            from app.services.cache_service import get_client

            return await get_client()
        except Exception:
            return None

    def _building_key(self, index_id: str) -> str:
        return f"{_BUILDING_PREFIX}:{index_id}"

    async def mark_building(self, index_id: Optional[str]) -> None:
        if not index_id:
            return
        import time

        _LOCAL_BUILDING[self._building_key(index_id)] = time.time() + _BUILDING_TTL
        client = await self._redis()
        if client:
            try:
                await client.setex(self._building_key(index_id), _BUILDING_TTL, "1")
            except Exception:
                logger.debug("Could not set building flag for %s", index_id, exc_info=True)

    async def clear_building(self, index_id: Optional[str]) -> None:
        if not index_id:
            return
        _LOCAL_BUILDING.pop(self._building_key(index_id), None)
        client = await self._redis()
        if client:
            try:
                await client.delete(self._building_key(index_id))
            except Exception:
                logger.debug("Could not clear building flag for %s", index_id, exc_info=True)

    async def is_building(self, index_id: Optional[str]) -> bool:
        if not index_id:
            return False
        import time

        key = self._building_key(index_id)
        if _LOCAL_BUILDING.get(key, 0) > time.time():
            return True
        client = await self._redis()
        if client:
            try:
                return bool(await client.get(key))
            except Exception:
                return False
        return False


architecture_store = ArchitectureStore()
