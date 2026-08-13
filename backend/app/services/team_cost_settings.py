"""Per-team cost-model calibration (Phase 0 — pressure-test assumptions).

The ramp cost model runs on working assumptions (see ``ramp_service``):
``senior_hourly_rate_usd`` ($90/hr), ``review_hours_per_cycle`` (0.5h of
senior attention per change-request cycle), ``stalled_weekly_hours`` (0.5h
of senior re-engagement per stalled week) and ``onramp_price_usd_per_month``
($99/mo per workspace — the real Team pricing, unlimited engineers; the
benchmark comparison price for the ramp-vs-Onramp ROI story). Phase 0
exists to pressure-test those numbers with real teams — this service is
the dial.

Mirrors :mod:`app.services.team_routing_settings` — same generic document
store, same short-TTL cache-then-invalidate-on-write shape. A team override
record in ``team_cost_settings`` can set any subset of the numbers; unset
fields fall back to the platform defaults (env-tunable). This lets one team
calibrate to "our seniors are $115/hr and reviews take 20 minutes" without
touching env vars or redeploying, and lets us collect real calibration data
to converge the defaults.
"""

import logging
import os
import time
from typing import Dict, Optional, Tuple

from app.services import ramp_service as ramp
from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.team_cost_settings")

COLLECTION = "team_cost_settings"

# Subscription prices are stored in INR (billing_service.TIER_PRICING) —
# the benchmark comparison lives in USD, so convert at a tunable rate.
def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default


INR_TO_USD_RATE = _env_float("ONRAMP_INR_TO_USD_RATE", 84.0)  # ₹ per $1

# Field keys (shared with ramp_service's settings dict).
KEY_RATE = "senior_hourly_rate_usd"
KEY_CYCLE = "review_hours_per_cycle"
KEY_STALL = "stalled_weekly_hours"
KEY_PRICE = "onramp_price_usd_per_month"

# Validation ranges — anything outside is a data-entry error, not a tuning.
RATE_MIN, RATE_MAX = 20.0, 1000.0
CYCLE_MIN, CYCLE_MAX = 0.05, 8.0
STALL_MIN, STALL_MAX = 0.0, 24.0
PRICE_MIN, PRICE_MAX = 0.05, 1000.0

_CACHE_TTL_SECONDS = 30.0
_SETTINGS_CACHE: Dict[str, Tuple[float, dict]] = {}


def _invalidate_team_cache(team_id: str) -> None:
    _SETTINGS_CACHE.pop(team_id, None)


def platform_settings() -> dict:
    """The platform-wide defaults (env-tunable, see ramp_service)."""
    return {
        KEY_RATE: ramp.SENIOR_HOURLY_RATE_USD,
        KEY_CYCLE: ramp.REVIEW_HOURS_PER_CYCLE,
        KEY_STALL: ramp.STALLED_WEEKLY_HOURS,
        KEY_PRICE: ramp.ONRAMP_PRICE_USD_PER_MONTH,
    }


def _merge_override(record: Optional[dict]) -> dict:
    """Effective settings for a team: platform defaults overlaid with the
    team's overridden fields. ``source`` reports which layer won."""
    effective = platform_settings()
    if record:
        for key in (KEY_RATE, KEY_CYCLE, KEY_STALL, KEY_PRICE):
            if record.get(key) is not None:
                effective[key] = float(record[key])
        effective["source"] = "team"
    else:
        effective["source"] = "platform"
    return effective


def validate_overrides(overrides: dict) -> None:
    """Raise ValueError on out-of-range values (a tuning mistake, not data)."""
    checks = (
        (KEY_RATE, RATE_MIN, RATE_MAX),
        (KEY_CYCLE, CYCLE_MIN, CYCLE_MAX),
        (KEY_STALL, STALL_MIN, STALL_MAX),
        (KEY_PRICE, PRICE_MIN, PRICE_MAX),
    )
    for key, lo, hi in checks:
        if overrides.get(key) is None:
            continue
        try:
            value = float(overrides[key])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a number") from exc
        if not (lo <= value <= hi):
            raise ValueError(f"{key} must be between {lo} and {hi}")


async def get_team_cost_settings(team_id: Optional[str]) -> dict:
    """Effective cost settings for a team (override → platform default).

    ``team_id`` falsy (personal/unauthenticated context) returns the
    platform defaults. Best-effort: a storage failure logs and returns the
    platform defaults rather than failing the request.
    """
    if not team_id:
        return _merge_override(None)

    now = time.monotonic()
    cached = _SETTINGS_CACHE.get(team_id)
    if cached is not None and cached[0] > now:
        return cached[1]

    try:
        records = await get_storage().query_documents(COLLECTION, [("team_id", "==", team_id)])
        record = records[0] if records else None
    except Exception:
        logger.exception("Failed to load cost settings for %s", team_id)
        record = None

    effective = _merge_override(record)
    _SETTINGS_CACHE[team_id] = (now + _CACHE_TTL_SECONDS, effective)
    return effective


