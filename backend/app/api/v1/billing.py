from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["saas"])
billing = BillingService()


class CreateSubscriptionRequest(BaseModel):
    team_id: str
    tier: str = "free"
    billing_cycle: str = "monthly"


class UpdateBillingRequest(BaseModel):
    tier: str


class AttachStripeRequest(BaseModel):
    stripe_customer_id: str
    stripe_subscription_id: str


@router.post("/subscriptions")
async def create_subscription(request: CreateSubscriptionRequest):
    return await billing.create_subscription(
        team_id=request.team_id,
        tier=request.tier,
        billing_cycle=request.billing_cycle,
    )


@router.get("/subscriptions/{team_id}")
async def get_subscription(team_id: str):
    sub = await billing.get_subscription(team_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    return sub


@router.patch("/subscriptions/{team_id}")
async def update_subscription(team_id: str, request: UpdateBillingRequest):
    result = await billing.update_subscription(team_id, request.tier)
    if not result:
        raise HTTPException(status_code=404, detail="No active subscription")
    return result


@router.delete("/subscriptions/{team_id}")
async def cancel_subscription(team_id: str):
    success = await billing.cancel_subscription(team_id)
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"canceled": True}


@router.post("/subscriptions/{team_id}/stripe")
async def attach_stripe(team_id: str, request: AttachStripeRequest):
    success = await billing.attach_stripe(
        team_id,
        request.stripe_customer_id,
        request.stripe_subscription_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"attached": True}


@router.get("/pricing")
async def get_pricing():
    return {"tiers": BillingService.get_pricing()}
