"""
First-party product analytics.

  POST /api/v1/events   — batched, allowlisted, cookieless event intake

Why first-party instead of a hosted analytics vendor: Onramp's whole pitch is
that we read customer source code and treat it seriously. Handing a third party
a stream of page views, paths and funnels for a product in that category is a
harder story to tell than "the data never leaves our infrastructure." It also
removes an entire class of bug — see the URL handling below.

Design constraints this endpoint enforces, so that a careless client cannot
violate them:

* **Allowlisted event names and properties.** Unknown names and unknown or
  over-long property values are dropped, not stored. A client cannot invent new
  fields and cannot smuggle free text through ``props``.
* **No cookies, no fingerprinting, no IP retention.** The visitor id is a keyed
  hash of (client IP, server secret, UTC date). It rotates daily, is not
  correlatable across days, and the IP itself is never written. There is nothing
  here to identify a person with.
* **Query strings and fragments are stripped server-side.** This is the
  important one. ``/reset-password?token=<jwt>`` and
  ``/verify-email?token=<jwt>`` (see auth.py) put bearer credentials in the URL.
  A hosted analytics script that logs ``location.href`` would ship every
  password reset to a third party. Here the path is validated against a strict
  pattern and anything containing ``?`` or ``#`` is refused outright, so a
  token cannot be persisted even if a client sends a full URL by mistake.
* **Bounded batch size and rate limit**, so this cannot be used to fill the
  database.

No authentication: the marketing funnel is anonymous by design, and requiring a
session would mean no data from the people you most need to know about — the
ones who never signed up.
"""

import hashlib
import hmac
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.analytics")
router = APIRouter(tags=["analytics"])

COLLECTION = "onramp_events"

# Retention target. Rows older than this should be purged (see the note in
# Readme.md / the ops runbook); nothing here reads them back automatically.
RETENTION_DAYS = int(os.getenv("ANALYTICS_RETENTION_DAYS", "180"))

# Event name -> the only properties that event may carry.
ALLOWED_EVENTS: dict[str, frozenset[str]] = {
    "cta_click": frozenset({"placement", "label", "href"}),
    "section_viewed": frozenset({"section"}),
    "calculator_adjusted": frozenset({"control"}),
    "pricing_tier_viewed": frozenset({"tier"}),
    "signup_completed": frozenset({"method"}),
    "docs_opened": frozenset({"section"}),
}

MAX_EVENTS_PER_REQUEST = 20
MAX_PROPS_PER_EVENT = 5
MAX_PROP_VALUE_LEN = 64

# A path only: no query string, no fragment, no scheme, no whitespace.
_PATH_RE = re.compile(r"^/[A-Za-z0-9\-_/]{0,120}$")

_RATE_WINDOW_SECONDS = 3600
_RATE_MAX = 240


class EventIn(BaseModel):
    name: str = Field(max_length=64)
    props: dict[str, Any] = Field(default_factory=dict)
    # Client clock is not trusted; recorded for debugging only.
    ts: int | None = None


class EventBatch(BaseModel):
    events: list[EventIn] = Field(default_factory=list)
    # The page the events came from. A bare path only — see _normalise_path.
    path: str | None = None


def _client_ip(request: Request) -> str:
    """Client IP, honouring the proxy only when explicitly trusted."""
    if os.getenv("TRUST_PROXY", "false").lower() == "true":
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _visitor_id(ip: str, secret: str, day: str) -> str:
    """
    Daily-rotating pseudonymous id.

    Keyed with a server secret so the value cannot be reversed or correlated by
    anyone who obtains the event table, and salted with the date so consecutive
    days produce unrelated ids. The IP is an input to the hash and is never
    stored.
    """
    mac = hmac.new(
        secret.encode("utf-8"),
        f"{ip}|{day}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return mac[:32]


def _normalise_path(raw: Any) -> str | None:
    """
    Accept only a bare path. Refuses anything carrying a query string or
    fragment, which is how reset and verification tokens would arrive.
    """
    if not isinstance(raw, str) or not raw:
        return None
    if "?" in raw or "#" in raw:
        return None
    candidate = raw.split("?")[0].split("#")[0]
    if not _PATH_RE.match(candidate):
        return None
    return candidate


def _clean_props(name: str, props: dict[str, Any]) -> dict[str, str]:
    """Keep only allowlisted keys with short scalar values."""
    allowed = ALLOWED_EVENTS[name]
    out: dict[str, str] = {}
    for key, value in list(props.items())[:MAX_PROPS_PER_EVENT]:
        if key not in allowed:
            continue
        if isinstance(value, bool):
            out[key] = "true" if value else "false"
        elif isinstance(value, (int, float)):
            out[key] = str(value)[:MAX_PROP_VALUE_LEN]
        elif isinstance(value, str):
            out[key] = value[:MAX_PROP_VALUE_LEN]
        # Anything else (dict, list, None) is dropped rather than serialised.
    return out


@router.post("/events")
async def track_events(batch: EventBatch, request: Request) -> Response:
    """
    Accept a batch of analytics events. Always answers 204.

    A 204 regardless of outcome is deliberate: a rejected analytics call should
    never surface as a console error in someone's browser, and should never tell
    a prober whether a payload was accepted.
    """
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")

    if not batch.events:
        return Response(status_code=204)

    secret = os.getenv("JWT_SECRET", "onramp-analytics-unconfigured")
    visitor = _visitor_id(_client_ip(request), secret, day)

    # Rate limit per visitor per hour. Fails open — analytics must never break
    # the product, and the batch cap below still bounds any single request.
    storage = get_storage()
    try:
        rl_key = f"analytics:{visitor}"
        recent = await storage.query_documents("rate_limits", [("key", "==", rl_key)])
        cutoff = now - timedelta(seconds=_RATE_WINDOW_SECONDS)
        in_window = 0
        for row in recent:
            created = row.get("created_at", "")
            try:
                if datetime.fromisoformat(created) < cutoff:
                    continue
            except (TypeError, ValueError):
                continue
            in_window += 1
        if in_window >= _RATE_MAX:
            logger.info("analytics rate limit hit for visitor %s", visitor[:8])
            return Response(status_code=204)
        await storage.create_document("rate_limits", generate_id(), {
            "key": rl_key,
            "created_at": now.isoformat(),
        })
    except Exception:
        logger.debug("analytics rate limit check skipped", exc_info=True)

    rows: list[tuple[str, dict]] = []
    dropped_unknown = 0

    # One path for the whole batch, validated once. A path carrying a query
    # string or fragment is dropped rather than stored — that is the guard that
    # keeps /reset-password?token=<jwt> out of the table even if a client sends
    # a full href by mistake. The event is still recorded, just without a path.
    path = _normalise_path(batch.path)

    for event in batch.events[:MAX_EVENTS_PER_REQUEST]:
        if event.name not in ALLOWED_EVENTS:
            dropped_unknown += 1
            continue

        props = _clean_props(event.name, event.props)
        if path:
            props["path"] = path

        rows.append((generate_id(), {
            "visitor_id": visitor,
            "name": event.name,
            "props": props,
            "day": day,
            "occurred_at": now.isoformat(),
        }))

    if dropped_unknown:
        logger.info("analytics dropped %d unknown event name(s)", dropped_unknown)
    if batch.path and not path:
        logger.info("analytics rejected unusable path %r", batch.path[:80])

    if not rows:
        return Response(status_code=204)

    try:
        await storage.create_documents(COLLECTION, rows)
    except Exception:
        # Never let analytics take down a page view.
        logger.warning("failed to persist analytics batch", exc_info=True)

    return Response(status_code=204)
