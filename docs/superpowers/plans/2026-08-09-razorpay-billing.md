# Razorpay Billing Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace Stripe with Razorpay across the billing stack — checkout, subscriptions, webhooks, credit top-ups, DB columns, frontend, and legal copy — with INR pricing.

**Architecture:** `BillingService` keeps its document-store interface but swaps the Stripe SDK for the Razorpay client. Checkout creates a Razorpay Subscription (returning its hosted `short_url`). Webhooks verify `X-Razorpay-Signature` via `razorpay.utility.verify_webhook_signature`, then map Razorpay event types to the same local state transitions. Credit wallet top-ups use Razorpay Orders + Checkout.js with server-side signature verification. `onramp_subscriptions` columns are renamed Stripe → Razorpay via one Alembic migration.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, `razorpay` SDK; React 19 + TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-08-09-razorpay-billing-design.md`

---

## File Structure

**Backend**
- Modify: `backend/requirements.txt` — swap `stripe` → `razorpay`
- Modify: `backend/app/database/models.py` — rename Stripe columns on `Subscription`
- Create: `backend/alembic/versions/023_razorpay_billing.py` — rename columns
- Modify: `backend/app/services/billing_service.py` — rewrite provider layer
- Modify: `backend/app/api/v1/billing.py` — API routes
- Modify: `backend/app/main.py` — env validation
- Modify: `backend/.env.example` — env vars
- Modify: `backend/tests/test_billing_e2e.py`, `backend/tests/test_billing_webhook.py`, `backend/tests/test_prod_env_validation.py`
- Create: `backend/tests/test_razorpay_topup.py`, `backend/tests/test_razorpay_webhook_events.py`

**Frontend**
- Modify: `web/src/lib/api.ts` — billing API functions + types
- Modify: `web/src/pages/BillingPage.tsx` — INR display + Razorpay top-up checkout
- Modify: `web/src/pages/TermsPage.tsx`, `web/src/pages/PrivacyPage.tsx`, `web/src/pages/DPAPage.tsx`

---

### Task 1: Swap stripe dependency for razorpay

**Files:**
- Modify: `backend/requirements.txt`

- [x] **Step 1: Edit requirements.txt**

Change line 23:

```text
stripe>=10.0.0        # billing (STRIPE_SECRET_KEY)
```

to:

```text
razorpay>=1.4.0       # billing (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)
```

- [x] **Step 2: Install and verify import**

Run: `pip install -r requirements.txt`
Then: `python -c "import razorpay; print(razorpay.__version__)"`
Expected: prints a version >= 1.4 (no ImportError).

- [x] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore(billing): replace stripe dependency with razorpay"
```

---

### Task 2: Rename subscription columns (model + migration)

**Files:**
- Modify: `backend/app/database/models.py`
- Create: `backend/alembic/versions/023_razorpay_billing.py`

- [x] **Step 1: Update the Subscription model**

In `backend/app/database/models.py`, replace lines 664-665:

```python
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

with:

```python
    razorpay_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

And in `to_dict()` (lines 688-689), replace:

```python
            "stripe_customer_id": self.stripe_customer_id,
            "stripe_subscription_id": self.stripe_subscription_id,
```

with:

```python
            "razorpay_customer_id": self.razorpay_customer_id,
            "razorpay_subscription_id": self.razorpay_subscription_id,
            "razorpay_payment_id": self.razorpay_payment_id,
```

- [x] **Step 2: Create the Alembic migration**

Create `backend/alembic/versions/023_razorpay_billing.py`:

```python
"""rename stripe billing columns to razorpay on onramp_subscriptions

Revision ID: 023_razorpay_billing
Revises: 022_backfill_encrypt_pii
Create Date: 2026-08-09 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '023_razorpay_billing'
down_revision: Union[str, None] = '022_backfill_encrypt_pii'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('onramp_subscriptions', 'stripe_customer_id',
                    new_column_name='razorpay_customer_id', existing_type=sa.String(255))
    op.alter_column('onramp_subscriptions', 'stripe_subscription_id',
                    new_column_name='razorpay_subscription_id', existing_type=sa.String(255))
    op.add_column('onramp_subscriptions', sa.Column('razorpay_payment_id', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('onramp_subscriptions', 'razorpay_payment_id')
    op.alter_column('onramp_subscriptions', 'razorpay_subscription_id',
                    new_column_name='stripe_subscription_id', existing_type=sa.String(255))
    op.alter_column('onramp_subscriptions', 'razorpay_customer_id',
                    new_column_name='stripe_customer_id', existing_type=sa.String(255))
```

- [x] **Step 3: Run the migration (dev DB)**

Run: `cd backend && alembic upgrade head`
Expected: applies `023_razorpay_billing`; verify with `alembic current` shows `023_razorpay_billing`.

- [x] **Step 4: Commit**

```bash
git add backend/app/database/models.py backend/alembic/versions/023_razorpay_billing.py
git commit -m "feat(billing): rename subscription columns stripe -> razorpay"
```
---
### Task 3: Rewrite billing_service.py provider layer

**Files:**
- Modify: `backend/app/services/billing_service.py`

This task replaces every Stripe reference with Razorpay. The document-store CRUD methods
(`create_subscription`, `get_subscription`, `update_subscription`, `cancel_subscription`,
idempotency helpers, event log) stay unchanged.

- [x] **Step 1: Replace module constants and pricing**

Replace the top-of-file block (lines 11-25):

```python
# Stripe Price IDs per tier (set in env when using real Stripe billing).
STRIPE_PRICE_IDS = {
    "startup": os.getenv("STRIPE_PRICE_STARTUP"),
    "professional": os.getenv("STRIPE_PRICE_PROFESSIONAL"),
    "usage_based": os.getenv("STRIPE_PRICE_USAGE_BASED"),
}
```

with:

