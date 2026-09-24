import logging
import os
import uuid
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.services.api_key_service import APIKeyService, TIER_LIMITS, CREDIT_COSTS
from app.services.usage_tracker import UsageTracker
from app.api.v1.auth import get_current_user, get_user_or_api_key
from app.services.team_service import get_team_members, add_member, get_user_teams
from app.middleware.access_guard import ROLE_HIERARCHY
from app.services.audit_log_service import log_key_action, get_audit_logs
from app.services.webhook_service import send_webhook
from app.services import team_provider_keys, team_routing_settings
from app.llm import RoutingMode

logger = logging.getLogger("onramp.ai_gateway")

router = APIRouter(prefix="/ai", tags=["ai-gateway"])
key_service = APIKeyService()
usage = UsageTracker()


async def resolve_org_team_id(org_name: str, user: dict) -> str:
    """Resolve an org identifier to a team UUID for storage scoping.

    Accepts a team UUID directly, a team id from the caller's own memberships,
    or a caller-scoped team display name (``"Foundation"``). Anything else is
    a 404 — never a bare 500 from a UUID-typed column lookup.
    """
    teams = await get_user_teams(user["uid"])
    if org_name in {(t.get("team_id") or t.get("id")) for t in teams}:
        return org_name
    try:
        uuid.UUID(str(org_name))
        return org_name
    except (ValueError, AttributeError, TypeError):
        pass
    match = next(
        (t for t in teams
         if (t.get("name") or "").lower() == str(org_name).lower()),
        None,
    )
    if match is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return match.get("team_id") or match.get("id")


async def _ensure_org_access(org_name: str, user: dict, allow_create: bool = False) -> None:
    """Authorize access to an org's resources by team membership.

    The org_name maps to a team scope. Rules:
      - members of the team are allowed.
      - if the org has no members yet and allow_create is set, the caller becomes
        its owner (first-touch ownership) and is allowed.
      - otherwise 403.
    """
    team_id = await resolve_org_team_id(org_name, user)
    members = await get_team_members(team_id)
    member_ids = {m.get("id") or m.get("user_id") for m in members}
    if user["uid"] in member_ids:
        return
    if allow_create and not members:
        await add_member(team_id, user["uid"], role="admin")
        return
    raise HTTPException(status_code=403, detail="Not a member of this organization")


async def _require_key_manager_role(org_name: str, user: dict) -> str:
    """Enforce API key manager role: CEO, CTO, senior_dev, senior, or hr only.

    Returns the user's verified role. Raises 403 if not authorized.
    First-touch: if org has no members, caller becomes owner.
    """
    KEY_MANAGER_ROLES = {"ceo", "cto", "admin", "senior_dev", "senior", "hr"}

    uid = user["uid"]
    team_id = await resolve_org_team_id(org_name, user)

    members = await get_team_members(team_id)
    member_ids = {m.get("id") or m.get("user_id") for m in members}

    if uid not in member_ids:
        if not members:
            await add_member(team_id, uid, role="admin")
            return "admin"
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    teams = await get_user_teams(uid)
    user_role = None
    for team in teams:
        if (team.get("team_id") or team.get("id")) == team_id:
            user_role = team.get("role")
            break

    if user_role is None:
        raise HTTPException(status_code=403, detail="Role information not found")

    if user_role not in KEY_MANAGER_ROLES:
        raise HTTPException(
            status_code=403,
            detail=f"Only CEO, CTO, senior, or HR can manage API keys. Your role: {user_role}",
        )

    return user_role


class CreateKeyRequest(BaseModel):
    org_name: str
    tier: str = "free"
    name: Optional[str] = None
    credit_limit: Optional[int] = None
    daily_credit_cap: Optional[int] = None
    expires_in_days: Optional[int] = None
    webhook_url: Optional[str] = None
    # NOTE: created_by is intentionally NOT accepted from the client.


class RotateKeyRequest(BaseModel):
    key_id: str
    webhook_url: Optional[str] = None


