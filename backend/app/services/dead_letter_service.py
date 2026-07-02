"""Dead-letter queue for failed background jobs (digest emails, notifications).

Failed jobs are persisted instead of being lost in logs, then replayed with
exponential backoff until they succeed or exhaust max_attempts. Replay is
driven by an admin endpoint / external cron hitting it — there is no
in-process scheduler to keep the web tier stateless.

Entry lifecycle: pending → (replay ok) resolved
                          → (replay fails, attempts < max) pending, later next_retry_at
                          → (attempts >= max) dead
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("codeflow.dlq")

PENDING = "pending"
RESOLVED = "resolved"
DEAD = "dead"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DeadLetterService:
    COLLECTION = "codeflow_dead_letters"

    def __init__(self, max_attempts: int = 5, base_backoff_seconds: int = 300):
        self.storage = get_storage()
        self.max_attempts = max_attempts
        self.base_backoff_seconds = base_backoff_seconds

    def _next_retry_at(self, attempts: int) -> str:
        # 5min, 10min, 20min, 40min, ... capped at 6h
        delay = min(self.base_backoff_seconds * (2 ** max(attempts - 1, 0)), 6 * 3600)
        return (_now() + timedelta(seconds=delay)).isoformat()

    async def record_failure(
        self,
        job_type: str,
        payload: Dict[str, Any],
        error: str,
    ) -> Dict[str, Any]:
        """Persist a failed job for later replay."""
        entry = {
            "job_type": job_type,
            "payload": payload,
            "status": PENDING,
            "attempts": 1,
            "last_error": str(error)[:500],
            "created_at": _now().isoformat(),
            "next_retry_at": self._next_retry_at(1),
        }
        stored = await self.storage.create_document(self.COLLECTION, generate_id(), entry)
        logger.warning("Dead-lettered %s job (id=%s): %s", job_type, stored.get("id"), entry["last_error"])
        return stored

    async def list_entries(self, status: Optional[str] = None, limit: int = 100) -> List[dict]:
        filters = [("status", "==", status)] if status else []
        entries = await self.storage.query_documents(self.COLLECTION, filters)
        entries.sort(key=lambda e: e.get("created_at", ""), reverse=True)
        return entries[:limit]

    async def stats(self) -> Dict[str, int]:
        entries = await self.storage.query_documents(self.COLLECTION, [])
        counts = {PENDING: 0, RESOLVED: 0, DEAD: 0}
        for e in entries:
            counts[e.get("status", PENDING)] = counts.get(e.get("status", PENDING), 0) + 1
        return counts

    async def replay_due(
        self,
        handlers: Dict[str, Callable[[Dict[str, Any]], Awaitable[bool]]],
        limit: int = 50,
    ) -> Dict[str, int]:
        """Replay pending entries whose backoff has elapsed.

        `handlers` maps job_type → async callable(payload) returning True on
        success. Handlers must NOT re-enqueue to the DLQ on failure — this
        method owns the retry bookkeeping.
        """
        now_iso = _now().isoformat()
        due = [
            e for e in await self.list_entries(status=PENDING, limit=limit * 2)
            if e.get("next_retry_at", "") <= now_iso and e.get("job_type") in handlers
        ][:limit]

        replayed = succeeded = failed = buried = 0
        for entry in due:
            replayed += 1
            entry_id = entry["id"]
            try:
                ok = await handlers[entry["job_type"]](entry.get("payload") or {})
                error = None if ok else "handler returned False"
            except Exception as exc:
                ok, error = False, str(exc)[:500]

            if ok:
                succeeded += 1
                await self.storage.update_document(self.COLLECTION, entry_id, {
                    "status": RESOLVED,
                    "resolved_at": _now().isoformat(),
                })
                continue

            failed += 1
            attempts = int(entry.get("attempts", 1)) + 1
            update = {"attempts": attempts, "last_error": error}
            if attempts >= self.max_attempts:
                buried += 1
                update["status"] = DEAD
                logger.error("DLQ entry %s (%s) buried after %d attempts: %s",
                             entry_id, entry["job_type"], attempts, error)
            else:
                update["next_retry_at"] = self._next_retry_at(attempts)
            await self.storage.update_document(self.COLLECTION, entry_id, update)

        return {"replayed": replayed, "succeeded": succeeded, "failed": failed, "buried": buried}


def email_replay_handler():
    """Handler for job_type='email': re-send without re-enqueueing on failure."""
    from app.services import email_service

    async def _replay(payload: Dict[str, Any]) -> bool:
        return await email_service.send_email(
            to=payload["to"],
            subject=payload["subject"],
            html_body=payload["html_body"],
            from_email=payload.get("from_email"),
            enqueue_on_failure=False,
        )

    return _replay