```python
# Razorpay plan IDs per tier (set in env when using real Razorpay billing).
RAZORPAY_PLAN_IDS = {
    "startup": os.getenv("RAZORPAY_PLAN_STARTUP"),
    "professional": os.getenv("RAZORPAY_PLAN_PROFESSIONAL"),
    "usage_based": os.getenv("RAZORPAY_PLAN_USAGE_BASED"),
}
```

Then replace `TIER_PRICING` values (lines 19-25) so the monthly/yearly amounts are INR:

```python
TIER_PRICING = {
    "free": {"price_monthly": 0, "price_yearly": 0, "features": ["1 member", "1 repo", "50 credits/mo"]},
    "startup": {"price_monthly": 999, "price_yearly": 9999, "features": ["5 members", "10 repos", "5000 credits/mo"]},
    "professional": {"price_monthly": 2999, "price_yearly": 29999, "features": ["20 members", "50 repos", "50000 credits/mo"]},
    "usage_based": {"price_monthly": 499, "price_yearly": 4999, "features": ["1 member", "1 repo", "Pay per query (usage-based)"]},
    "enterprise": {"price_monthly": 0, "price_yearly": 0, "features": ["Custom", "Unlimited", "Dedicated support"]},
}
```

- [x] **Step 2: Rename attach + enable/accessor methods**

Replace lines 100-122 (the `attach_stripe` method and the Stripe guard/accessor):

```python
    async def attach_razorpay(self, team_id: str, razorpay_customer_id: str, razorpay_subscription_id: str) -> bool:
        sub = await self.get_subscription(team_id)
        if not sub:
            return False
        sub_id = sub.get("subscription_id", sub.get("id", ""))
        await self.storage.update_document(self.COLLECTION, sub_id, {
            "razorpay_customer_id": razorpay_customer_id,
            "razorpay_subscription_id": razorpay_subscription_id,
        })
        return True

    # -- Razorpay integration (optional, guarded by RAZORPAY_KEY_ID) --------

    @staticmethod
    def is_razorpay_enabled() -> bool:
        return bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))

    @staticmethod
    def _razorpay():
        """Lazily import and configure the Razorpay SDK."""
        import razorpay
        return razorpay.Client(
            auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET"))
        )
```

- [x] **Step 3: Replace create_checkout_session**

Replace lines 124-147 with a Razorpay subscription creator:

```python
    async def create_checkout_session(
        self, team_id: str, tier: str, success_url: str, cancel_url: str
    ) -> Dict[str, Any]:
        """Create a Razorpay subscription for a paid tier. Returns {url, subscription_id}."""
        if not self.is_razorpay_enabled():
            return {"error": "Razorpay is not configured", "stub": True}
        plan_id = RAZORPAY_PLAN_IDS.get(tier)
        if not plan_id:
            return {"error": f"No Razorpay plan configured for tier '{tier}'"}

        client = self._razorpay()

        def _create():
            return client.subscription.create({
                "plan_id": plan_id,
                "total_count": 12,
                "quantity": 1,
                "customer_notify": 1,
                "notes": {"team_id": team_id, "tier": tier, "success_url": success_url, "cancel_url": cancel_url},
            })

        sub = await asyncio.to_thread(_create)
        return {"url": sub.get("short_url"), "subscription_id": sub.get("id")}
```

- [x] **Step 4: Replace webhook verification**

Replace lines 188-238 (`_verify_and_parse_event`) with a Razorpay verifier. Razorpay sends the
event as the raw body (not wrapped), and signs it with the `X-Razorpay-Signature` header.

```python
    async def _verify_and_parse_event(self, payload: bytes, sig_header: Optional[str]) -> Optional[dict]:
        """Verify Razorpay webhook signature and parse the event.

        Returns the parsed event dict, or None if verification fails.
        Runs the sync Razorpay SDK call in a thread to avoid blocking.
        """
        secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")
        payload_text = payload.decode("utf-8")

        if not secret:
            env = os.getenv("ENV", "development").lower()
            allow_unverified = os.getenv("ALLOW_UNVERIFIED_RAZORPAY", "false").lower() == "true"
            if env == "production":
                logger.error("RAZORPAY_WEBHOOK_SECRET is required in production — refusing unverified webhook.")
                return None
            if not allow_unverified:
                logger.error(
                    "RAZORPAY_WEBHOOK_SECRET not set and ALLOW_UNVERIFIED_RAZORPAY is not true. "
                    "Set ALLOW_UNVERIFIED_RAZORPAY=true to process without verification (dev only)."
                )
                return None
            logger.warning("Razorpay webhook processed WITHOUT signature verification (ALLOW_UNVERIFIED_RAZORPAY=true, dev mode).")
            return self._normalize_event(json.loads(payload_text))

        if not sig_header:
            logger.error("Missing X-Razorpay-Signature header.")
            return None

        try:
            client = self._razorpay()
            verified = await asyncio.to_thread(
                client.utility.verify_webhook_signature,
                payload_text,
                sig_header,
                secret,
            )
            if not verified:
                logger.warning("Razorpay webhook signature verification failed.")
                return None
            return self._normalize_event(json.loads(payload_text))
        except Exception as exc:
            logger.warning(f"Razorpay webhook signature verification failed: {exc}")
            _sentry_report(exc, {"phase": "webhook_verify"})
            return None

    @staticmethod
    def _normalize_event(event: dict) -> dict:
        """Normalize a Razorpay webhook event to the shape used internally.

        Razorpay places the primary entity under ``payload.<entity_type>.entity``
        where entity_type depends on the event (``subscription``, ``payment``,
        ``order``, ...). We surface whichever is present so ``_process_event``
        reads entity fields directly.
        """
        payload = event.get("payload") or {}
        entity = None
        for key in ("subscription", "payment", "order", "refund"):
            if key in payload:
                entity = (payload.get(key) or {}).get("entity") or {}
                break
        return {
            "id": event.get("id") or event.get("event_id"),
            "type": event.get("event"),
            "data": {"object": entity if entity is not None else payload},
            "created": event.get("created_at"),
        }
```

- [x] **Step 5: Update handle_webhook guard + routing**

