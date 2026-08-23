"""
Account lockout service — brute-force login protection.

Tracks failed login attempts per email address and temporarily locks the
account after a configurable number of failures.  Uses Redis when available
(an accurate counter across workers) with an in-memory fallback for
single-process dev/test environments.

Configuration (env vars):
    LOCKOUT_MAX_ATTEMPTS:  Failed attempts before lockout (default: 5)
    LOCKOUT_DURATION_MINUTES: Lockout duration in minutes (default: 15)
    LOCKOUT_WINDOW_MINUTES:  Sliding window for counting attempts (default: 30)

Design:
    - Key is the email hash (SHA-256) — never store raw emails in lockout state.
    - Successful login resets the counter immediately.
    - Lockout is time-based: after the duration expires, the account is
      automatically unlocked (no manual intervention needed).
    - The lockout check itself is O(1) and does not touch the database.
"""

import os
import time
import json
import logging
from typing import Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger("onramp.lockout")

# ── Configuration ───────────────────────────────────────────────────────────

MAX_ATTEMPTS = int(os.getenv("LOCKOUT_MAX_ATTEMPTS", "5"))
LOCKOUT_DURATION_SECONDS = int(os.getenv("LOCKOUT_DURATION_MINUTES", "15")) * 60
WINDOW_SECONDS = int(os.getenv("LOCKOUT_WINDOW_MINUTES", "30")) * 60

# ── Redis key prefix ────────────────────────────────────────────────────────

_REDIS_KEY_PREFIX = "lockout:"
_REDIS_KEY_TTL = WINDOW_SECONDS  # auto-expire after the sliding window


@dataclass
class LockoutStatus:
    """Result of a lockout check."""
    locked: bool
    attempts_remaining: int  # how many attempts left before lockout
    locked_until: Optional[float] = None  # timestamp when lockout expires
    retry_after: Optional[int] = None  # seconds until unlock (None if not locked)


# ── In-memory fallback ──────────────────────────────────────────────────────

_in_memory_store: dict[str, dict] = {}


def _memory_get(key: str) -> Optional[dict]:
    record = _in_memory_store.get(key)
    if record is None:
        return None
    # Check if lockout has expired
    if record.get("locked_until") and time.time() > record["locked_until"]:
        del _in_memory_store[key]
        return None
    # Check if the sliding window has expired (reset entirely)
    if time.time() - record.get("first_attempt", 0) > WINDOW_SECONDS:
        del _in_memory_store[key]
        return None
    return record


def _memory_set(key: str, record: dict) -> None:
    _in_memory_store[key] = record


def _memory_delete(key: str) -> None:
    _in_memory_store.pop(key, None)


# ── Redis helpers ───────────────────────────────────────────────────────────

async def _redis_client():
    """Get the Redis client or None."""
    try:
        from app.services.cache_service import get_client
        return await get_client()
    except Exception:
        return None


async def _redis_get(key: str) -> Optional[dict]:
    client = await _redis_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        logger.debug("Redis GET failed for %s", key, exc_info=True)
        return None


async def _redis_set(key: str, record: dict) -> None:
    client = await _redis_client()
    if client is None:
        return
    try:
        await client.setex(key, _REDIS_KEY_TTL, json.dumps(record))
    except Exception:
        logger.debug("Redis SET failed for %s", key, exc_info=True)


async def _redis_delete(key: str) -> None:
    client = await _redis_client()
    if client is None:
        return
    try:
        await client.delete(key)
    except Exception:
        logger.debug("Redis DELETE failed for %s", key, exc_info=True)


# ── Public API ──────────────────────────────────────────────────────────────

