from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.api_key_service import APIKeyService, TIER_LIMITS, CREDIT_COSTS
from app.services.usage_tracker import UsageTracker

router = APIRouter(prefix="/ai", tags=["ai-gateway"])
key_service = APIKeyService()
usage = UsageTracker()


class CreateKeyRequest(BaseModel):
    org_name: str
    tier: str = "free"
    created_by: str = "system"


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
async def create_api_key(request: CreateKeyRequest):
    result = await key_service.create_key(
        org_name=request.org_name,
        tier=request.tier,
        created_by=request.created_by,
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
async def list_api_keys(org_name: Optional[str] = None):
    keys = await key_service.list_keys(org_name)
    return {"keys": keys, "count": len(keys)}


@router.delete("/keys/{key_id}")
async def revoke_api_key(key_id: str):
    success = await key_service.revoke_key(key_id)
    if not success:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"revoked": True, "key_id": key_id}


@router.get("/keys/validate/{raw_key}")
async def validate_api_key(raw_key: str):
    key = await key_service.validate_key(raw_key)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")
    limits = APIKeyService.get_tier_limits(key.get("tier", "free"))
    return {
        "valid": True,
        "org_name": key.get("org_name"),
        "tier": key.get("tier"),
        "limits": limits,
    }


@router.get("/usage/{org_name}")
async def get_usage(org_name: str, period: Optional[str] = None) -> UsageResponse:
    result = await usage.get_usage(org_name, period)
    return UsageResponse(**result)


@router.get("/usage/{org_name}/summary")
async def get_usage_summary(org_name: str):
    return await usage.get_org_summary(org_name)


@router.get("/usage/{org_name}/quota")
async def check_quota(org_name: str, tier: str = "free"):
    limits = APIKeyService.get_tier_limits(tier)
    result = await usage.check_quota(org_name, limits)
    return result


@router.get("/tiers")
async def list_tiers():
    return {"tiers": TIER_LIMITS, "credit_costs": CREDIT_COSTS}