class AuditLogEntry(BaseModel):
    id: str
    org_name: str
    action: str  # created, rotated, revoked, listed
    user_id: str
    user_role: str
    key_id: Optional[str] = None
    timestamp: str
    details: Optional[Dict[str, Any]] = None


class WebhookConfig(BaseModel):
    url: str
    events: list[str] = ["key_created", "key_rotated", "key_revoked"]


class ValidateKeyRequest(BaseModel):
    raw_key: Optional[str] = None


class CreateKeyResponse(BaseModel):
    raw_key: str
    key_id: str
    org_name: str
    tier: str
    name: Optional[str] = None
    credit_limit: Optional[int] = None
    daily_credit_cap: Optional[int] = None
    expires_at: Optional[str] = None


class UsageResponse(BaseModel):
    org_name: str
    period: str
    total_credits: int
    total_requests: int
    endpoint_breakdown: dict


@router.post("/keys", response_model=CreateKeyResponse)
async def create_api_key(
    request: CreateKeyRequest,
    user: dict = Depends(get_current_user),
):
    # Attribution is taken from the authenticated session, never the client body.
    # Caller must be CEO, CTO, senior, or HR to manage keys.
    user_role = await _require_key_manager_role(request.org_name, user)
    if request.credit_limit is not None and request.credit_limit < 0:
        raise HTTPException(status_code=400, detail="credit_limit cannot be negative")
    if request.expires_in_days is not None and request.expires_in_days < 1:
        raise HTTPException(status_code=400, detail="expires_in_days must be a positive number of days")
    result = await key_service.create_key(
        org_name=request.org_name,
        tier=request.tier,
        created_by=user["uid"],
        org_id=await resolve_org_team_id(request.org_name, user),
        name=request.name,
        credit_limit=request.credit_limit,
        daily_credit_cap=request.daily_credit_cap,
        expires_in_days=request.expires_in_days,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_key_action(
        org_name=request.org_name,
        action="created",
        user_id=user["uid"],
        user_role=user_role,
        key_id=result["key_id"],
        details={
            "tier": request.tier,
            "credit_limit": request.credit_limit,
            "expires_in_days": request.expires_in_days,
        },
    )

    if request.webhook_url:
        await send_webhook(
            webhook_url=request.webhook_url,
            event_type="key_created",
            key_id=result["key_id"],
            org_name=request.org_name,
            details={
                "tier": request.tier,
                "timestamp": result.get("created_at"),
            },
        )

    return CreateKeyResponse(
        raw_key=result["raw_key"],
        key_id=result["key_id"],
        org_name=result["org_name"],
        tier=result["tier"],
        name=result.get("name"),
        credit_limit=result.get("credit_limit"),
        daily_credit_cap=result.get("daily_credit_cap"),
        expires_at=result.get("expires_at"),
    )


@router.get("/keys")
async def list_api_keys(
    org_name: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    # Never list all keys across tenants. Scope to an org (with membership
    # verification and key manager role) or fall back to the caller's own user-scoped keys.
    if org_name:
        user_role = await _require_key_manager_role(org_name, user)
        team_scope = await resolve_org_team_id(org_name, user)
        keys = await key_service.list_keys(team_scope, owner_type="team")
        await log_key_action(
            org_name=org_name,
            action="listed",
            user_id=user["uid"],
            user_role=user_role,
            details={"key_count": len(keys)},
        )
    else:
        keys = await key_service.list_keys(user["uid"], owner_type="user")
    return {"keys": keys, "count": len(keys)}


@router.delete("/keys/{key_id}", responses={404: {"description": "Key not found"}})
async def revoke_api_key(
    key_id: str,
    user: dict = Depends(get_current_user),
):
    key = await key_service.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")

    uid = user["uid"]
    perms = key.get("permissions") or {}
    owns_key = (
        key.get("user_id") == uid
        or perms.get("created_by") == uid
    )
    # team_id stores the org scope in this model — key managers may also revoke.
    if not owns_key:
        org_scope = key.get("team_id")
        if org_scope:
            await _require_key_manager_role(org_scope, user)
        else:
            raise HTTPException(status_code=403, detail="Not authorized to revoke this key")

    success = await key_service.revoke_key(key_id)
    if not success:
        raise HTTPException(status_code=404, detail="Key not found")

    await log_key_action(
        org_name=key.get("team_id", ""),
        action="revoked",
        user_id=uid,
        user_role=user.get("role", "unknown"),
        key_id=key_id,
    )

    return {"revoked": True, "key_id": key_id}


@router.post("/keys/{key_id}/rotate", response_model=CreateKeyResponse, responses={404: {"description": "Key not found"}})
async def rotate_api_key(
    key_id: str,
    request: RotateKeyRequest,
    user: dict = Depends(get_current_user),
):
    """Rotate an API key — revokes old key, generates new one with same settings.

    Only key creators or key managers can rotate. Old key is immediately revoked.
    Returns new raw key (never retrievable again).
    """
    key = await key_service.get_key(key_id)
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")

    uid = user["uid"]
    perms = key.get("permissions") or {}
    owns_key = key.get("user_id") == uid or perms.get("created_by") == uid

    if not owns_key:
        org_scope = key.get("team_id")
        if org_scope:
            await _require_key_manager_role(org_scope, user)
        else:
            raise HTTPException(status_code=403, detail="Not authorized to rotate this key")

    org_name = key.get("team_id") or key.get("org_name")
    tier = perms.get("tier", key.get("tier", "free"))
    credit_limit = perms.get("credit_limit")
    daily_credit_cap = perms.get("daily_credit_cap")
    name = key.get("name")

    await key_service.revoke_key(key_id)

    # Stored scope predates org resolution (may be a display name): prefer
    # the resolved team UUID, fall back to the raw scope for legacy keys.
    try:
        team_scope = await resolve_org_team_id(org_name, user)
    except HTTPException:
        team_scope = org_name
    result = await key_service.create_key(
        org_name=org_name,
        tier=tier,
        created_by=uid,
        org_id=team_scope,
        name=f"{name} (rotated)" if name else None,
        credit_limit=credit_limit,
        daily_credit_cap=daily_credit_cap,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    await log_key_action(
        org_name=org_name,
        action="rotated",
        user_id=uid,
        user_role=user.get("role", "unknown"),
        key_id=result["key_id"],
        details={"old_key_id": key_id},
    )

    if request.webhook_url:
        await send_webhook(
            webhook_url=request.webhook_url,
            event_type="key_rotated",
            key_id=result["key_id"],
            org_name=org_name,
            details={"old_key_id": key_id, "timestamp": result.get("created_at")},
        )

    return CreateKeyResponse(
        raw_key=result["raw_key"],
        key_id=result["key_id"],
        org_name=result["org_name"],
        tier=result["tier"],
        name=result.get("name"),
        credit_limit=result.get("credit_limit"),
        daily_credit_cap=result.get("daily_credit_cap"),
        expires_at=result.get("expires_at"),
    )


@router.get("/audit-logs/{org_name}")
async def get_key_audit_logs(
    org_name: str,
    limit: int = 50,
    action: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Fetch API key audit logs for an org.

    Only key managers can view audit logs. Logs all creation, rotation,
    and revocation events with user attribution.
    """
    await _require_key_manager_role(org_name, user)

    logs = await get_audit_logs(org_name, limit=min(limit, 100), action_filter=action)

    return {
        "org_name": org_name,
        "logs": logs,
        "count": len(logs),
    }


@router.post("/keys/validate")
async def validate_api_key(
    body: Optional[ValidateKeyRequest] = None,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    user: dict = Depends(get_current_user),
):
    # FIX #4: never accept the secret in the URL path. The key is read from the
    # request body or the X-API-Key header. Requires authentication.
    raw_key = x_api_key or (body.raw_key if body else None)
    if not raw_key:
        raise HTTPException(
            status_code=400,
            detail="Provide the API key in the request body or X-API-Key header",
        )
    key = await key_service.validate_key(raw_key)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")
    perms = key.get("permissions") or {}
    tier = perms.get("tier", key.get("tier", "free"))
    limits = APIKeyService.get_tier_limits(tier)
    return {
        "valid": True,
        "org_name": key.get("team_id") or key.get("org_name"),
        "tier": tier,
        "limits": limits,
    }


class ProviderKeyRequest(BaseModel):
    api_key: str


@router.get("/keys/{org_name}/providers")
async def list_provider_keys(
    org_name: str,
    user: dict = Depends(get_current_user),
):
    """List which providers a team has BYOK keys for (masked, no secrets).

    Only key managers can view the roster. The raw keys are never returned;
    each entry reports ``configured`` plus audit metadata.
    """
    user_role = await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    providers = await team_provider_keys.list_team_keys(team_id)
    await log_key_action(
        org_name=org_name,
        action="provider_keys_listed",
        user_id=user["uid"],
        user_role=user_role,
        details={"key_count": len(providers)},
    )
    return {"org_name": org_name, "providers": providers, "count": len(providers)}


@router.put("/keys/{org_name}/providers/{provider}")
async def set_provider_key(
    org_name: str,
    provider: str,
    request: ProviderKeyRequest,
    user: dict = Depends(get_current_user),
):
    """Store (or replace) a team's BYOK key for an LLM/embedding provider.

    The key is encrypted at rest and immediately overrides the platform-level
    key for this provider for the team's gateway requests.
    """
    user_role = await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    result = await team_provider_keys.set_team_key(
        team_id, provider, request.api_key, user["uid"]
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    await log_key_action(
        org_name=org_name,
        action="provider_key_set",
        user_id=user["uid"],
        user_role=user_role,
        details={"provider": result.get("provider")},
    )
    return result


@router.delete("/keys/{org_name}/providers/{provider}", responses={404: {"description": "No key configured for provider"}})
async def delete_provider_key(
    org_name: str,
    provider: str,
    user: dict = Depends(get_current_user),
):
    """Remove a team's BYOK key for a provider (falls back to platform key)."""
    user_role = await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    ok = await team_provider_keys.delete_team_key(team_id, provider)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"No key configured for provider '{provider}'",
        )
    await log_key_action(
        org_name=org_name,
        action="provider_key_deleted",
        user_id=user["uid"],
        user_role=user_role,
        details={"provider": provider},
    )
    return {"deleted": True, "provider": provider}


@router.post("/keys/{org_name}/providers/{provider}/keys")
async def add_provider_key(
    org_name: str,
    provider: str,
    request: ProviderKeyRequest,
    user: dict = Depends(get_current_user),
):
    """Add an *extra* BYOK key to a provider's pool (multi-key load balancing).

    Teams can register several keys for the same provider; the router rotates
    round-robin across the pool on the team's gateway requests. The first key
    stored for a provider is the primary (what ``GET .../providers`` reports
    as configured); this endpoint appends additional slots.
    """
    user_role = await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    result = await team_provider_keys.add_team_key(
        team_id, provider, request.api_key, user["uid"]
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    await log_key_action(
        org_name=org_name,
        action="provider_key_added",
        user_id=user["uid"],
        user_role=user_role,
        details={"provider": result.get("provider"), "key_id": result.get("key_id")},
    )
    return result


@router.delete("/keys/{org_name}/providers/{provider}/keys/{key_id}", responses={404: {"description": "No key matched"}})
async def remove_provider_key(
    org_name: str,
    provider: str,
    key_id: str,
    user: dict = Depends(get_current_user),
):
    """Remove one specific key from a provider's pool.

    Removing the primary promotes the oldest remaining key. Returns 404 when
    no key matched ``key_id``.
    """
    user_role = await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    ok = await team_provider_keys.remove_team_key(team_id, provider, key_id)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"No key '{key_id}' configured for provider '{provider}'",
        )
    await log_key_action(
        org_name=org_name,
        action="provider_key_removed",
        user_id=user["uid"],
        user_role=user_role,
        details={"provider": provider, "key_id": key_id},
    )
    return {"deleted": True, "provider": provider, "key_id": key_id}


class RoutingModeRequest(BaseModel):
    routing_mode: Any


@router.get("/routing-mode/{org_name}")
async def get_routing_mode(
    org_name: str,
    user: dict = Depends(get_current_user),
):
    """Team's cost/quality routing dial (Cost / Balanced / Intelligence).

    Biases app.llm.LLMRouter's provider scoring for this team's gateway
    requests - see RoutingMode in app/llm.py. Defaults to BALANCED when the
    team hasn't set a preference.
    """
    await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    mode = await team_routing_settings.get_team_routing_mode(team_id)
    return {
        "org_name": org_name,
        "routing_mode": mode,
        "preset": next(
            (name for name, value in (
                ("cost", RoutingMode.COST),
                ("balanced", RoutingMode.BALANCED),
                ("intelligence", RoutingMode.INTELLIGENCE),
            ) if value == mode),
            None,
        ),
    }


@router.put("/routing-mode/{org_name}")
async def set_routing_mode(
    org_name: str,
    request: RoutingModeRequest,
    user: dict = Depends(get_current_user),
):
    """Set the team's cost/quality routing dial.

    Accepts an int 0-10 (0 = cheapest, 10 = highest quality) or a preset
    name ("cost" / "balanced" / "intelligence"). Takes effect on the team's
    next gateway request (short TTL cache, no restart needed).
    """
    user_role = await _require_key_manager_role(org_name, user)
    team_id = await resolve_org_team_id(org_name, user)
    result = await team_routing_settings.set_team_routing_mode(
        team_id, request.routing_mode, user["uid"]
    )
    await log_key_action(
        org_name=org_name,
        action="routing_mode_set",
        user_id=user["uid"],
        user_role=user_role,
        details={"routing_mode": result.get("routing_mode")},
    )
    return result


@router.get("/router-health")
async def get_router_health(req: Request, user: dict = Depends(get_current_user)):
    """Live per-provider reliability snapshot (circuit-breaker state, rolling
    success rate) from the app's LLMRouter instance - observability into
    *why* the router is (or isn't) reaching for a given provider right now.
    """
    llm = getattr(req.app.state, "llm", None)
    if llm is None or not hasattr(llm, "router_health"):
        raise HTTPException(status_code=503, detail="LLM router not initialized")
    return llm.router_health()


@router.get("/usage/{org_name}")
async def get_usage(
    org_name: str,
    period: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> UsageResponse:
    await _ensure_org_access(org_name, user)
    result = await usage.get_usage(org_name, period)
    return UsageResponse(**result)


@router.get("/usage/{org_name}/summary")
async def get_usage_summary(
    org_name: str,
    user: dict = Depends(get_current_user),
):
    await _ensure_org_access(org_name, user)
    return await usage.get_org_summary(org_name)


@router.get("/usage/{org_name}/providers")
async def get_provider_usage(
    org_name: str,
    period: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Provider attribution for an org — measures free-first routing savings.

    Counts requests per provider/model and the free vs paid split, based on
    the route metadata logged by the OpenAI-compatible gateway.
    """
    await _ensure_org_access(org_name, user)
    return await usage.get_provider_breakdown(org_name, period)


@router.get("/usage/{org_name}/quota")
async def check_quota(
    org_name: str,
    tier: str = "free",
    user: dict = Depends(get_current_user),
):
    await _ensure_org_access(org_name, user)
    limits = APIKeyService.get_tier_limits(tier)
    result = await usage.check_quota(org_name, limits)
    return result


@router.get("/tiers")
async def list_tiers():
    return {"tiers": TIER_LIMITS, "credit_costs": CREDIT_COSTS}


@router.get("/models")
async def list_llm_models(req: Request):
    """List the LLM router's model catalog (OpenRouter-style).

    Returns the available providers (and whether each is configured) plus
    the per-query-type routing preferences (code -> Claude, chat -> free
    fast models, structured -> JSON-capable models, ...). When a live
    OpenRouter catalog can be fetched it is merged in under
    ``openrouter_catalog`` (id, name, context length, per-1M-token pricing,
    free flag) so model picker UIs can list ids instead of routing blind.
    """
    llm = getattr(req.app.state, "llm", None)
    if llm is None or not hasattr(llm, "list_models"):
        raise HTTPException(status_code=503, detail="LLM router not initialized")
    catalog = llm.list_models()
    # Dynamic OpenRouter catalog — best-effort, cached. A fetch failure marks
    # ``catalog_fetched`` False and leaves the static catalog intact.
    try:
        from app.services.openrouter_catalog import fetch_catalog

        openrouter_key = (
            (getattr(llm, "platform_keys", None) or {}).get("openrouter")
            or os.getenv("OPENROUTER_API_KEY")
        )
        catalog["openrouter_catalog"] = await fetch_catalog(openrouter_key)
        catalog["catalog_fetched"] = True
    except Exception:
        logger.exception("Failed to fetch OpenRouter catalog")
        catalog["openrouter_catalog"] = []
        catalog["catalog_fetched"] = False
    return catalog


# ── AIaaS Agent Gateway ───────────────────────────────────────────────────────

# AI agent registry: maps agent names to the module/function that executes them
_AGENT_REGISTRY = {
    "explore": {
        "module": "app.agents.architecture_explorer",
        "class": "ArchitectureExplorer",
        "description": "Analyze repo architecture and generate interactive graphs",
        "required_params": ["repo_url"],
        "credit_action": "explore",
    },
    "health": {
        "module": "app.agents.health_scorer",
        "class": "HealthScorer",
        "description": "Score repository health (complexity, test coverage, docs)",
        "required_params": ["repo_structure"],
        "credit_action": "analyze",
    },
    "patterns": {
        "module": "app.agents.pattern_recognition",
        "class": "PatternRecognition",
        "description": "Find similar code patterns across repositories",
        "required_params": ["pattern", "repo_structure"],
        "credit_action": "analyze",
    },
    "learn": {
        "module": "app.agents.learning_path_generator",
        "class": "LearningPathGenerator",
        "description": "Generate personalized learning paths from a codebase",
        "required_params": ["repo_structure"],
        "credit_action": "learn",
    },
    "pr-review": {
        "module": "app.agents.pr_review",
        "class": "PRReviewAgent",
        "description": "Review a GitHub pull request and return structured feedback",
        "required_params": ["repo_url", "pr_number"],
        "credit_action": "pr_review",
    },
    "first-pr": {
        "module": "app.agents.first_pr_accelerator",
        "class": "FirstPRAccelerator",
        "description": "Find beginner-friendly issues and generate step-by-step guides",
        "required_params": ["repo_url"],
        "credit_action": "generate",
    },
    "drift": {
        "module": "app.agents.drift_detector",
        "class": "DriftDetector",
        "description": "Detect architecture drift between code and documentation",
        "required_params": ["repo_structure", "docs"],
        "credit_action": "analyze",
    },
    "trailer": {
        "module": "app.agents.codebase_trailer",
        "class": "CodebaseTrailer",
        "description": "Generate a movie-trailer-style summary of a codebase",
        "required_params": ["repo_structure"],
        "credit_action": "trailer",
    },
    "autonomous": {
        "module": "app.agents.coding_agent",
        "class": "AutonomousCodingAgent",
        "description": "Autonomous coding — implements issues and opens PRs",
        "required_params": ["repo_url", "issue_description"],
        "credit_action": "generate",
    },
}


def _agent_query_type(info: dict) -> Optional[str]:
    """Query type an agent class declares (``QueryType`` value or None).

    Heuristic-only agents (e.g. ``OnboardingReportGenerator``) have no
    ``query_type`` attribute and return None. Never raises — a broken agent
    import must not take down the catalog.
    """
    try:
        import importlib
        mod = importlib.import_module(info["module"])
        cls = getattr(mod, info["class"])
        qtype = getattr(cls, "query_type", None)
        return qtype.value if qtype is not None else None
    except Exception:
        return None


def _query_type_model(llm: Any, query_type: Optional[str]) -> Optional[str]:
    """Primary served model id for a query type, e.g. ``anthropic/claude-...``.

    Resolved from the LLM router's per-type provider chain; None when the
    router is unavailable or the type is unknown.
    """
    if not query_type or llm is None:
        return None
    try:
        from app.llm import QueryType
        chain = llm.resolve_route(QueryType(query_type))
        if chain:
            return llm.route_info(chain[0])["served"]
    except Exception:
        pass
    return None


@router.get("/agents")
async def list_agents(req: Request):
    """List all available AI agents and their metadata.

    Each agent reports the query type it routes through (code, reasoning,
    structured, ...) and the primary model that would serve it, e.g.
    ``anthropic/claude-3-5-sonnet-20241022``.
    """
    llm = getattr(req.app.state, "llm", None)
    agents = []
    for name, info in _AGENT_REGISTRY.items():
        qtype = _agent_query_type(info)
        agents.append({
            "name": name,
            "description": info["description"],
            "required_params": info["required_params"],
            "credit_cost": APIKeyService.get_credit_cost(info["credit_action"]),
            "query_type": qtype,
            "model": _query_type_model(llm, qtype),
        })
    return {"agents": agents, "count": len(agents)}


@router.post("/agents/{agent_name}")
async def execute_agent(
    agent_name: str,
    body: Dict[str, Any],
    req: Request,
    auth: dict = Depends(get_user_or_api_key),
):
    """Execute an AI agent by name.

    Accepts authentication via:
      - ``Authorization: Bearer <jwt>`` (existing user session), OR
      - ``X-API-Key: <api_key>`` (programmatic access)

    The caller must have sufficient credits for the action.
    
    Billing flow (API key auth):
      1. RESERVE credits atomically (SELECT FOR UPDATE) before execution
      2. On reserve success: run agent
      3. On agent success: reservation already committed
      4. On agent failure/cancellation: REFUND credits
      5. Fail closed: storage errors during reserve → 503, exhausted → 402
    """
    if agent_name not in _AGENT_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_name}' not found. Use GET /api/v1/ai/agents to list available agents.",
        )

    agent_info = _AGENT_REGISTRY[agent_name]
    llm = getattr(req.app.state, "llm", None)

    # Validate required params. ``index_id`` may substitute for ``repo_structure``
    # (agents resolve the requirement-slice from the repo-context index instead).
    has_index = "index_id" in body
    for param in agent_info["required_params"]:
        if param not in body and not (has_index and param == "repo_structure"):
            raise HTTPException(
                status_code=400,
                detail=f"Missing required parameter '{param}'. Required: {agent_info['required_params']}",
            )

    # Index IDs are tenant-scoped resources, not arbitrary cache keys. API
    # keys carry their canonical team scope; JWT callers go through the shared
    # membership-aware helper.
    if body.get("index_id"):
        if auth.get("auth_method") == "api_key":
            from app.services.repo_index_access import has_index_access
            team_id = auth.get("team_id")
            if not team_id or not await has_index_access(str(body["index_id"]), str(team_id)):
                raise HTTPException(status_code=403, detail="Index is not available to this API key")
        else:
            from app.api.v1.index_access import authorize_repo_index
            await authorize_repo_index(auth, str(body["index_id"]))

    # Check credits
    cost = APIKeyService.get_credit_cost(agent_info["credit_action"])
    tier = auth.get("tier", "free")
    limits = APIKeyService.get_tier_limits(tier)
    monthly_limit = limits.get("credits_per_month", 500)

    # API key auth doesn't have a user-level quota check; for JWT users the
    # existing quota middleware handles this. We do a simple tier check here.
    if monthly_limit == 0:
        # usage_based tier — check wallet later
        pass

    # Get GitHub token for agents that might need it
    github_token = None
    if "repo_url" in body:
        github_token = body.get("github_token", os.getenv("GITHUB_TOKEN"))

    # Import and instantiate the agent — session-aware
    try:
        import importlib
        mod = importlib.import_module(agent_info["module"])
        agent_cls = getattr(mod, agent_info["class"])
        # Create a session for this execution so it participates in the stateful fabric
        sid = None
        try:
            from app.services.agent_session_helper import get_session
            sid = await get_session(agent_name, user_id=auth.get("uid"), index_id=body.get("index_id"), scratchpad={"via": "ai_gateway", "params": list(body.keys())[:5]})
        except Exception:
            pass
        if github_token and sid:
            agent = agent_cls(llm, github_token=github_token, session_id=sid)
        elif sid:
            # agents with BaseAgent signature (llm, session_id)
            try:
                agent = agent_cls(llm, session_id=sid)
            except TypeError:
                agent = agent_cls(llm)
                agent.bind_session(sid) if hasattr(agent, "bind_session") else None
        elif github_token:
            agent = agent_cls(llm, github_token=github_token)
        else:
            agent = agent_cls(llm)

        # Build kwargs from body (strip out auth-related keys)
        kwargs = {k: v for k, v in body.items() if k not in ("github_token",)}

        # ===== BILLING: Reserve credits BEFORE execution (API key auth only) =====
        reserved = False
        key_id = auth.get("key_id") if auth.get("auth_method") == "api_key" else None
        if key_id:
            reserve_result = await key_service.reserve_credits(key_id, cost)
            outcome = reserve_result.get("outcome")
            if outcome == "exhausted":
                scope = reserve_result.get("scope", "monthly")
                detail = (
                    f"API key {'daily' if scope == 'daily' else 'monthly'} credit limit reached. "
                    f"Raise the key's {'daily cap' if scope == 'daily' else 'cost limit'} in Settings to continue."
                )
                raise HTTPException(status_code=402, detail=detail)
            elif outcome == "not_found":
                raise HTTPException(status_code=401, detail="API key not found")
            elif outcome == "error":
                # Fail closed: storage error during reserve → 503
                raise HTTPException(status_code=503, detail="Billing system unavailable, please retry")
            elif outcome == "ok":
                reserved = True
            else:
                # Unknown outcome, fail closed
                raise HTTPException(status_code=503, detail="Billing system error, please retry")

        try:
            # Execute the agent
            result = await agent.execute(**kwargs)
            
            # Close session + publish bus event on success
            if sid:
                try:
                    from app.services.agent_session_helper import complete_session
                    await complete_session(sid, agent_name, success=True, payload={"agent": agent_name})
                    if isinstance(result, dict):
                        result["session_id"] = sid
                except Exception:
                    pass

            # Track usage (with provider attribution from the router, if any).
            # Use team_id (UUID) as the canonical billing scope; fall back to org_name for JWT auth.
            try:
                uid = auth.get("uid", "unknown")
                billing_scope = auth.get("team_id") or auth.get("org_name") or uid
                await usage.record_usage(
                    org_name=billing_scope,
                    endpoint=agent_name,
                    credits=cost,
                    metadata=getattr(llm, "last_route", None),
                )
            except Exception:
                pass  # usage tracking is non-critical

            return {
                "agent": agent_name,
                "result": result,
                "credits_used": cost,
                "tier": tier,
            }

        except Exception as e:
            # Agent execution failed — refund credits if we reserved them
            if reserved and key_id:
                try:
                    refund_result = await key_service.refund_credits(key_id, cost)
                    if refund_result.get("outcome") != "ok":
                        # Log but don't fail the response — the original error is more important
                        logger.error(
                            "Failed to refund credits for key %s after agent failure: %s",
                            key_id, refund_result
                        )
                except Exception:
                    logger.exception("Exception during credit refund for key %s", key_id)
            
            # Close session with failure status
            if sid:
                try:
                    from app.services.agent_session_helper import complete_session
                    await complete_session(sid, agent_name, success=False, payload={"agent": agent_name, "error": str(e)})
                except Exception:
                    pass
            
            # Re-raise the original exception
            raise

    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Agent module not found: {e}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
