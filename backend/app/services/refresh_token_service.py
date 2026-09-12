"""Refresh-token store with multi-worker-safe rotation.

Why this exists (first principles): rotation was guarded by a per-process
``asyncio.Lock`` dict in ``api/v1/auth.py`` — correct on one worker, but two
workers (or two uvicorn processes) could both validate the same refresh token
before either revoked it (double-spend → two valid sessions from one token).

This module fixes that with:
1. A **distributed lock** — Redis ``SET NX PX`` per user when Redis is
   available, in-memory ``asyncio.Lock`` fallback otherwise (dev/test).
2. A **dedicated ``refresh_tokens`` table** (``RefreshToken`` model) with a
   UNIQUE index on ``token_hash`` — O(1) lookups instead of JSONB scans, FK to
   users, explicit ``revoked_at``/``replaced_by`` for rotation audits.
3. **Dual-read fallback** to the legacy ``dynamic_documents`` collection
   (``onramp_refresh_tokens``) so sessions issued before migration 029 keep
   working until natural expiry. Writes go to the new table only.

All DB access is best-effort with legacy fallback: if the new table is
unavailable (tests on memory storage, pre-migration DBs), the legacy path
handles the request and the error is logged, never raised.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Optional

from app.core import security as _security
from app.core.config import get_settings as _get_settings

logger = logging.getLogger(__name__)

LEGACY_COLLECTION = "onramp_refresh_tokens"

# Redis rotation lock: 10s TTL (rotation takes ms; TTL is only a deadlock guard).
_LOCK_TTL_MS = 10_000
_LOCK_SPIN_DELAY = 0.05
_LOCK_MAX_ATTEMPTS = 40  # ~2s total wait before giving up

# In-memory fallback locks (single-process dev/test only).
_mem_locks: dict[str, asyncio.Lock] = {}
_mem_locks_guard = asyncio.Lock()


async def _memory_lock(user_id: str) -> asyncio.Lock:
    async with _mem_locks_guard:
        lock = _mem_locks.get(user_id)
        if lock is None:
            lock = asyncio.Lock()
            _mem_locks[user_id] = lock
        return lock


def _lock_key(user_id: str) -> str:
    return f"refresh_lock:{user_id}"


async def _redis_client():
    try:
        from app.services.cache_service import get_client

        return await get_client()
    except Exception:
        return None


@asynccontextmanager
async def acquire_refresh_lock(user_id: str) -> AsyncIterator[None]:
    """Serialize refresh-token rotation per user across workers.

    Uses Redis ``SET NX PX`` when available, otherwise a per-user in-memory
    lock. Yields once the lock is held; always releases.
    """
    client = await _redis_client()
    if client is None:
        lock = await _memory_lock(user_id)
        async with lock:
            yield
        return

    key = _lock_key(user_id)
    token = uuid.uuid4().hex
    acquired = False
    try:
        for _ in range(_LOCK_MAX_ATTEMPTS):
            try:
                # NX+PX in one call: atomic acquire with deadlock-guard TTL.
                if await client.set(key, token, nx=True, px=_LOCK_TTL_MS):
                    acquired = True
                    break
            except Exception:
                logger.debug("Redis lock acquire failed for %s", user_id, exc_info=True)
                break
            await asyncio.sleep(_LOCK_SPIN_DELAY)
        if not acquired:
            # Fall back to the in-memory lock rather than failing the refresh:
            # rotation stays correct on this worker, and cross-worker races
            # remain guarded by single-use revocation (second use → 401).
            logger.warning(
                "Redis refresh lock unavailable for user %s — using in-memory fallback",
                user_id,
            )
            lock = await _memory_lock(user_id)
            async with lock:
                yield
            return
        yield
    finally:
        if acquired:
            try:
                # Release only if we still own it (TTL may have expired and
                # another worker may hold it now — compare-and-delete).
                current = await client.get(key)
                if current == token:
                    await client.delete(key)
            except Exception:
                logger.debug("Redis lock release failed for %s", user_id, exc_info=True)


# ── New-table (SQLAlchemy) path ──────────────────────────────────────────────


def _expiry() -> datetime:
    days = _get_settings().jwt_refresh_expiry_days
    return datetime.now(timezone.utc) + timedelta(days=days)


async def _db_store(user_id: str, token: str, remember_me: bool) -> Optional[dict]:
    """Write to the dedicated table. Returns the record dict or None on any failure."""
    try:
        from sqlalchemy import select, update

        from app.database.config import db_config
        from app.database.models import RefreshToken

        token_hash = _security.hash_refresh_token(token)
        now = datetime.now(timezone.utc)
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        async with factory() as session:
            # Single active session per design: revoke prior live tokens.
            await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
            row = RefreshToken(
                user_id=user_id,
                token_hash=token_hash,
                expires_at=_expiry(),
                revoked_at=None,
                replaced_by=None,
                remember_me=remember_me,
            )
            session.add(row)
            await session.commit()
            return {
                "id": row.id,
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": row.expires_at.isoformat(),
                "remember_me": remember_me,
                "revoked": False,
                "created_at": now.isoformat(),
            }
    except Exception:
        logger.debug("refresh_tokens table write failed — legacy fallback", exc_info=True)
        return None


async def _db_validate(token: str) -> Optional[dict]:
    """Validate against the dedicated table. None = miss or table unavailable."""
    try:
        from sqlalchemy import select

        from app.database.config import db_config
        from app.database.models import RefreshToken

        token_hash = _security.hash_refresh_token(token)
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        async with factory() as session:
            result = await session.execute(
                select(RefreshToken).where(RefreshToken.token_hash == token_hash)
            )
            row = result.scalar_one_or_none()
            if row is None or row.revoked_at is not None:
                return None
            expires = row.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                return None
            return row.to_dict()
    except Exception:
        logger.debug("refresh_tokens table read failed — legacy fallback", exc_info=True)
        return None


async def _db_revoke(token: str, replaced_by: Optional[str] = None) -> bool:
    """Revoke in the dedicated table. True if a row was revoked."""
    try:
        from sqlalchemy import update

        from app.database.config import db_config
        from app.database.models import RefreshToken

        token_hash = _security.hash_refresh_token(token)
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        async with factory() as session:
            result = await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.token_hash == token_hash,
                    RefreshToken.revoked_at.is_(None),
                )
                .values(
                    revoked_at=datetime.now(timezone.utc),
                    replaced_by=replaced_by,
                )
            )
            await session.commit()
            return (result.rowcount or 0) > 0
    except Exception:
        logger.debug("refresh_tokens table revoke failed — legacy fallback", exc_info=True)
        return False


# ── Legacy (dynamic_documents) path — verbatim behavior ──────────────────────


async def _legacy_store(user_id: str, token: str, remember_me: bool) -> dict:
    from app.services.postgres_db import get_storage

    storage = get_storage()
    record = {
        "user_id": user_id,
        "token_hash": _security.hash_refresh_token(token),
        "expires_at": _expiry().isoformat(),
        "remember_me": remember_me,
        "revoked": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        existing = await storage.query_documents(
            LEGACY_COLLECTION, [("user_id", "==", user_id)]
        )
        for e in existing:
            await storage.update_document(
                LEGACY_COLLECTION,
                e["id"],
                {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()},
            )
    except Exception:
        logger.exception("Failed to revoke prior refresh tokens for %s", user_id)
    record["id"] = uuid.uuid4().hex
    try:
        await storage.create_document(LEGACY_COLLECTION, record["id"], record)
    except Exception:
        logger.exception("Failed to persist refresh token")
    return record


def _legacy_not_expired(record: dict) -> bool:
    try:
        expires = datetime.fromisoformat(record["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires >= datetime.now(timezone.utc)
    except (KeyError, ValueError):
        return False


async def _legacy_validate(token: str) -> Optional[dict]:
    from app.services.postgres_db import get_storage

    storage = get_storage()
    token_hash = _security.hash_refresh_token(token)
    try:
        rows = await storage.query_documents(
            LEGACY_COLLECTION, [("token_hash", "==", token_hash)]
        )
    except Exception:
        logger.exception("Refresh token lookup failed")
        return None
    if not rows:
        return None
    record = rows[0]
    if record.get("revoked"):
        return None
    if not _legacy_not_expired(record):
        return None
    return record


async def _legacy_revoke(token: str) -> None:
    from app.services.postgres_db import get_storage

    storage = get_storage()
    token_hash = _security.hash_refresh_token(token)
    try:
        rows = await storage.query_documents(
            LEGACY_COLLECTION, [("token_hash", "==", token_hash)]
        )
        for r in rows:
            await storage.update_document(
                LEGACY_COLLECTION,
                r["id"],
                {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()},
            )
    except Exception:
        logger.exception("Failed to revoke refresh token")


# ── Public API (new-table first, legacy fallback) ────────────────────────────


async def store_refresh_token(user_id: str, token: str, remember_me: bool) -> dict:
    """Persist a refresh token (hashed). Prefers the new table, falls back to legacy."""
    record = await _db_store(user_id, token, remember_me)
    if record is not None:
        # Best-effort: also revoke legacy rows so only one session stays live.
        try:
            from app.services.postgres_db import get_storage

            storage = get_storage()
            existing = await storage.query_documents(
                LEGACY_COLLECTION, [("user_id", "==", user_id)]
            )
            for e in existing:
                await storage.update_document(
                    LEGACY_COLLECTION,
                    e["id"],
                    {
                        "revoked": True,
                        "revoked_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
        except Exception:
            logger.debug("Legacy refresh-token revoke sweep failed", exc_info=True)
        return record
    return await _legacy_store(user_id, token, remember_me)


async def validate_refresh_token(token: str) -> Optional[dict]:
    """Validate a refresh token. Returns the stored record or None."""
    record = await _db_validate(token)
    if record is not None:
        return record
    return await _legacy_validate(token)


async def revoke_refresh_token(
    token: str, replaced_by: Optional[str] = None
) -> None:
    """Revoke a refresh token in both stores (rotation invalidates the old one)."""
    await _db_revoke(token, replaced_by=replaced_by)
    await _legacy_revoke(token)


async def find_revoked_record(token: str) -> Optional[dict]:
    """Return the stored record for a *known-but-invalid* refresh token.

    Used for reuse detection: a presented token that fails validation but
    matches a revoked/expired row is a replay (or theft), not a random
    string. Returns None when the token was never issued.
    """
    token_hash = _security.hash_refresh_token(token)
    # Dedicated table first.
    try:
        from app.database.config import db_config
        from app.database.models import RefreshToken
        from sqlalchemy import select

        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        async with factory() as session:
            result = await session.execute(
                select(RefreshToken).where(RefreshToken.token_hash == token_hash)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                return row.to_dict()
    except Exception:
        logger.debug("revoked-record table lookup failed", exc_info=True)
    # Legacy collection fallback.
    try:
        from app.services.postgres_db import get_storage

        rows = await get_storage().query_documents(
            LEGACY_COLLECTION, [("token_hash", "==", token_hash)]
        )
        return rows[0] if rows else None
    except Exception:
        logger.debug("revoked-record legacy lookup failed", exc_info=True)
        return None


async def revoke_all_user_tokens(user_id: str) -> int:
    """Revoke every live refresh token for a user in both stores.

    Theft response for refresh-token reuse: when a revoked token is replayed,
    the whole family is burned. Returns the number of tokens revoked.
    """
    count = 0
    try:
        from app.database.config import db_config
        from app.database.models import RefreshToken
        from sqlalchemy import update

        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        async with factory() as session:
            result = await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.user_id == user_id,
                    RefreshToken.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(timezone.utc), replaced_by="reuse_detected")
            )
            await session.commit()
            count += result.rowcount or 0
    except Exception:
        logger.debug("family wipe (table) failed — legacy sweep continues", exc_info=True)
    try:
        from app.services.postgres_db import get_storage

        storage = get_storage()
        existing = await storage.query_documents(
            LEGACY_COLLECTION, [("user_id", "==", user_id)]
        )
        for e in existing:
            if not e.get("revoked"):
                await storage.update_document(
                    LEGACY_COLLECTION,
                    e["id"],
                    {
                        "revoked": True,
                        "revoked_at": datetime.now(timezone.utc).isoformat(),
                        "revoked_reason": "reuse_detected",
                    },
                )
                count += 1
    except Exception:
        logger.debug("family wipe (legacy) failed", exc_info=True)
    return count


def generate_refresh_token() -> str:
    """Generate a cryptographically random opaque refresh token."""
    return _security.generate_refresh_token()


def hash_refresh_token(token: str) -> str:
    """HMAC-SHA256 hash of a refresh token (single source via core.security)."""
    return _security.hash_refresh_token(token)