async def live_subscription_price(team_id: str) -> Optional[dict]:
    """The team's live active subscription price, or None.

    Reads ``onramp_subscriptions`` (the billing source of truth) for the
    active subscription and returns ``{"price_inr", "price_usd"}`` (USD is
    the INR price converted at the platform rate). Returns None when the
    team has no active subscription, the price is missing/zero (free tier),
    or storage fails — callers fall back to the platform default rather
    than showing a wrong number.
    """
    if not team_id:
        return None
    try:
        subs = await get_storage().query_documents(
            "onramp_subscriptions", [("team_id", "==", team_id), ("status", "==", "active")]
        )
    except Exception:
        logger.exception("Failed to load subscription for %s", team_id)
        return None
    if not subs:
        return None
    try:
        price_inr = float(subs[0].get("price"))
    except (TypeError, ValueError):
        return None
    if price_inr <= 0:
        return None
    return {
        "price_inr": round(price_inr, 2),
        "price_usd": round(price_inr / INR_TO_USD_RATE, 2),
    }


async def live_subscription_price_usd(team_id: str) -> Optional[float]:
    """USD-only wrapper around :func:`live_subscription_price`."""
    info = await live_subscription_price(team_id)
    return info["price_usd"] if info else None


async def resolve_benchmark_price(team_id: Optional[str]) -> dict:
    """The Onramp price the benchmarks should use, with provenance.

    Precedence — most-specific wins:
    1. an explicit team override in ``team_cost_settings`` (a leader
       deliberately calibrated the number),
    2. the team's **live subscription** (billing source of truth, INR → USD),
    3. the platform default ``ONRAMP_PRICE_USD_PER_MONTH`` ($99/mo).

    Returns ``{"price_usd", "price_inr", "price_source"}`` where
    ``price_source`` is ``"subscription"`` / ``"team"`` / ``"platform"``
    and ``price_inr`` is the original billing amount (None unless the live
    subscription won) so the UI can show the ₹ → $ conversion step. Never
    raises — degrades to the platform default.
    """
    settings = await get_team_cost_settings(team_id)
    record_price = settings.get(KEY_PRICE)
    if team_id:
        # Only a *stored* override counts as explicit — the settings dict
        # always carries a price (the platform default when unset).
        try:
            records = await get_storage().query_documents(COLLECTION, [("team_id", "==", team_id)])
        except Exception:
            records = []
        if records and records[0].get(KEY_PRICE) is not None:
            return {
                "price_usd": round(float(records[0][KEY_PRICE]), 2),
                "price_inr": None,
                "price_source": "team",
            }
    live = await live_subscription_price(team_id)
    if live is not None:
        return {
            "price_usd": live["price_usd"],
            "price_inr": live["price_inr"],
            "price_source": "subscription",
        }
    return {
        "price_usd": round(float(record_price), 2) if record_price is not None else ramp.ONRAMP_PRICE_USD_PER_MONTH,
        "price_inr": None,
        "price_source": "platform",
    }


async def set_team_cost_settings(team_id: str, user_id: str, overrides: dict) -> dict:
    """Upsert a team's cost-model calibration (partial overrides allowed).

    Validates ranges, then returns the new *effective* settings. A storage
    failure raises (a leader explicitly tuning the model should learn about
    it, unlike the read path which degrades to platform defaults).
    """
    if not team_id:
        raise ValueError("team_id is required")
    allowed = {
        k: overrides.get(k)
        for k in (KEY_RATE, KEY_CYCLE, KEY_STALL, KEY_PRICE)
        if overrides.get(k) is not None
    }
    if not allowed:
        return await get_team_cost_settings(team_id)
    validate_overrides(allowed)

    storage = get_storage()
    existing = await storage.query_documents(COLLECTION, [("team_id", "==", team_id)])
    if existing:
        record_id = existing[0].get("id") or existing[0].get("_id")
        await storage.update_document(COLLECTION, record_id, {**allowed, "updated_by": user_id})
    else:
        await storage.create_document(
            COLLECTION,
            generate_id(),
            {"team_id": team_id, **allowed, "created_by": user_id, "updated_by": user_id},
        )
    _invalidate_team_cache(team_id)
    return await get_team_cost_settings(team_id)
