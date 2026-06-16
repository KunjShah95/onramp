from fastapi import APIRouter, HTTPException, Request, Depends, Header
from pydantic import BaseModel
from typing import Optional
from app.services.api_key_service import APIKeyService, TIER_LIMITS, CREDIT_COSTS
from app.services.usage_tracker import UsageTracker
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/ai", tags=["ai-gateway"])
key_service = APIKeyService()
usage = UsageTracker()


class CreateKeyRequest(BaseModel):
    org_name: str
    tier: str = "free"
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
    # TODO: enforce that `user` is a member of `request.org_name` (team
    # membership) before allowing key creation for that org.
    result = await key_service.create_key(
        org_name=request.org_name,
        tier=request.tier,
        created_by=user["uid"],
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return CreateKeyResponse(
        raw_key=result["raw_key"],
        key_id=result["key_id"],
        org_name=result["org_name"],
        tier=result["tier"],
    )


@router.get("/keys")
async def list_api_keys(
    org_name: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    # Never list all keys across tenants. Scope to an org (with membership
    # verification) or fall back to the caller's own user-scoped keys.
    if org_name:
        # TODO: verify `user` is a member of `org_name` before listing org keys.
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
    # team_id stores the org_name in this model.
    # TODO: also allow revocation by org members via team membership check on
    # key.get("team_id").
    if not owns_key:
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
    # TODO: verify `user` is a member of `org_name` before exposing usage.
    result = await usage.get_usage(org_name, period)
    return UsageResponse(**result)


@router.get("/usage/{org_name}/summary")
async def get_usage_summary(
    org_name: str,
    user: dict = Depends(get_current_user),
):
    # TODO: verify `user` is a member of `org_name` before exposing usage.
    return await usage.get_org_summary(org_name)


@router.get("/usage/{org_name}/quota")
async def check_quota(
    org_name: str,
    tier: str = "free",
    user: dict = Depends(get_current_user),
):
    # TODO: verify `user` is a member of `org_name` before exposing quota.
    limits = APIKeyService.get_tier_limits(tier)
    result = await usage.check_quota(org_name, limits)
    return result


@router.get("/tiers")
async def list_tiers():
    return {"tiers": TIER_LIMITS, "credit_costs": CREDIT_COSTS}