Replace `is_stripe_enabled()` with `is_razorpay_enabled()` in `handle_webhook` (line 247).

- [x] **Step 6: Rewrite _process_event for Razorpay event types**

Replace lines 284-358 with:

```python
    async def _process_event(self, event_type: str, data_obj: dict) -> dict:
        """Route a verified Razorpay webhook event to its handler."""
        subscription_id = data_obj.get("id")
        notes = data_obj.get("notes") or {}

        if event_type == "subscription.activated":
            team_id = notes.get("team_id")
            if not team_id:
                logger.warning("subscription.activated missing team_id in notes")
                return {"warning": "missing team_id"}
            await self.attach_razorpay(
                team_id,
                data_obj.get("customer_id"),
                subscription_id,
            )
            await self._update_subscription_by_razorpay_id(subscription_id, {"status": "active"})
            return {"team_id": team_id, "subscription_id": subscription_id}

        elif event_type == "subscription.charged":
            if not subscription_id:
                return {"warning": "missing subscription id"}
            plan_id = data_obj.get("plan_id")
            tier = next((t for t, pid in RAZORPAY_PLAN_IDS.items() if pid == plan_id), None)
            updates: dict = {"status": "active"}
            if tier:
                updates["tier"] = tier
            await self._update_subscription_by_razorpay_id(subscription_id, updates)
            return {"subscription_id": subscription_id, "tier": tier}

        elif event_type == "subscription.completed":
            if subscription_id:
                await self._update_subscription_by_razorpay_id(subscription_id, {"status": "completed"})
                return {"subscription_id": subscription_id, "status": "completed"}
            return {"warning": "missing subscription id"}

        elif event_type == "subscription.cancelled":
            if subscription_id:
                await self._update_subscription_by_razorpay_id(subscription_id, {"status": "canceled"})
                return {"subscription_id": subscription_id, "status": "canceled"}
            return {"warning": "missing subscription id"}

        elif event_type in ("subscription.pending", "subscription.halted"):
            if subscription_id:
                await self._update_subscription_by_razorpay_id(subscription_id, {"status": "past_due"})
                return {"subscription_id": subscription_id, "status": "past_due"}
            return {"warning": "missing subscription id"}

        elif event_type == "payment.captured":
            payment = data_obj or {}
            order_id = payment.get("order_id")
            payment_id = payment.get("id")
            amount_paise = payment.get("amount") or 0
            if notes.get("topup") == "1" and order_id and payment_id and amount_paise:
                credits = amount_paise // 100
                await self._credit_topup(order_id, payment_id, credits)
                return {"order_id": order_id, "payment_id": payment_id, "credits": credits}
            return {"logged": True, "payment_id": payment_id}

        elif event_type == "payment.failed":
            return {"logged": True, "payment_id": data_obj.get("id")}

        else:
            logger.debug(f"Unhandled Razorpay webhook event type: {event_type}")
            return {"unhandled": True}
```

- [x] **Step 7: Rename the by-id updater + add top-up helper**

Replace `_update_subscription_by_stripe_id` (lines 378-401) with `_update_subscription_by_razorpay_id`
(querying `razorpay_subscription_id`), and add a `_credit_topup` helper:

```python
    async def _update_subscription_by_razorpay_id(self, razorpay_subscription_id: str, updates: dict) -> bool:
        subs = await self.storage.query_documents(
            self.COLLECTION,
            [("razorpay_subscription_id", "==", razorpay_subscription_id)],
        )
        if not subs:
            logger.warning(f"No local subscription for Razorpay ID {razorpay_subscription_id}")
            return False
        if len(subs) > 1:
            logger.warning(f"Found {len(subs)} subscriptions for Razorpay ID {razorpay_subscription_id}, using first")
        sub = subs[0]
        sub_id = sub.get("subscription_id", sub.get("id", ""))
        updates["updated_at"] = _utcnow()

        if "tier" in updates:
            tier = updates["tier"]
            billing_cycle = sub.get("billing_cycle", "monthly")
            pricing = TIER_PRICING.get(tier, TIER_PRICING["free"])
            price = pricing["price_monthly"] if billing_cycle == "monthly" else pricing["price_yearly"]
            updates["price"] = price

        await self.storage.update_document(self.COLLECTION, sub_id, updates)
        return True

    async def _credit_topup(self, order_id: str, payment_id: str, credits: int) -> bool:
        """Credit the wallet for a verified Razorpay top-up (idempotent per payment)."""
        from app.services.credit_service import CreditService
        existing = await self.storage.query_documents(
            "credit_topup_payments",
            [("payment_id", "==", payment_id)],
        )
        if existing:
            return True
        team_id = None
        orders = await self.storage.query_documents(
            "credit_topup_orders", [("order_id", "==", order_id)]
        )
        if orders:
            team_id = orders[0].get("team_id")
        if not team_id:
            logger.warning(f"No team for top-up order {order_id}")
            return False
        await CreditService().add_credits(team_id, credits, reason="razorpay_topup")
        await self.storage.create_document(
            "credit_topup_payments", generate_id(),
            {"order_id": order_id, "payment_id": payment_id, "credits": credits, "processed_at": _utcnow()},
        )
        return True
```

- [x] **Step 8: Fix `create_subscription` defaults**

In `create_subscription` (lines 66-67), replace:

```python
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
```

with:

```python
            "razorpay_customer_id": None,
            "razorpay_subscription_id": None,
```

- [x] **Step 9: Run existing tests and confirm expected failures**

Run: `cd backend && pytest tests/test_billing_e2e.py tests/test_billing_webhook.py -x`
Expected: tests fail because they still reference `attach_stripe`, `_stripe`,
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_IDS`, and `stripe_customer_id`. These are updated in Task 4.

- [x] **Step 10: Commit**

```bash
git add backend/app/services/billing_service.py
git commit -m "feat(billing): swap billing service from Stripe to Razorpay"
```
---
### Task 4: Update billing API routes

**Files:**
- Modify: `backend/app/api/v1/billing.py`

- [x] **Step 1: Replace AttachStripeRequest + attach route**

Replace lines 40-42 and 102-116:

```python
class AttachRazorpayRequest(BaseModel):
    razorpay_customer_id: str
    razorpay_subscription_id: str