async def check_lockout(email_hash: str) -> LockoutStatus:
    """Check if an account is currently locked out.

    Returns a LockoutStatus with:
      - locked: True if the account is locked
      - attempts_remaining: how many attempts are left before lockout
      - locked_until: timestamp when lockout expires (if locked)
      - retry_after: seconds until unlock (if locked, for Retry-After header)
    """
    key = f"{_REDIS_KEY_PREFIX}{email_hash}"

    # Try Redis first, fall back to memory
    record = await _redis_get(key)
    if record is None:
        record = _memory_get(key)

    if record is None:
        return LockoutStatus(
            locked=False,
            attempts_remaining=MAX_ATTEMPTS,
        )

    now = time.time()

    # Check if lockout has expired
    locked_until = record.get("locked_until")
    if locked_until and now > locked_until:
        # Lockout expired — auto-unlock
        await _redis_delete(key)
        _memory_delete(key)
        return LockoutStatus(
            locked=False,
            attempts_remaining=MAX_ATTEMPTS,
        )

    # Check if the sliding window has expired
    first_attempt = record.get("first_attempt", 0)
    if now - first_attempt > WINDOW_SECONDS:
        await _redis_delete(key)
        _memory_delete(key)
        return LockoutStatus(
            locked=False,
            attempts_remaining=MAX_ATTEMPTS,
        )

    attempts = record.get("attempts", 0)

    if locked_until and now <= locked_until:
        # Currently locked
        retry_after = int(locked_until - now) + 1
        return LockoutStatus(
            locked=True,
            attempts_remaining=0,
            locked_until=locked_until,
            retry_after=retry_after,
        )

    # Not locked yet — return remaining attempts
    return LockoutStatus(
        locked=False,
        attempts_remaining=max(0, MAX_ATTEMPTS - attempts),
    )


async def record_failed_attempt(email_hash: str) -> LockoutStatus:
    """Record a failed login attempt and check if lockout should trigger.

    Returns the updated lockout status.
    """
    key = f"{_REDIS_KEY_PREFIX}{email_hash}"
    now = time.time()

    # Get existing record
    record = await _redis_get(key)
    if record is None:
        record = _memory_get(key)

    if record is None:
        # First failure — start a new window
        record = {
            "attempts": 1,
            "first_attempt": now,
            "last_attempt": now,
            "locked_until": None,
        }
    else:
        # Check if the window has expired
        if now - record.get("first_attempt", 0) > WINDOW_SECONDS:
            # Window expired — start fresh
            record = {
                "attempts": 1,
                "first_attempt": now,
                "last_attempt": now,
                "locked_until": None,
            }
        else:
            # Increment attempts within the window
            record["attempts"] = record.get("attempts", 0) + 1
            record["last_attempt"] = now

    # Check if we should lock
    if record["attempts"] >= MAX_ATTEMPTS and not record.get("locked_until"):
        record["locked_until"] = now + LOCKOUT_DURATION_SECONDS
        logger.warning(
            "Account locked after %d failed attempts (email_hash=%s)",
            record["attempts"], email_hash[:12],
        )

    # Persist
    await _redis_set(key, record)
    _memory_set(key, record)

    attempts = record.get("attempts", 0)
    locked_until = record.get("locked_until")

    if locked_until and now <= locked_until:
        retry_after = int(locked_until - now) + 1
        return LockoutStatus(
            locked=True,
            attempts_remaining=0,
            locked_until=locked_until,
            retry_after=retry_after,
        )

    return LockoutStatus(
        locked=False,
        attempts_remaining=max(0, MAX_ATTEMPTS - attempts),
    )


async def reset_lockout(email_hash: str) -> None:
    """Reset lockout counter on successful login.

    Called after a successful password verification to clear any
    accumulated failures.
    """
    key = f"{_REDIS_KEY_PREFIX}{email_hash}"
    await _redis_delete(key)
    _memory_delete(key)


async def manual_unlock(email_hash: str) -> bool:
    """Admin endpoint: manually unlock an account.

    Returns True if the account was locked and is now unlocked.
    """
    key = f"{_REDIS_KEY_PREFIX}{email_hash}"
    record = await _redis_get(key)
    if record is None:
        record = _memory_get(key)

    if record is None:
        return False

    was_locked = bool(record.get("locked_until"))
    await _redis_delete(key)
    _memory_delete(key)

    if was_locked:
        logger.info("Account manually unlocked (email_hash=%s)", email_hash[:12])

    return was_locked
