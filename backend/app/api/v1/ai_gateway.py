import os
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.services.api_key_service import APIKeyService, TIER_LIMITS, CREDIT_COSTS
from app.services.usage_tracker import UsageTracker
from app.api.v1.auth import get_current_user, get_user_or_api_key
from app.services.team_service import get_team_members, add_member, get_user_teams
from app.middleware.access_guard import ROLE_HIERARCHY

router = APIRouter(prefix="/ai", tags=["ai-gateway"])
key_service = APIKeyService()
usage = UsageTracker()


async def _ensure_org_access(org_name: str, user: dict, allow_create: bool = False) -> None:
    """Authorize access to an org's resources by team membership.

    The org_name maps to a team scope. Rules:
      - members of the team are allowed.
      - if the org has no members yet and allow_create is set, the caller becomes
        its owner (first-touch ownership) and is allowed.
      - otherwise 403.
    """
    members = await get_team_members(org_name)
    member_ids = {m.get("id") or m.get("user_id") for m in members}
    if user["uid"] in member_ids:
        return
    if allow_create and not members:
        await add_member(org_name, user["uid"], role="owner")
        return
    raise HTTPException(status_code=403, detail="Not a member of this organization")


async def _require_org_role(org_name: str, user: dict, min_role: str = "developer") -> None:
    """Enforce minimum team role for API key management operations.

    Checks that the user is a member of the org AND has a role at or above min_role
    in the role hierarchy (e.g., developer >= tester >= new_dev).

    If the org has no members yet, the caller becomes owner (first-touch).
    Otherwise raises 403 if not a member or role is insufficient.
    """
    uid = user["uid"]
    members = await get_team_members(org_name)
    member_ids = {m.get("id") or m.get("user_id") for m in members}

    if uid not in member_ids:
        if not members:
            await add_member(org_name, uid, role="owner")
            return
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    teams = await get_user_teams(uid)
    user_role = None
    for team in teams:
        if (team.get("team_id") or team.get("id")) == org_name:
            user_role = team.get("role")
            break

    if user_role is None:
        raise HTTPException(status_code=403, detail="Role information not found")

    min_level = ROLE_HIERARCHY.get(min_role, 0)
    user_level = ROLE_HIERARCHY.get(user_role, 0)

    if user_level < min_level:
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient role to manage API keys. Required: {min_role}, current: {user_role}",
        )


class CreateKeyRequest(BaseModel):
    org_name: str
    tier: str = "free"
    # Human-friendly label for the key (defaults to the org name server-side).
    name: Optional[str] = None
    # Optional per-key cost budget in credits — the key stops working once its
    # cumulative usage reaches this limit.
    credit_limit: Optional[int] = None
    # Optional key lifetime: days until the key auto-expires (blank = never).
    expires_in_days: Optional[int] = None
    # NOTE: created_by is intentionally NOT accepted from the client. The
    # creating user is taken from the authenticated session (server-side) to
    # prevent attribution spoofing / IDOR.


class ValidateKeyRequest(BaseModel):
    raw_key: Optional[str] = None


class CreateKeyResponse(BaseModel):
    raw_key: str
    key_id: str
    org_name: str
    tier: str
    name: Optional[str] = None
    credit_limit: Optional[int] = None
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
    # Caller must have developer+ role in the org to create keys.
    await _require_org_role(request.org_name, user, min_role="developer")
    if request.credit_limit is not None and request.credit_limit < 0:
        raise HTTPException(status_code=400, detail="credit_limit cannot be negative")
    if request.expires_in_days is not None and request.expires_in_days < 1:
        raise HTTPException(status_code=400, detail="expires_in_days must be a positive number of days")
    result = await key_service.create_key(
        org_name=request.org_name,
        tier=request.tier,
        created_by=user["uid"],
        name=request.name,
        credit_limit=request.credit_limit,
        expires_in_days=request.expires_in_days,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return CreateKeyResponse(
        raw_key=result["raw_key"],
        key_id=result["key_id"],
        org_name=result["org_name"],
        tier=result["tier"],
        name=result.get("name"),
        credit_limit=result.get("credit_limit"),
        expires_at=result.get("expires_at"),
    )


@router.get("/keys")
async def list_api_keys(
    org_name: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    # Never list all keys across tenants. Scope to an org (with membership
    # verification and minimum role) or fall back to the caller's own user-scoped keys.
    if org_name:
        await _require_org_role(org_name, user, min_role="developer")
        keys = await key_service.list_keys(org_name, owner_type="team")
    else:
        keys = await key_service.list_keys(user["uid"], owner_type="user")
    return {"keys": keys, "count": len(keys)}


@router.delete("/keys/{key_id}")
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
    # team_id stores the org scope in this model — org members with developer+ role may also revoke.
    if not owns_key:
        org_scope = key.get("team_id")
        if org_scope:
            await _require_org_role(org_scope, user, min_role="developer")
        else:
            raise HTTPException(status_code=403, detail="Not authorized to revoke this key")

    success = await key_service.revoke_key(key_id)
    if not success:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"revoked": True, "key_id": key_id}


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
    fast models, structured -> JSON-capable models, ...).
    """
    llm = getattr(req.app.state, "llm", None)
    if llm is None or not hasattr(llm, "list_models"):
        raise HTTPException(status_code=503, detail="LLM router not initialized")
    return llm.list_models()


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

    # Per-key cost budget: reject the call when charging this action's credits
    # would push the key past its configured credit_limit. The counter is
    # checked against the value captured at request start and charged after
    # execution — best-effort enforcement, not a hard concurrency guarantee
    # (two parallel calls near the limit can both pass this gate).
    if auth.get("auth_method") == "api_key":
        key_credit_limit = auth.get("credit_limit")
        key_credits_used = int(auth.get("credits_used", 0) or 0)
        if APIKeyService.cost_limit_reached(key_credit_limit, key_credits_used, cost):
            raise HTTPException(
                status_code=402,
                detail=(
                    f"API key cost limit reached ({key_credits_used}/{key_credit_limit} "
                    f"credits). Raise the key's cost limit in Settings to continue."
                ),
            )

    # Get GitHub token for agents that might need it
    github_token = None
    if "repo_url" in body:
        github_token = body.get("github_token", os.getenv("GITHUB_TOKEN"))

    # Import and instantiate the agent
    try:
        import importlib
        mod = importlib.import_module(agent_info["module"])
        agent_cls = getattr(mod, agent_info["class"])
        agent = agent_cls(llm, github_token=github_token) if github_token else agent_cls(llm)

        # Build kwargs from body (strip out auth-related keys)
        kwargs = {k: v for k, v in body.items() if k not in ("github_token",)}
        result = await agent.execute(**kwargs)

        # Track usage (with provider attribution from the router, if any).
        try:
            uid = auth.get("uid", "unknown")
            org = auth.get("org_name", uid)
            await usage.record_usage(
                org_name=org,
                endpoint=agent_name,
                credits=cost,
                metadata=getattr(llm, "last_route", None),
            )
        except Exception:
            pass  # usage tracking is non-critical

        # Charge the per-key cost budget when the call was made with an API key
        # (JWT sessions are covered by the org-level quota). Kept in its own
        # guard so a telemetry failure can never skip the budget accounting.
        if auth.get("auth_method") == "api_key" and auth.get("key_id"):
            try:
                await key_service.increment_credits_used(auth["key_id"], cost)
            except Exception:
                pass  # best-effort counter; enforcement re-checks on next call

        return {
            "agent": agent_name,
            "result": result,
            "credits_used": cost,
            "tier": tier,
        }
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Agent module not found: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