```

and:

```python
@router.post("/subscriptions/{team_id}/razorpay")
async def attach_razorpay(
    team_id: str,
    request: AttachRazorpayRequest,
    user: dict = Depends(get_current_user),
):
    await require_team_membership(team_id, user)
    success = await billing.attach_razorpay(
        team_id,
        request.razorpay_customer_id,
        request.razorpay_subscription_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="No active subscription")
    return {"attached": True}
```

- [x] **Step 2: Update the webhook receiver**

Replace the `stripe_webhook` route (lines 134-147) with a Razorpay receiver:

```python
@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Razorpay webhook receiver. Public, but signature-verified.

    Must be in AuthMiddleware public_paths so Razorpay (unauthenticated) can call it.
    """
    payload = await request.body()
    sig = request.headers.get("X-Razorpay-Signature")
    result = await billing.handle_webhook(payload, sig)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
```

- [x] **Step 3: Add credit top-up order + verify endpoints**

Append after the existing `/credits/topup` endpoint:

```python
class CreateOrderRequest(BaseModel):
    amount_inr: int = Field(..., gt=0, le=100000, description="Amount in rupees (INR)")


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/credits/order")
async def create_credit_order(
    request: CreateOrderRequest,
    user: dict = Depends(get_current_user),
):
    """Create a Razorpay order for a credit wallet top-up. Amount is in paise."""
    if not billing.is_razorpay_enabled():
        raise HTTPException(status_code=400, detail="Razorpay is not configured")
    order = await billing.create_payment_order(user.get("uid", ""), request.amount_inr)
    if "error" in order:
        raise HTTPException(status_code=400, detail=order["error"])
    return order


@router.post("/credits/order/verify")
async def verify_credit_order(
    request: VerifyPaymentRequest,
    user: dict = Depends(get_current_user),
):
    """Verify a Razorpay payment signature and credit the wallet."""
    result = await billing.verify_payment_order(request.razorpay_order_id, request.razorpay_payment_id, request.razorpay_signature)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
```

- [x] **Step 4: Update the top-up docstring**

In `top_up_credits`, change the docstring reference from "after a successful Stripe payment"
to "after a successful Razorpay payment" (optional, cosmetic).

- [x] **Step 5: Verify routes import cleanly**

Run: `cd backend && python -c "from app.api.v1.billing import router; print(len(router.routes))"`
Expected: no ImportError; prints a route count.

- [x] **Step 6: Commit**

```bash
git add backend/app/api/v1/billing.py
git commit -m "feat(billing): razorpay webhook + credit order/verify endpoints"
```
---
### Task 5: Add payment order methods to BillingService

**Files:**
- Modify: `backend/app/services/billing_service.py`

- [x] **Step 1: Add create_payment_order**

Add these methods to `BillingService` (after `create_checkout_session`):

```python
    async def create_payment_order(self, team_id: str, amount_inr: int) -> Dict[str, Any]:
        """Create a Razorpay order for a credit wallet top-up.

        Razorpay order amounts are in paise (amount_inr * 100). Returns the
        order_id, amount (paise), currency, and key_id for Checkout.js.
        """
        if not self.is_razorpay_enabled():
            return {"error": "Razorpay is not configured", "stub": True}
        if amount_inr <= 0:
            return {"error": "Top-up amount must be positive"}
        client = self._razorpay()
        amount_paise = amount_inr * 100

        def _create():
            return client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "notes": {"team_id": team_id, "topup": "1"},
            })

        try:
            order = await asyncio.to_thread(_create)
        except Exception as exc:
            logger.error(f"Razorpay order creation failed: {exc}")
            _sentry_report(exc, {"team_id": team_id, "amount_inr": amount_inr})
            return {"error": f"Razorpay order creation failed: {exc}"}
        await self.storage.create_document(
            "credit_topup_orders", order.get("id"),
            {
                "order_id": order.get("id"),
                "team_id": team_id,
                "amount_inr": amount_inr,
                "amount_paise": amount_paise,
                "currency": "INR",
                "status": order.get("status", "created"),
                "created_at": _utcnow(),
            },
        )
        return {
            "order_id": order.get("id"),
            "amount": amount_paise,
            "currency": "INR",
            "key_id": os.getenv("RAZORPAY_KEY_ID"),
        }

    async def verify_payment_order(self, order_id: str, payment_id: str, signature: str) -> Dict[str, Any]:
        """Verify a Razorpay payment signature and credit the wallet once."""
        params = {
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        }
        try:
            client = self._razorpay()
            verified = await asyncio.to_thread(client.utility.verify_payment_signature, params)
            if not verified:
                return {"error": "Invalid payment signature"}
        except Exception as exc:
            logger.warning(f"Razorpay payment signature verification failed: {exc}")
            return {"error": "Invalid payment signature"}

        orders = await self.storage.query_documents("credit_topup_orders", [("order_id", "==", order_id)])
        if not orders:
            return {"error": "Unknown order"}
        credits = orders[0].get("amount_inr", 0)
        credited = await self._credit_topup(order_id, payment_id, credits)
        if not credited:
            return {"error": "Could not credit wallet"}
        await self.storage.update_document("credit_topup_orders", order_id, {"status": "paid"})
        return {"credited": True, "credits": credits}
```

- [x] **Step 2: Run the service import check**

Run: `cd backend && python -c "from app.services.billing_service import BillingService; print('ok')"`
Expected: prints `ok`.

- [x] **Step 3: Commit**

```bash
git add backend/app/services/billing_service.py
git commit -m "feat(billing): add razorpay order + payment verification for credit top-ups"
```
---
### Task 6: Update main.py env validation + .env.example

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/.env.example`

- [x] **Step 1: Update _validate_production_env**

In `backend/app/main.py`, replace lines 113-126:

```python
    # Required environment variables. RAZORPAY_WEBHOOK_SECRET is only required
    # when billing is actually enabled � without RAZORPAY_KEY_ID the billing
    # service runs in metadata-only stub mode and never verifies a signature.
    required_vars = [
        "DATABASE_URL",
        "GITHUB_TOKEN_ENCRYPTION_KEY", "REDIS_URL",
        "JWT_SECRET", "PII_ENCRYPTION_KEY",
        "API_KEY_HMAC_SECRET",
    ]
    razorpay_enabled = any(
        os.getenv(v) for v in ("RAZORPAY_KEY_ID", "RAZORPAY_PLAN_STARTUP", "RAZORPAY_PLAN_PROFESSIONAL")
    )
    if razorpay_enabled:
        required_vars.append("RAZORPAY_WEBHOOK_SECRET")
```

Also update the docstring on line 103 (optional, cosmetic: "Stripe webhook" ? "Razorpay webhook").

- [x] **Step 2: Update .env.example**

In `backend/.env.example`, replace lines 100-103:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTUP=
STRIPE_PRICE_PROFESSIONAL=
```

with:

```text
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_STARTUP=
RAZORPAY_PLAN_PROFESSIONAL=
RAZORPAY_PLAN_USAGE_BASED=
```

- [x] **Step 3: Verify main imports**

Run: `cd backend && python -c "import app.main; print('ok')"`
Expected: prints `ok`.

- [x] **Step 4: Commit**

```bash
git add backend/app/main.py backend/.env.example
git commit -m "feat(billing): razorpay env validation and config vars"
```
---
### Task 7: Update and add backend tests

**Files:**
- Modify: `backend/tests/test_billing_e2e.py`
- Modify: `backend/tests/test_billing_webhook.py`
- Modify: `backend/tests/test_prod_env_validation.py`
- Create: `backend/tests/test_razorpay_topup.py`
- Create: `backend/tests/test_razorpay_webhook_events.py`

- [x] **Step 1: Rewrite test_billing_e2e.py**

Replace the entire file with a Razorpay-flavored version. Key changes: env vars,
`attach_razorpay`, `_razorpay` mock, `RAZORPAY_PLAN_IDS`, `razorpay_subscription_id`,
and INR price expectations (`price == 999` for startup, `2999` for professional).

```python
"""End-to-end tests for the full billing lifecycle (Razorpay).

