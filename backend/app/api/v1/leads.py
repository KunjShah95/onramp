"""
Inbound leads from the public contact form.

  POST /api/v1/leads   — anonymous; stores one contact-form submission

The contact form used to discard submissions in the browser, so every
"talk to us" message from the marketing site was lost. Submissions now land in
the ``leads`` collection (email and name encrypted at rest, like user PII) and,
when ``LEADS_NOTIFY_EMAIL`` and SendGrid are configured, a notification email
goes to the team. Platform admins read them via ``GET /api/v1/admin/leads``.

Abuse controls: a hidden honeypot field, strict length limits, and a per-IP
hourly cap keyed by an HMAC of the IP (the IP itself is never stored).
"""

import hashlib
import hmac
import html
import logging
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from app.services.field_encryption import encrypt_field
from app.services.postgres_db import generate_id, get_storage

logger = logging.getLogger("onramp.leads")
router = APIRouter(tags=["leads"])

COLLECTION = "leads"
_RATE_WINDOW_SECONDS = 3600
_RATE_MAX = 5
_UTM_RE = re.compile(r"^[A-Za-z0-9._\-]{1,64}$")


class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    company: str | None = Field(default=None, max_length=120)
    subject: str | None = Field(default=None, max_length=160)
    message: str = Field(min_length=1, max_length=4000)
    utm_source: str | None = Field(default=None, max_length=64)
    utm_medium: str | None = Field(default=None, max_length=64)
    utm_campaign: str | None = Field(default=None, max_length=64)
    # Honeypot: hidden in the form, so only bots fill it in.
    website: str | None = Field(default=None, max_length=200)


def _client_ip(request: Request) -> str:
    if os.getenv("TRUST_PROXY", "false").lower() == "true":
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _ip_key(ip: str) -> str:
    secret = os.getenv("JWT_SECRET", "onramp-leads-unconfigured")
    return hmac.new(secret.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def clean_utm(value: str | None) -> str | None:
    """Keep a UTM value only if it is a short slug; drop anything else."""
    if value and _UTM_RE.match(value):
        return value
    return None


async def _over_rate_limit(storage, key: str, now: datetime) -> bool:
    """Per-IP hourly cap. Fails open so a storage hiccup never blocks a lead."""
    try:
        rows = await storage.query_documents("rate_limits", [("key", "==", key)])
        cutoff = now - timedelta(seconds=_RATE_WINDOW_SECONDS)
        recent = 0
        for row in rows:
            try:
                if datetime.fromisoformat(row.get("created_at", "")) >= cutoff:
                    recent += 1
            except (TypeError, ValueError):
                continue
        if recent >= _RATE_MAX:
            return True
        await storage.create_document("rate_limits", generate_id(), {
            "key": key,
            "created_at": now.isoformat(),
        })
    except Exception:
        logger.debug("lead rate limit check skipped", exc_info=True)
    return False


async def _notify(lead: LeadIn) -> None:
    to = os.getenv("LEADS_NOTIFY_EMAIL", "").strip()
    if not to:
        return
    from app.services.email_service import send_email

    rows = [
        ("Name", lead.name),
        ("Email", str(lead.email)),
        ("Company", lead.company or "-"),
        ("Subject", lead.subject or "-"),
        ("Source", " / ".join(filter(None, [lead.utm_source, lead.utm_medium, lead.utm_campaign])) or "-"),
    ]
    table = "".join(
        f"<tr><td><b>{html.escape(k)}</b></td><td>{html.escape(v)}</td></tr>" for k, v in rows
    )
    body = f"<table>{table}</table><p>{html.escape(lead.message).replace(chr(10), '<br>')}</p>"
    subject = f"New Onramp lead: {lead.name[:60]}"
    await send_email(to, subject, body)


@router.post("/leads")
async def create_lead(lead: LeadIn, request: Request) -> dict:
    """Store a contact-form submission. Answers the same way for honeypot hits."""
    if lead.website:
        logger.info("lead honeypot triggered; dropping submission")
        return {"received": True}

    now = datetime.now(timezone.utc)
    storage = get_storage()
    if await _over_rate_limit(storage, f"leads:{_ip_key(_client_ip(request))}", now):
        raise HTTPException(status_code=429, detail="Too many messages. Please try again later.")

    lead_id = generate_id()
    await storage.create_document(COLLECTION, lead_id, {
        "name": encrypt_field(lead.name.strip()),
        "email": encrypt_field(str(lead.email)),
        "company": (lead.company or "").strip() or None,
        "subject": (lead.subject or "").strip() or None,
        "message": encrypt_field(lead.message.strip()),
        "utm_source": clean_utm(lead.utm_source),
        "utm_medium": clean_utm(lead.utm_medium),
        "utm_campaign": clean_utm(lead.utm_campaign),
        "status": "new",
        "created_at": now.isoformat(),
    })

    try:
        await _notify(lead)
    except Exception:
        logger.warning("lead notification failed for %s", lead_id, exc_info=True)

    return {"received": True, "id": lead_id}
