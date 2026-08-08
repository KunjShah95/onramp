"""Repo Index Tasks — pre-build and auto-refresh repository context indexes.

Warms the parse-once repo-context cache (``app/services/repo_context.py``)
so agents hit a cached index instead of building on first request.

Two tasks, both routed to the ``agent-tasks`` queue (they clone + parse
repositories, which is network-bound heavy work):

- ``build_repo_index`` — the pre-build primitive: clone + parse + index ONE
  repository. ``POST /repos/index?async_build=true`` dispatches it so the
  caller gets a 202 + task id instead of waiting; ``refresh_repo_indexes``
  fans out to it per repository.
- ``refresh_repo_indexes`` — the scheduled sweep (Celery Beat, nightly).
  Reads every repository registered in the ``repositories`` registry and
  enqueues a ``build_repo_index`` for any whose cached index is missing or
  older than ``REPO_INDEX_MAX_AGE_HOURS`` (default 20h), so indexes are
  rebuilt just before the 24h Redis TTL expires — first request hits the
  cache instead of the clone.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from celery import shared_task

logger = logging.getLogger("onramp.tasks.repo_index")

# Rebuild a cached index once it is this old (hours). Default 20h keeps
# indexes fresh ahead of the 24h REPO_CONTEXT_TTL without re-cloning every
# night regardless of activity.
MAX_AGE_HOURS = float(os.getenv("REPO_INDEX_MAX_AGE_HOURS", "20"))


# ── Single-repo pre-build ────────────────────────────────────────────────────

@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
)
def build_repo_index(
    self,
    repo_url: str,
    branch: str = "main",
    max_files: int = 1000,
    force: bool = False,
    scope: str = "",
) -> dict:
    """Clone + parse + index one repository (or return the cached document).

    The pre-build primitive for the token-saving pipeline: call this (via
    the API's ``async_build`` flag, the nightly sweep, or the GitHub push
    webhook) so the index is warm before the first user request. Returns a
    compact summary; the full document lives in the repo-context cache
    under the stable ``index_id``.

    ``scope`` is the caller's cache scope (defaults to the ``index_id``) —
    the push webhook passes it so a rebuild invalidates the repo's stale
    LLM cache entries under that scope.
    """
    import asyncio
    from app.services.repo_context import RepoContextService, index_id_for

    async def _run() -> dict:
        service = RepoContextService()
        doc = await service.build(repo_url, branch=branch, max_files=max_files, force=force)
        _scope = scope or index_id_for(repo_url, branch)
        stats = doc.get("stats", {})
        return {
            "index_id": doc["index_id"],
            "repo_url": repo_url,
            "branch": branch,
            "commit": doc.get("commit"),
            "cached": doc.get("cached", False),
            "file_count": stats.get("file_count", 0),
            "built_at": doc.get("built_at"),
            "scope": _scope,
        }

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_run())
        logger.info(
            "Repo index %s for %s (cached=%s, files=%d)",
            "rebuilt" if force else "pre-built", repo_url, result["cached"], result["file_count"],
        )
        return result
    except Exception as exc:
        logger.exception("Repo index build failed for %s", repo_url)
        raise self.retry(exc=exc)
    finally:
        # Idempotent cleanup: a failed run_until_complete (e.g. a nested-loop
        # collision in eager/test mode) must never mask the original error.
        if loop.is_running():
            loop.call_soon_threadsafe(loop.stop)
        if not loop.is_closed():
            loop.close()


# ── Registry helpers ─────────────────────────────────────────────────────────

def _repo_url_from(row: Dict[str, Any]) -> Optional[str]:
    """Registered repo row -> clone URL.

    Prefers the explicit ``url`` field; falls back to synthesizing a GitHub
    URL from ``owner``/``name`` (registrations created without a url).
    Returns None when neither is usable.
    """
    url = (row.get("url") or "").strip()
    if url:
        return url
    owner = (row.get("owner") or "").strip()
    name = (row.get("name") or "").strip()
    if owner and name:
        return f"https://github.com/{owner}/{name}"
    return None


# Cold-window buffer (hours): docs within this close to the TTL expiry are
# treated as stale so the fixed nightly sweep rebuilds them BEFORE they expire
# and go cold — a mid-day build would otherwise be skipped (under max_age at
# 03:00) and then TTL out before the next night's sweep.
COLD_WINDOW_HOURS = float(os.getenv("REPO_INDEX_COLD_WINDOW_HOURS", "2"))


def _index_is_stale(
    doc: Optional[Dict[str, Any]],
    max_age_hours: float,
    ttl_hours: float = 24.0,
    cold_window_hours: float = COLD_WINDOW_HOURS,
) -> bool:
    """True when the cached index is missing, unparseable, or too old.

    A doc is fresh when its ``built_at`` timestamp is within the last
    ``max_age_hours``. Anything else (missing doc, missing/malformed
    timestamp, old timestamp) counts as stale so the sweep rebuilds it.

    ``ttl_hours`` (default 24h, the repo-context Redis TTL) also makes docs
    *about to expire* stale: a nightly sweep is the only chance to rebuild a
    repo until the next night, so a doc within ``COLD_WINDOW_HOURS`` (2h) of
    the TTL expiry would otherwise go cold before the next sweep. The stale
    condition is therefore ``age > max_age OR age >= ttl - cold_window``.
    """
    if not doc:
        return True
    built_at = doc.get("built_at")
    if not built_at:
        return True
    try:
        built = datetime.fromisoformat(str(built_at))
        if built.tzinfo is None:
            built = built.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return True
    age_h = (datetime.now(timezone.utc) - built).total_seconds() / 3600
    if age_h > max_age_hours:
        return True
    # Cold-window guard: about to expire within the TTL -> rebuild now.
    return age_h >= (ttl_hours - cold_window_hours)


# ── Scheduled sweep ──────────────────────────────────────────────────────────

@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
)
def refresh_repo_indexes(
    self,
    force: bool = False,
    max_age_hours: Optional[float] = None,
) -> dict:
    """Sweep the repositories registry and pre-build missing/stale indexes.

    Intended to run nightly via Celery Beat. For every registered repo it
    checks the cached index: fresh indexes are skipped, missing or stale
    ones get a ``build_repo_index`` enqueued (per-repo tasks distribute the
    work across workers and retry independently). One bad repo never fails
    the whole sweep.
    """
    import asyncio
    from app.services.postgres_db import get_storage
    from app.services.repo_context import DEFAULT_TTL, RepoContextService, index_id_for

    async def _run() -> dict:
        storage = get_storage()
        service = RepoContextService()
        age = max_age_hours if max_age_hours is not None else MAX_AGE_HOURS
        # Keep the cold-window guard in sync with the repo-context TTL.
        ttl_hours = DEFAULT_TTL / 3600
        cold_window_hours = COLD_WINDOW_HOURS

        try:
            repos = await storage.list_documents("repositories") or []
        except Exception:
            logger.exception("Failed to list repositories registry")
            raise

        enqueued = fresh = skipped = failed = 0
        failures: List[str] = []

        for row in repos:
            url = _repo_url_from(row)
            if not url:
                skipped += 1
                continue
            branch = (row.get("branch") or "main").strip() or "main"
            index_id = index_id_for(url, branch)

            try:
                doc = await service.get(index_id)
                if doc and not force and not _index_is_stale(
                    doc, age, ttl_hours=ttl_hours, cold_window_hours=cold_window_hours
                ):
                    fresh += 1
                    continue
                # A present-but-stale doc MUST be forced: build(force=False)
                # returns the cached document (24h TTL) without re-cloning, so
                # an unforced enqueue would silently no-op on the refresh.
                # Missing docs don't need it — build clones when there's no
                # cached document at all.
                rebuild_force = force or doc is not None
                build_repo_index.apply_async(
                    args=[url],
                    kwargs={"branch": branch, "force": rebuild_force},
                    queue="agent-tasks",
                )
                enqueued += 1
            except Exception:
                logger.exception("Failed to enqueue index build for %s", url)
                failures.append(url)
                failed += 1

        return {
            "total_repos": len(repos),
            "enqueued_builds": enqueued,
            "fresh_indexes": fresh,
            "skipped": skipped,
            "failed": failed,
            "failed_repos": failures,
        }

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Repo index refresh sweep failed")
        raise self.retry(exc=exc)
    finally:
        loop.close()
