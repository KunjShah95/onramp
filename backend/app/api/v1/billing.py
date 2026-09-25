import os
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel, Field
from app.services.billing_service import BillingService
from app.services.credit_service import CreditService
from app.services.team_service import get_team_members
from app.api.v1.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["saas"])
billing = BillingService()
credits = CreditService()


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


async def require_team_admin(team_id: str, user: dict) -> None:
    """Require team membership with an owner/admin billing role."""
    await require_team_membership(team_id, user)
    members = await get_team_members(team_id)
    uid = user.get("uid")
    roles = {m.get("role", "member") for m in members if (m.get("user_id") or m.get("uid") or m.get("id")) == uid}
    if not roles.intersection({"admin", "ceo", "cto"}):
        raise HTTPException(status_code=403, detail="Team billing administrator required")


class CreateSubscriptionRequest(BaseModel):
    team_id: str
    tier: str = "free"
    billing_cycle: str = "monthly"


class UpdateBillingRequest(BaseModel):
    tier: str


class AttachRazorpayRequest(BaseModel):
    razorpay_customer_id: str
    razorpay_subscription_id: str


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
    await require_team_admin(request.team_id, user)
    try:
        return await billing.create_subscription(
            team_id=request.team_id,
            tier=request.tier,
            billing_cycle=request.billing_cycle,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/subscriptions/{team_id}",
    responses={404: {"description": "No active subscription"}})
async def get_subscription(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(team_id, user)
    sub = await billing.get_subscription(team_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    return sub


@router.patch("/subscriptions/{team_id}",
    responses={404: {"description": "No active subscription"}})
async def update_subscription(
    team_id: str,
    request: UpdateBillingRequest,
    user: dict = Depends(get_current_user),
):
    await require_team_admin(team_id, user)
    try:
        result = await billing.update_subscription(team_id, request.tier)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="No active subscription")
    return result


@router.delete("/subscriptions/{team_id}",
    responses={404: {"description": "No active subscription"}})
async def cancel_subscription(
    team_id: str,
    user: dict = Depends(get_current_user),
):
    await require_team_admin(team_id, user)
    success = await billing.cancel_subscription(team_id)
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"canceled": True}


@router.post("/subscriptions/{team_id}/razorpay")
async def attach_razorpay(
    team_id: str,
    request: AttachRazorpayRequest,
    user: dict = Depends(get_current_user),
):
    await require_team_admin(team_id, user)
    success = await billing.attach_razorpay(
        team_id,
        request.razorpay_customer_id,
        request.razorpay_subscription_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"attached": True}


@router.post("/checkout")
async def create_checkout(
    request: CheckoutRequest,
    user: dict = Depends(get_current_user),
):
    """Create a Razorpay subscription checkout for a paid tier."""
    await require_team_admin(request.team_id, user)
    result = await billing.create_checkout_session(
        request.team_id, request.tier, request.success_url, request.cancel_url
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Razorpay webhook receiver. Public, but signature-verified.

    Must be in AuthMiddleware public_paths so Razorpay (unauthenticated) can
    call it. Invalid signatures → HTTP 400 with NO state change (verification
    runs before any processing; see BillingService.handle_webhook).
    """
    payload = await request.body()
    sig = request.headers.get("X-Razorpay-Signature")
    result = await billing.handle_webhook(payload, sig)
    if "error" in result:
        err = result["error"]
        # Signature and config errors are permanent — return 400 so Razorpay
        # does not retry. Processing/storage errors are transient — return 500
        # so Razorpay retries delivery.
        permanent = any(w in err.lower() for w in ("signature", "not configured"))
        raise HTTPException(status_code=400 if permanent else 500, detail=err)
    return result


@router.get("/pricing")
async def get_pricing():
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={"tiers": BillingService.get_pricing()},
        headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=3600"},
    )


# ── Usage-based billing: prepaid credit wallet ───────────────────────────────


class TopUpRequest(BaseModel):
    amount: int = Field(..., gt=0, le=1_000_000, description="Credits to add")
    team_id: str | None = None


class CreateOrderRequest(BaseModel):
    amount_inr: int = Field(..., gt=0, le=100000, description="Amount in rupees (INR)")
    team_id: str | None = None


async def _credit_scope(user: dict, requested_team_id: str | None = None) -> str:
    from app.services.team_service import get_user_teams

    memberships = await get_user_teams(user.get("uid", ""))
    allowed = {str(t.get("team_id") or t.get("id")): t for t in memberships or []}
    if requested_team_id:
        if str(requested_team_id) not in allowed:
            raise HTTPException(status_code=403, detail="Access denied")
        return str(requested_team_id)
    if not allowed:
        raise HTTPException(status_code=403, detail="Team membership required")
    return sorted(allowed)[0]


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("/credits")
async def get_credit_wallet(
    team_id: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    """Return the caller's team prepaid-credit wallet."""
    scope = await _credit_scope(user, team_id)
    return await credits.get_wallet(scope)


@router.post("/credits/topup")
async def top_up_credits(
    request: TopUpRequest,
    user: dict = Depends(get_current_user),
):
    """Add credits to the caller's wallet (manual/dev path).

    In production, wallet top-ups go through the Razorpay flow — create an
    order (`/credits/order`), collect payment via Checkout.js, then verify the
    signature (`/credits/order/verify`). The amount is the number of credits
    purchased. Returns the updated wallet.
    """
    if os.getenv("ENV", "development").lower() == "production":
        raise HTTPException(status_code=403, detail="Manual credit top-ups are disabled; use verified payment")
    scope = await _credit_scope(user, request.team_id)
    return await credits.add_credits(scope, request.amount, reason="topup")


@router.post("/credits/order")
async def create_credit_order(
    request: CreateOrderRequest,
    user: dict = Depends(get_current_user),
):
    """Create a Razorpay order for a credit wallet top-up. Amount is in rupees (INR)."""
    if not billing.is_razorpay_enabled():
        raise HTTPException(status_code=400, detail="Razorpay is not configured")
    scope = await _credit_scope(user, request.team_id)
    order = await billing.create_payment_order(scope, request.amount_inr, owner_id=user.get("uid", ""))
    if "error" in order:
        raise HTTPException(status_code=400, detail=order["error"])
    return order


@router.post("/credits/order/verify")
async def verify_credit_order(
    request: VerifyPaymentRequest,
    user: dict = Depends(get_current_user),
):
    """Verify a Razorpay payment signature and credit the wallet."""
    result = await billing.verify_payment_order(
        request.razorpay_order_id,
        request.razorpay_payment_id,
        request.razorpay_signature,
        caller_id=user.get("uid"),
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/credits/ledger")
async def get_credit_ledger(
    limit: int = Query(50, ge=1, le=200),
    team_id: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    """Append-only history of team credit top-ups and per-query charges."""
    scope = await _credit_scope(user, team_id)
    entries = await credits.get_ledger(scope, limit=limit)
    return {"entries": entries, "count": len(entries)}
