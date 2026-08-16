"""
Admin router — owner-level endpoints for cross-team management.

All routes in this module require the caller to hold the "admin" role
in at least one team. This is enforced by require_admin_access.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
import hashlib
import hmac
import json
import os
import secrets
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.api.v1.auth import get_current_user
from app.services.team_service import get_user_teams

from app.services.audit_service import query_events
from app.services.audit_log_service import log_key_action
from app.services.webhook_service import get_webhook as _get_webhook
from app.services import platform_provider_keys

router = APIRouter(prefix="/admin", tags=["admin"])

ROLE_HIERARCHY = {"admin": 3, "senior": 2, "member": 1}


async def _require_owner(user: dict = Depends(get_current_user)) -> str:
    """Require the user to be an owner of at least one team."""
    uid = user.get("uid", "")
    teams = await get_user_teams(uid)
    is_admin = any(t.get("role") == "admin" for t in teams)
    if not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin access requires the 'admin' role in at least one team",
        )
    return uid


@router.post("/keys/rehash")
async def rehash_all_api_keys(
    uid: str = Depends(_require_owner),
):
    """Validate and report on API key hashing status.

    Since plaintext keys are not stored, 're-hashing' means validating
    that all active keys were hashed with the current pepper. New keys
    are always created with HMAC-SHA256.
    """
    from app.services.api_key_service import (
        rehash_existing_keys, get_pepper, CURRENT_PEPPER_VERSION, _legacy_fallback_enabled,
    )

    pepper_status = "configured" if os.getenv("API_KEY_HMAC_SECRET") else "using dev default"
    result = await rehash_existing_keys()
    result["pepper_status"] = pepper_status
    result["current_pepper_version"] = CURRENT_PEPPER_VERSION
    result["legacy_fallback_enabled"] = _legacy_fallback_enabled()
    return result


@router.get("/keys")
async def list_all_api_keys(
    include_revoked: bool = Query(False),
    uid: str = Depends(_require_owner),
):
    """List all API keys across all teams and users.

    Warning: expensive if there are many keys. Consider pagination.
    Only accessible to team owners (admin).
    """
    from app.services.postgres_db import get_storage

    storage = get_storage()
    raw_keys = await storage.list_documents("api_keys")

    result = []
    for k in raw_keys:
        if not include_revoked and not k.get("is_active", True):
            continue
        perms = k.get("permissions") or {}
        result.append({
            "key_id": k.get("id"),
            "name": k.get("name"),
            "team_id": k.get("team_id"),
            "user_id": k.get("user_id"),
            "tier": perms.get("tier", "free"),
            "org_name": perms.get("org_name", k.get("name")),
            "is_active": k.get("is_active", True),
            "created_at": k.get("created_at"),
            "last_used_at": k.get("last_used_at"),
            "expires_at": k.get("expires_at"),
        })

    result.sort(key=lambda k: k.get("created_at", ""), reverse=True)
    return {"keys": result, "count": len(result)}


@router.get("/usage")
async def get_global_usage(
    period: Optional[str] = Query(None),
    days: int = Query(14, ge=1, le=90),
    uid: str = Depends(_require_owner),
):
    """Aggregated usage across ALL teams.

    Optionally filter by period: "day", "week", "month". Also returns the
    provider free-vs-paid attribution and dollar cost figures (from the route
    metadata logged by the LLM gateway), plus a daily ``provider_series`` of
    length ``days`` (default 14) for the free-vs-paid-over-time chart.
    """
    from app.services.postgres_db import get_storage
    from app.services.usage_tracker import route_meta

    storage = get_storage()
    all_records = await storage.list_documents("usage_records")

    now = datetime.now(timezone.utc)
    if period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=7)
    elif period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = None

    if start:
        cutoff = start.isoformat()
        filtered = [r for r in all_records if r.get("created_at", "") >= cutoff]
    else:
        filtered = all_records

    total_requests = len(filtered)
    total_credits = sum(r.get("tokens_used", 0) for r in filtered)

    # Per-team breakdown
    team_breakdown: dict[str, dict] = {}
    for r in filtered:
        tid = r.get("team_id", "unknown")
        if tid not in team_breakdown:
            team_breakdown[tid] = {"requests": 0, "credits": 0}
        team_breakdown[tid]["requests"] += 1
        team_breakdown[tid]["credits"] += r.get("tokens_used", 0)

    # Endpoint breakdown
    endpoint_breakdown: dict[str, int] = {}
    for r in filtered:
        ep = r.get("endpoint", "unknown")
        endpoint_breakdown[ep] = endpoint_breakdown.get(ep, 0) + 1

    # ── Provider attribution + dollar savings (free-first routing) ──
    # Only records with route metadata (provider set) are tracked here; agent
    # calls and gateway traffic both log route metadata via record_usage.
    free_requests = 0
    paid_requests = 0
    tracked_requests = 0
    total_cost_usd = 0.0
    total_cost_avoided_usd = 0.0

    series_start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    buckets: dict[str, dict] = {}
    for offset in range(days):
        day = (series_start + timedelta(days=offset)).date().isoformat()
        buckets[day] = {"date": day, "free": 0, "paid": 0, "cost_usd": 0.0, "cost_avoided_usd": 0.0}

    for r in filtered:
        meta = route_meta(r)
        if not meta.get("provider"):
            continue
        tracked_requests += 1
        if meta.get("free"):
            free_requests += 1
        else:
            paid_requests += 1
        total_cost_usd += float(r.get("cost_usd") or 0.0)
        total_cost_avoided_usd += float(meta.get("cost_avoided_usd") or 0.0)

        created = r.get("created_at")
        day = str(created)[:10] if created else ""
        bucket = buckets.get(day)
        if bucket is None:
            continue
        if meta.get("free"):
            bucket["free"] += 1
        else:
            bucket["paid"] += 1
        bucket["cost_usd"] += float(r.get("cost_usd") or 0.0)
        bucket["cost_avoided_usd"] += float(meta.get("cost_avoided_usd") or 0.0)

    return {
        "period": period or "all",
        "total_requests": total_requests,
        "total_credits": total_credits,
        "team_breakdown": team_breakdown,
        "endpoint_breakdown": endpoint_breakdown,
        # Free-first routing attribution + dollar savings
        "tracked_requests": tracked_requests,
        "free_requests": free_requests,
        "paid_requests": paid_requests,
        "free_pct": round(100.0 * free_requests / tracked_requests, 1) if tracked_requests else 0.0,
        "total_cost_usd": round(total_cost_usd, 6),
        "total_cost_avoided_usd": round(total_cost_avoided_usd, 6),
        "provider_series": list(buckets.values()),
    }


@router.get("/usage/teams")
async def get_team_usage_summaries(
    uid: str = Depends(_require_owner),
):
    """Per-team usage summary — credits used and request count for each team."""
    from app.services.postgres_db import get_storage

    storage = get_storage()
    all_teams = await storage.list_documents("teams")
    all_records = await storage.list_documents("usage_records")

    # Build usage per team
    team_usage: dict[str, dict] = {}
    for r in all_records:
        tid = r.get("team_id")
        if not tid:
            continue
        if tid not in team_usage:
            team_usage[tid] = {"requests": 0, "credits": 0}
        team_usage[tid]["requests"] += 1
        team_usage[tid]["credits"] += r.get("tokens_used", 0)

    result = []
    for team in all_teams:
        tid = team.get("team_id") or team.get("id")
        usage = team_usage.get(tid, {"requests": 0, "credits": 0})
        result.append({
            "team_id": tid,
            "team_name": team.get("name", tid),
            "tier": team.get("tier", "free"),
            "member_count": len(team.get("members", [])),
            "total_requests": usage["requests"],
            "total_credits": usage["credits"],
        })

    result.sort(key=lambda t: t["total_requests"], reverse=True)
    return {"teams": result, "count": len(result)}


@router.get("/audit")
async def list_all_audit_events(
    event_type: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    uid: str = Depends(_require_owner),
):
    """List all audit events across all teams (global audit log).

    Only accessible to team owners (admin).
    """
    events = await query_events(
        actor_id=actor_id,
        event_type=event_type,
        limit=limit,
    )
    return {"events": events, "count": len(events)}


# ── Admin Webhook Endpoints ─────────────────────────────────


@router.get("/webhooks")
async def list_all_webhooks(
    active_only: bool = Query(False),
    uid: str = Depends(_require_owner),
):
    """List ALL webhooks across all users (global admin view).

    Only accessible to team owners (admin).
    """
    from app.services.postgres_db import get_storage

    storage = get_storage()
    webhooks = await storage.list_documents("onramp_webhooks")

    if active_only:
        webhooks = [w for w in webhooks if w.get("active", True)]

    # Mask secrets for list view
    for w in webhooks:
        if w.get("secret"):
            w["secret"] = w["secret"][:12] + "…"

    webhooks.sort(key=lambda w: w.get("created_at", ""), reverse=True)
    return {"webhooks": webhooks, "count": len(webhooks)}


@router.get("/webhooks/{webhook_id}")
async def get_admin_webhook(
    webhook_id: str,
    uid: str = Depends(_require_owner),
):
    """Get full details of any webhook (bypasses user ownership check)."""
    webhook = await _get_webhook(webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.post("/webhooks/{webhook_id}/test")
async def test_admin_webhook(
    webhook_id: str,
    uid: str = Depends(_require_owner),
):
    """Test/send a ping to any webhook (bypasses user ownership check)."""


    webhook = await _get_webhook(webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    # Replicate test logic without user_id check
    import httpx
    from datetime import datetime, timezone

    payload = {
        "event": "test.ping",
        "webhook_id": webhook_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {"message": "This is a test ping from Onramp Admin."},
    }

    try:
        secret = webhook.get("secret", "")
        body = json.dumps(payload)
        signature = hmac.new(
            secret.encode(), body.encode(), hashlib.sha256
        ).hexdigest()

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                webhook["url"],
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Onramp-Event": "test.ping",
                    "X-Onramp-Signature": f"sha256={signature}",
                    "X-Onramp-Delivery": webhook_id,
                },
            )

        return {
            "success": resp.status_code < 400,
            "status_code": resp.status_code,
            "error": None if resp.status_code < 400 else f"HTTP {resp.status_code}",
        }
    except Exception as e:
        return {"success": False, "status_code": None, "error": str(e)}


@router.delete("/webhooks/{webhook_id}")
async def delete_admin_webhook(
    webhook_id: str,
    uid: str = Depends(_require_owner),
):
    """Delete any webhook (bypasses user ownership check)."""
    from app.services.postgres_db import get_storage
    from app.services.webhook_service import COLLECTION as WH_COLLECTION

    storage = get_storage()
    webhook = await _get_webhook(webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await storage.delete_document(WH_COLLECTION, webhook_id)
    return {"deleted": True, "webhook_id": webhook_id}


@router.get("/webhooks/{webhook_id}/deliveries")
async def get_webhook_deliveries(
    webhook_id: str,
    limit: int = Query(50, ge=1, le=200),
    uid: str = Depends(_require_owner),
):
    """Get delivery history for a specific webhook (admin view)."""
    from app.services.postgres_db import get_storage
    from app.services.webhook_service import DELIVERIES_COLLECTION

    storage = get_storage()
    deliveries = await storage.query_documents(
        DELIVERIES_COLLECTION,
        [("webhook_id", "==", webhook_id)],
    )
    deliveries.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return {"deliveries": deliveries[:limit], "count": len(deliveries)}


@router.get("/audit/export")
async def export_audit_events(
    format: str = Query("json", pattern="^(json|csv)$"),
    event_type: Optional[str] = Query(None),
    actor_id: Optional[str] = Query(None),
    limit: int = Query(1000, ge=1, le=10000),
    uid: str = Depends(_require_owner),
):
    """Export audit events in JSON or CSV format (SIEM-compatible)."""
    from app.services.audit_service import query_events

    events = await query_events(
        actor_id=actor_id,
        event_type=event_type,
        limit=limit,
    )

    if format == "csv":
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["event_id", "event_type", "actor_id", "target_id", "team_id", "timestamp", "metadata"])
        for e in events:
            writer.writerow([
                e.get("event_id", ""),
                e.get("event_type", ""),
                e.get("actor_id", ""),
                e.get("target_id", ""),
                e.get("team_id", ""),
                e.get("timestamp", ""),
                json.dumps(e.get("metadata", {})),
            ])
        from starlette.responses import Response
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=audit-log-export.csv"},
        )

    return {"events": events, "count": len(events), "exported_at": datetime.now(timezone.utc).isoformat()}


@router.post("/webhooks/{webhook_id}/rotate-secret")
async def rotate_admin_webhook_secret(
    webhook_id: str,
    uid: str = Depends(_require_owner),
):
    """Rotate the signing secret for any webhook (bypasses user check)."""
    from app.services.postgres_db import get_storage
    from app.services.webhook_service import COLLECTION as WH_COLLECTION

    storage = get_storage()
    webhook = await _get_webhook(webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    new_secret = f"whsec_{secrets.token_hex(20)}"
    updated = await storage.update_document(WH_COLLECTION, webhook_id, {
        "secret": new_secret,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return updated


# ── Platform Provider Keys (managed via the website, not .env) ─────────────


class AdminProviderKeyRequest(BaseModel):
    api_key: str


@router.get("/ai/provider-keys")
async def list_platform_provider_keys(
    uid: str = Depends(_require_owner),
):
    """List platform-level provider keys (masked — never the secrets).

    These are the keys the LLM/embedding routers use platform-wide, configured
    here instead of in ``backend/.env``. Encrypted at rest.
    """
    providers = await platform_provider_keys.list_platform_keys()
    await log_key_action(
        org_name="global",
        action="platform_provider_keys_listed",
        user_id=uid,
        user_role="admin",
        details={"key_count": len(providers)},
    )
    return {"providers": providers, "count": len(providers)}


@router.put("/ai/provider-keys/{provider}")
async def set_platform_provider_key(
    provider: str,
    request: AdminProviderKeyRequest,
    req: Request,
    uid: str = Depends(_require_owner),
):
    """Store (or replace) a platform-level provider key and apply it live."""
    result = await platform_provider_keys.set_platform_key(
        provider, request.api_key, uid
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    # Push into the running routers immediately (no restart / .env edit).
    await platform_provider_keys.refresh_runtime_routers(req.app)
    await log_key_action(
        org_name="global",
        action="platform_provider_key_set",
        user_id=uid,
        user_role="admin",
        details={"provider": result.get("provider")},
    )
    return result


@router.delete("/ai/provider-keys/{provider}")
async def delete_platform_provider_key(
    provider: str,
    req: Request,
    uid: str = Depends(_require_owner),
):
    """Remove a platform-level provider key and apply the change live."""
    ok = await platform_provider_keys.delete_platform_key(provider)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"No key configured for provider '{provider}'",
        )
    await platform_provider_keys.refresh_runtime_routers(req.app)
    await log_key_action(
        org_name="global",
        action="platform_provider_key_deleted",
        user_id=uid,
        user_role="admin",
        details={"provider": provider},
    )
    return {"deleted": True, "provider": provider}