Covers subscription CRUD, Razorpay subscription creation, webhook event
processing (activated/charged/cancelled), idempotency, and audit logging.
"""
import json
from unittest.mock import MagicMock, patch
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    import app.services.billing_service as bs
    monkeypatch.setattr(bs, "RAZORPAY_PLAN_IDS", {
        "startup": "plan_startup_test",
        "professional": "plan_prof_test",
    })
    return BillingService()


@pytest.fixture
async def seeded_sub(service):
    await service.create_subscription("team_e2e", "startup", "monthly")
    await service.attach_razorpay("team_e2e", "cus_e2e", "sub_e2e")
    return "team_e2e"


def _make_webhook_event(event_type: str, entity: dict, **overrides: dict) -> bytes:
    data = {
        "event": event_type,
        "payload": {"subscription": {"entity": entity}},
        "created_at": 1700000000,
    }
    data.update(overrides)
    return json.dumps(data).encode()


class TestSubscriptionCRUD:
    async def test_create_and_get_subscription(self, service):
        sub = await service.create_subscription("team_1", "startup", "monthly")
        assert sub["team_id"] == "team_1"
        assert sub["tier"] == "startup"
        assert sub["status"] == "active"
        assert sub["price"] == 999

        fetched = await service.get_subscription("team_1")
        assert fetched is not None
        assert fetched["subscription_id"] == sub["subscription_id"]

    async def test_get_nonexistent_subscription(self, service):
        assert await service.get_subscription("nonexistent") is None

    async def test_update_subscription_tier(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        updated = await service.update_subscription("team_1", "professional")
        assert updated["tier"] == "professional"
        assert updated["price"] == 2999

    async def test_cancel_subscription_hides_it(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        assert await service.cancel_subscription("team_1") is True
        assert await service.get_subscription("team_1") is None

    async def test_cancel_nonexistent_returns_false(self, service):
        assert await service.cancel_subscription("nonexistent") is False

    async def test_attach_razorpay_ids(self, service):
        await service.create_subscription("team_1", "startup", "monthly")
        assert await service.attach_razorpay("team_1", "cus_abc", "sub_xyz") is True
        sub = await service.get_subscription("team_1")
        assert sub["razorpay_customer_id"] == "cus_abc"
        assert sub["razorpay_subscription_id"] == "sub_xyz"


class TestSubscriptionCreation:
    async def test_razorpay_disabled_returns_stub(self, monkeypatch, service):
        monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
        result = await service.create_checkout_session(
            "team_1", "startup", "https://example.com/success", "https://example.com/cancel"
        )
        assert result == {"error": "Razorpay is not configured", "stub": True}

    async def test_creates_razorpay_subscription(self, service):
        mock_sub = MagicMock()
        mock_sub.get.side_effect = lambda k, d=None: {"short_url": "https://rzp.io/abc", "id": "sub_test"}.get(k, d)
        mock_client = MagicMock()
        mock_client.subscription.create.return_value = mock_sub
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.create_checkout_session(
                "team_1", "startup", "https://example.com/success", "https://example.com/cancel"
            )
        assert result["url"] == "https://rzp.io/abc"
        assert result["subscription_id"] == "sub_test"


class TestWebhookEvents:
    async def test_activated_attaches_razorpay(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.activated",
            {"id": "sub_new", "customer_id": "cus_new", "notes": {"team_id": "team_e2e"}},
        )
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "subscription.activated"}
        sub = await service.get_subscription("team_e2e")
        assert sub["razorpay_customer_id"] == "cus_new"
        assert sub["razorpay_subscription_id"] == "sub_new"

    async def test_charged_syncs_status(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.charged",
            {"id": "sub_e2e", "plan_id": "plan_startup_test"},
        )
        await service.handle_webhook(payload, sig_header=None)
        subs = await service.storage.query_documents("onramp_subscriptions", [("team_id", "==", "team_e2e")])
        assert subs[0]["status"] == "active"

    async def test_cancelled_cancels_local(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.cancelled", {"id": "sub_e2e"})
        await service.handle_webhook(payload, sig_header=None)
        assert await service.get_subscription("team_e2e") is None

    async def test_idempotency_skips_duplicate(self, service, seeded_sub):
        payload = _make_webhook_event("subscription.activated",
            {"id": "sub_dedup", "customer_id": "cus_dedup", "notes": {"team_id": "team_e2e"}},
        )
        r1 = await service.handle_webhook(payload, sig_header=None, idempotency_key="idem_1")
        assert r1["received"] is True
        r2 = await service.handle_webhook(payload, sig_header=None, idempotency_key="idem_1")
        assert r2["duplicate"] is True


class TestPricingTiers:
    def test_all_tiers_present(self):
        pricing = BillingService.get_pricing()
        for tier in ("free", "startup", "professional", "enterprise"):
            assert tier in pricing

    def test_startup_price_is_inr(self):
        assert BillingService.get_pricing()["startup"]["price_monthly"] == 999
```

- [x] **Step 2: Run the e2e tests**

Run: `cd backend && pytest tests/test_billing_e2e.py -v`
Expected: all pass.

- [x] **Step 3: Rewrite test_billing_webhook.py**

Replace the file with Razorpay signature tests. The `service` fixture now uses
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`; env vars are `RAZORPAY_WEBHOOK_SECRET` and
`ALLOW_UNVERIFIED_RAZORPAY`. In dev-unverified mode the returned dict includes the
normalized `id`/`type`/`data` keys, so assert on `event["type"]`.

```python
"""Regression tests: Razorpay webhook must not be trusted without signature
verification in production, and dev bypass requires an explicit opt-in flag.
"""
import json

import pytest

from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    return BillingService()


async def test_production_without_secret_or_signature_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    payload = json.dumps({"event": "subscription.charged"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_dev_without_secret_and_without_allow_flag_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("ALLOW_UNVERIFIED_RAZORPAY", raising=False)
    payload = json.dumps({"event": "subscription.charged"}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_dev_without_secret_but_with_allow_flag_is_accepted(service, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    payload = json.dumps({"event": "subscription.charged", "payload": {"subscription": {"entity": {"id": "s1"}}}}).encode()

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is not None
    assert event["type"] == "subscription.charged"


async def test_secret_set_but_signature_header_missing_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec_dummy")
    payload = b'{"event": "subscription.charged"}'

    event = await service._verify_and_parse_event(payload, sig_header=None)
    assert event is None


async def test_secret_and_header_present_but_invalid_signature_is_rejected(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec_dummy")
    payload = b'{"event": "subscription.charged"}'

    event = await service._verify_and_parse_event(payload, sig_header="not-a-real-signature")
    assert event is None


async def test_handle_webhook_returns_error_on_invalid_signature(service, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "whsec_dummy")

    result = await service.handle_webhook(b'{"event": "subscription.charged"}', sig_header="bad-sig")
    assert result == {"error": "Invalid webhook signature"}
```
- [x] **Step 4: Run webhook tests**

Run: `cd backend && pytest tests/test_billing_webhook.py -v`
Expected: all pass.

- [x] **Step 5: Update test_prod_env_validation.py**

Replace `STRIPE_WEBHOOK_SECRET` with `RAZORPAY_WEBHOOK_SECRET` in the `REQUIRED_VARS`
tuple (line 12), and replace the Stripe references in `_set_all_required` (line 52),
`test_production_without_stripe_config_does_not_require_webhook_secret` (lines 92-101),
and `test_production_with_any_single_llm_key_passes` (lines 104-117) with Razorpay:

```python
REQUIRED_VARS = (
    "DATABASE_URL", "RAZORPAY_WEBHOOK_SECRET", "GITHUB_TOKEN_ENCRYPTION_KEY",
    "REDIS_URL", "JWT_SECRET", "PII_ENCRYPTION_KEY",
    "API_KEY_HMAC_SECRET",
)
```

In `_set_all_required`, replace the Stripe enable line with:

```python
    # Enable Razorpay so RAZORPAY_WEBHOOK_SECRET is actually required (billing is
    # optional � without RAZORPAY_KEY_ID it runs in stub mode).
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_x")
```

Rename `test_production_without_stripe_config_does_not_require_webhook_secret` ?
`test_production_without_razorpay_config_does_not_require_webhook_secret` and replace its
body's `STRIPE_*` deletions with:

```python
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_PLAN_STARTUP", raising=False)
    monkeypatch.delenv("RAZORPAY_PLAN_PROFESSIONAL", raising=False)
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
```

- [x] **Step 6: Run prod-env validation tests**

Run: `cd backend && pytest tests/test_prod_env_validation.py -v`
Expected: all pass.

- [x] **Step 7: Create test_razorpay_topup.py**

```python
"""Credit wallet top-up via Razorpay orders and payment signature verification."""
from unittest.mock import MagicMock, patch
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    return BillingService()


class TestCreatePaymentOrder:
    async def test_disabled_returns_stub(self, service, monkeypatch):
        monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
        result = await service.create_payment_order("user_1", 500)
        assert result == {"error": "Razorpay is not configured", "stub": True}

    async def test_creates_order_with_paise_amount(self, service):
        mock_order = MagicMock()
        mock_order.get.side_effect = lambda k, d=None: {"id": "order_test", "status": "created"}.get(k, d)
        mock_client = MagicMock()
        mock_client.order.create.return_value = mock_order
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.create_payment_order("user_1", 500)
        assert result["order_id"] == "order_test"
        assert result["amount"] == 50000  # 500 INR -> 50000 paise
        assert result["currency"] == "INR"
        assert result["key_id"] == "rzp_test_dummy"
        mock_client.order.create.assert_called_once()
        assert mock_client.order.create.call_args[0][0]["amount"] == 50000

    async def test_rejects_nonpositive_amount(self, service):
        result = await service.create_payment_order("user_1", 0)
        assert "error" in result


class TestVerifyPaymentOrder:
    async def test_valid_signature_credits_wallet(self, service):
        await service.storage.create_document("credit_topup_orders", "order_1", {
            "order_id": "order_1", "team_id": "user_1", "amount_inr": 500,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_1", "pay_1", "sig_1")
        assert result == {"credited": True, "credits": 500}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_1")
        assert wallet["balance"] == 500

    async def test_invalid_signature_no_credit(self, service):
        await service.storage.create_document("credit_topup_orders", "order_2", {
            "order_id": "order_2", "team_id": "user_2", "amount_inr": 100,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.side_effect = Exception("bad signature")
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_2", "pay_2", "sig_bad")
        assert result == {"error": "Invalid payment signature"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_2")
        assert wallet["balance"] == 0

    async def test_double_verify_credits_once(self, service):
        await service.storage.create_document("credit_topup_orders", "order_3", {
            "order_id": "order_3", "team_id": "user_3", "amount_inr": 200,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        with patch.object(service, "_razorpay", return_value=mock_client):
            await service.verify_payment_order("order_3", "pay_3", "sig_3")
            await service.verify_payment_order("order_3", "pay_3", "sig_3")
        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_3")
        assert wallet["balance"] == 200
```

- [x] **Step 8: Create test_razorpay_webhook_events.py**

```python
"""Razorpay webhook event -> local state mapping (payment.captured top-ups)."""
import json
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    monkeypatch.setenv("ALLOW_UNVERIFIED_RAZORPAY", "true")
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    return BillingService()


def _event(event_type: str, entity: dict) -> bytes:
    return json.dumps({"event": event_type, "payload": {"payment": {"entity": entity}}}).encode()


class TestPaymentCapturedTopup:
    async def test_topup_credits_wallet(self, service):
        await service.storage.create_document("credit_topup_orders", "order_t1", {
            "order_id": "order_t1", "team_id": "user_t1", "amount_inr": 300,
        })
        payload = _event("payment.captured", {
            "id": "pay_t1", "order_id": "order_t1", "amount": 30000,
            "notes": {"team_id": "user_t1", "topup": "1"},
        })
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "payment.captured"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_t1")
        assert wallet["balance"] == 300

    async def test_subscription_payment_captured_is_logged_only(self, service):
        payload = _event("payment.captured", {
            "id": "pay_t2", "order_id": "order_x", "amount": 99900,
            "notes": {},
        })
        result = await service.handle_webhook(payload, sig_header=None)
        assert result == {"received": True, "type": "payment.captured"}

    async def test_duplicate_topup_payment_credits_once(self, service):
        await service.storage.create_document("credit_topup_orders", "order_t3", {
            "order_id": "order_t3", "team_id": "user_t3", "amount_inr": 100,
        })
        payload = _event("payment.captured", {
            "id": "pay_t3", "order_id": "order_t3", "amount": 10000,
            "notes": {"team_id": "user_t3", "topup": "1"},
        })
        await service.handle_webhook(payload, sig_header=None)
        await service.handle_webhook(payload, sig_header=None)

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_t3")
        assert wallet["balance"] == 100
```

- [x] **Step 9: Run the new tests**

Run: `cd backend && pytest tests/test_razorpay_topup.py tests/test_razorpay_webhook_events.py -v`
Expected: all pass.

- [x] **Step 10: Run the full backend test suite**

Run: `cd backend && pytest -q`
Expected: no failures (Stripe references removed everywhere).

- [x] **Step 11: Commit**

```bash
git add backend/tests/
git commit -m "test(billing): update and add tests for Razorpay billing"
```
---
### Task 8: Update frontend billing API client

**Files:**
- Modify: `web/src/lib/api.ts`

- [x] **Step 1: Update the Subscription type**

In `web/src/lib/api.ts`, replace the `Subscription` interface (lines 939-947):

```ts
export interface Subscription {
  team_id: string
  tier: string
  price: number
  billing_cycle: string
  status: string
  razorpay_customer_id?: string
  razorpay_subscription_id?: string
  created_at: string
}
```

- [x] **Step 2: Replace attachStripe with attachRazorpay**

Replace lines 987-999:

```ts
export async function attachRazorpay(
  teamId: string,
  razorpayCustomerId: string,
  razorpaySubscriptionId: string
): Promise<Subscription> {
  return request<Subscription>(
    `${API_BASE}/billing/subscriptions/${teamId}/razorpay`,
    {
      razorpay_customer_id: razorpayCustomerId,
      razorpay_subscription_id: razorpaySubscriptionId,
    }
  )
}
```

- [x] **Step 3: Update createCheckoutSession return type**

Replace lines 1005-1015:

```ts
export async function createCheckoutSession(data: {
  team_id: string
  tier: string
  success_url: string
  cancel_url: string
}): Promise<{ url: string; subscription_id: string }> {
  return request<{ url: string; subscription_id: string }>(
    `${API_BASE}/billing/checkout`,
    data
  )
}
```

- [x] **Step 4: Add credit order + verify functions**

Append after `createCheckoutSession`:

```ts
export async function createCreditOrder(data: {
  amount_inr: number
}): Promise<{
  order_id: string
  amount: number
  currency: string
  key_id: string
}> {
  return request<{ order_id: string; amount: number; currency: string; key_id: string }>(
    `${API_BASE}/billing/credits/order`,
    data
  )
}

export async function verifyCreditOrder(data: {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}): Promise<{ credited: boolean; credits: number }> {
  return request<{ credited: boolean; credits: number }>(
    `${API_BASE}/billing/credits/order/verify`,
    data
  )
}
```

- [x] **Step 5: Verify the client typechecks**

Run: `cd web && npx tsc --noEmit`
Expected: no errors related to `api.ts` (other pre-existing errors, if any, are untouched).

- [x] **Step 6: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat(billing): razorpay API client (attach, checkout, credit order/verify)"
```
---
### Task 9: Update BillingPage for INR + Razorpay top-up

**Files:**
- Modify: `web/src/pages/BillingPage.tsx`

- [x] **Step 1: Update imports**

Replace the import from `../lib/api` (line 3) with the Razorpay functions added in Task 8:

```ts
import { createSubscription, getSubscription, cancelSubscription, createCheckoutSession, listTeams, getCreditWallet, getCreditLedger, createCreditOrder, verifyCreditOrder, CREDIT_COSTS_LIST } from '../lib/api'
```

Also add `RazorpayLogo` (or reuse `CreditCard`) from `@phosphor-icons/react` on line 10 � no
new dependency required; keep existing icon imports.

- [x] **Step 2: Update tier card prices to INR**

Replace the `tiers` array (lines 29-35) so prices are INR and the usage-based tier shows the
?499 base:

```ts
  const tiers = [
    { id: 'free', price: 0, label: 'Free', features: ['1 team member', '1 repository', '50 credits/month', 'Community support'] },
    ...(usageBasedEnabled ? [{ id: 'usage_based', price: 499, label: 'Usage-Based', features: ['1 team member', '1 repository', 'Pay per query', 'Email support'] }] : []),
    { id: 'startup', price: 999, label: 'Startup', features: ['5 team members', '10 repositories', '5,000 credits/month', 'Email support'] },
    { id: 'professional', price: 2999, label: 'Professional', popular: true, features: ['20 team members', '50 repositories', '50,000 credits/month', 'Priority support'] },
    { id: 'enterprise', price: 0, label: 'Enterprise', features: ['Unlimited members', 'Unlimited repos', 'Unlimited credits', 'Dedicated support', 'SSO', 'SLA'] },
  ]
```

- [x] **Step 3: Swap currency symbols in JSX**

Replace `$` with `?` in the price displays:
- Line 173: `${subscription.price}/mo` ? `?{subscription.price}/mo`
- Line 301: `${tier.price}` ? `?{tier.price}`

- [x] **Step 4: Implement Razorpay top-up flow**

Replace `handleTopUp` (lines 109-117) with an order + Checkout.js flow:

```ts
  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  async function handleTopUp() {
    try {
      const ok = await loadRazorpayScript()
      if (!ok) { toast.error('Could not load payment gateway'); return }
      const order = await createCreditOrder({ amount_inr: topUpAmount })
      const rzp = new (window as any).Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'Onramp',
        description: `Credit top-up of ${topUpAmount} credits`,
        order_id: order.order_id,
        handler: async (response: any) => {
          const res = await verifyCreditOrder({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          })
          if (res.credited) {
            toast.success('Credits added', `${res.credits} credits added to wallet`)
            await fetchWallet()
          } else {
            toast.error('Payment verification failed')
          }
        },
        modal: { ondismiss: () => { /* no-op; user cancelled */ } },
      })
      rzp.open()
    } catch (e) {
      toast.error('Top-up failed', e instanceof Error ? e.message : 'Unknown error')
    }
  }
```

- [x] **Step 5: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 6: Commit**

```bash
git add web/src/pages/BillingPage.tsx
git commit -m "feat(billing): INR pricing + Razorpay checkout for credit top-ups"
```
---
### Task 10: Update legal pages (Stripe ? Razorpay)

**Files:**
- Modify: `web/src/pages/TermsPage.tsx`
- Modify: `web/src/pages/PrivacyPage.tsx`
- Modify: `web/src/pages/DPAPage.tsx`

- [x] **Step 1: TermsPage.tsx**

Replace "Paid plans are billed in advance through Stripe on a monthly or annual cycle..."
(line 42) with:

```tsx
      'Paid plans are billed in advance through Razorpay on a monthly or annual cycle and renew automatically until cancelled. Usage-based charges, where applicable, are billed in arrears. You can cancel at any time from the billing page; cancellation takes effect at the end of the current billing period. Fees are non-refundable except where required by law. We may change pricing with at least 30 days notice.',
```

- [x] **Step 2: PrivacyPage.tsx**

Replace "Payment data: handled by Stripe. We never store full card numbers on our servers."
(line 14) with:

```tsx
      'Payment data: handled by Razorpay. We never store full card numbers on our servers.',
```

Replace "payment processing (Stripe)" (line 37) with "payment processing (Razorpay)".

- [x] **Step 3: DPAPage.tsx**

Replace "'Stripe Inc. � Payment processing'" (line 41) with:

```tsx
  'Razorpay Inc. � Payment processing',
```

- [x] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 5: Commit**

```bash
git add web/src/pages/TermsPage.tsx web/src/pages/PrivacyPage.tsx web/src/pages/DPAPage.tsx
git commit -m "docs(legal): reference Razorpay instead of Stripe in legal pages"
```
---

### Task 11: Final sweep for stray Stripe references

**Files:**
- Modify: various

- [x] **Step 1: Search for leftover Stripe references**

Run: `rg -i "stripe" backend/app web/src backend/tests backend/.env.example backend/requirements.txt`
Expected: no matches except the historical Alembic migration
`backend/alembic/versions/008_add_dynamic_document_tables.py` (which stays as history)
and `backend/tests/test_prod_env_validation.py` if a docstring still mentions Stripe
(update those docstrings to Razorpay).

- [x] **Step 2: Confirm webhook path is public**

In `backend/app/main.py`, confirm `/api/v1/billing/webhook` remains in the
AuthMiddleware public_paths list (line ~342). No change needed unless the route moved.

- [x] **Step 3: Run the full backend test suite + frontend typecheck**

Run: `cd backend && pytest -q`
Run: `cd web && npx tsc --noEmit`
Expected: backend tests pass; no new frontend type errors.

- [x] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "chore(billing): final Stripe removal sweep"
```
(If nothing changed, skip this commit.)
