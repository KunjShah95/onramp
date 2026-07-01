from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.billing_service import BillingService
from app.services.team_service import get_team_members
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["saas"])
billing = BillingService()


async def require_team_membership(team_id: str, user: dict) -> None:
    """Authorize the caller for tenant (team) operations.

    Raises 403 if the authenticated user is not a member of the team. This
    prevents broken-access-control / IDOR where any authenticated user could
    mutate another tenant's subscription.
    """
    uid = user.get("uid")
    members = await get_team_members(team_id)
    member_ids = {m.get("user_id") or m.get("uid") or m.get("id") for m in members}
    if uid not in member_ids:
        raise HTTPException(
            status_code=403,
            detail="Not authorized for this team",
        )


class CreateSubscriptionRequest(BaseModel):
    team_id: str
    tier: str = "free"
    billing_cycle: str = "monthly"


class UpdateBillingRequest(BaseModel):
    tier: str


class AttachStripeRequest(BaseModel):
    stripe_customer_id: str
    stripe_subscription_id: str


class CheckoutRequest(BaseModel):
    team_id: str
    tier: str
    success_url: str
    cancel_url: str


@router.post("/subscriptions")
async def create_subscription(
    request: CreateSubscriptionRequest,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(request.team_id, user)
    return await billing.create_subscription(
        team_id=request.team_id,
        tier=request.tier,
        billing_cycle=request.billing_cycle,
    )


@router.get("/subscriptions/{team_id}")
async def get_subscription(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(team_id, user)
    sub = await billing.get_subscription(team_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    return sub


@router.patch("/subscriptions/{team_id}")
async def update_subscription(
    team_id: str,
    request: UpdateBillingRequest,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(team_id, user)
    result = await billing.update_subscription(team_id, request.tier)
    if not result:
        raise HTTPException(status_code=404, detail="No active subscription")
    return result


@router.delete("/subscriptions/{team_id}")
async def cancel_subscription(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(team_id, user)
    success = await billing.cancel_subscription(team_id)
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"canceled": True}


@router.post("/subscriptions/{team_id}/stripe")
async def attach_stripe(
    team_id: str,
    request: AttachStripeRequest,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(team_id, user)
    success = await billing.attach_stripe(
        team_id,
        request.stripe_customer_id,
        request.stripe_subscription_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"attached": True}


@router.post("/checkout")
async def create_checkout(
    request: CheckoutRequest,
    user: dict = Depends(get_current_user),
):
    """Create a Stripe Checkout session for a paid tier."""
    await require_team_membership(request.team_id, user)
    result = await billing.create_checkout_session(
        request.team_id, request.tier, request.success_url, request.cancel_url
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook receiver. Public, but signature-verified.

    Must be in AuthMiddleware public_paths so Stripe (unauthenticated) can call it.
    Passes the Idempotency-Key header through for duplicate detection.
    """
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature")
    idempotency_key = request.headers.get("Idempotency-Key")
    result = await billing.handle_webhook(payload, sig, idempotency_key)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/pricing")
async def get_pricing():
    return {"tiers": BillingService.get_pricing()}
