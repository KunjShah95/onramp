# Razorpay Billing Replacement — Design

**Date:** 2026-08-09
**Status:** Approved (design review)

## Problem

Onramp currently bills via Stripe (checkout sessions, subscription webhooks). We are
replacing Stripe entirely with Razorpay, converting USD tier pricing to realistic INR, and
keeping the BYOK model (users supply their own LLM API keys, so AI token cost is excluded
from subscription price).

## Decisions (confirmed)

- **Full replacement** — remove all Stripe code, SDK dependency, env vars, and DB columns.
- **Currency** — convert to realistic INR.
- **Billing model** — recurring subscriptions via Razorpay Subscriptions API (1:1 mapping
  with current Stripe subscription flow).
- **BYOK** — subscription covers platform usage only (seats, repos, credits/calls per
  month). AI token cost is on the user's own keys.
- **Credit wallet top-ups** (usage_based tier) — billed via Razorpay one-time orders.

## Pricing (INR, platform-only)

| Tier | Monthly | Yearly | Positioning |
|---|---|---|---|
| free | ₹0 | ₹0 | trial / hobby |
| starter | ₹999 | ₹9,999 | undercuts Cursor Pro (~₹1,700) |
| professional | ₹2,999 | ₹29,999 | ~$36/mo equivalent, under Cursor Teams |
| usage_based | ₹499 | ₹4,999 | pay-per-query floor + wallet |
| enterprise | Custom | Custom | sales-led |

Note: pricing display and `TIER_PRICING` in the backend move from USD ints to INR ints
(the amounts are the numeric values; the currency symbol changes to ₹ in the UI).

## Backend Changes

### 1. `billing_service.py` (rewrite Stripe → Razorpay)

- Replace `STRIPE_PRICE_IDS` with `RAZORPAY_PLAN_IDS` (per-tier plan IDs from env:
  `RAZORPAY_PLAN_STARTUP`, `RAZORPAY_PLAN_PROFESSIONAL`, `RAZORPAY_PLAN_USAGE_BASED`).
- `TIER_PRICING` values updated to INR amounts above.
- `is_stripe_enabled()` → `is_razorpay_enabled()` (guarded by `RAZORPAY_KEY_ID` +
  `RAZORPAY_KEY_SECRET`).
- `_stripe()` → `_razorpay()` — lazily import `razorpay`, build `razorpay.Client(
  auth=(KEY_ID, KEY_SECRET))`.
- `create_checkout_session(...)` → create a **subscription**:
  `razorpay.Subscription.create(plan_id, customer_notify=1, quantity=1, total_count=12,
  notes={team_id, tier}, customer_notes)` and return `{url: subscription.short_url,
  subscription_id: subscription.id}`.
- `create_subscription`/`update_subscription`/`cancel_subscription`/`get_subscription`
  keep their document-store behavior (DB storage unchanged except columns).
- `attach_stripe` → `attach_razorpay` (writes `razorpay_subscription_id`).
- Webhook: `_verify_and_parse_event` → verify Razorpay signature using
  `razorpay.utility.verify_webhook_signature(payload, sig, secret)` with the
  `X-Razorpay-Signature` header. Razorpay sends raw JSON body (not a wrapper event);
  adapt parsing accordingly.
- `_process_event` → Razorpay event types:
  - `subscription.activated` → set status active
  - `subscription.charged` → update period, keep active
  - `subscription.completed` → status completed/canceled
  - `subscription.pending` / `subscription.halted` → status paused/past_due
  - `subscription.cancelled` → status canceled
  - `payment.captured` → credits top-up for usage_based (amount → credits)
  - `payment.failed` → log + mark past_due
  - Unknown → log unhandled
- `_update_subscription_by_stripe_id` → `_update_subscription_by_razorpay_id` (query by
  `razorpay_subscription_id`).
- Idempotency: keep the existing idempotency collection; key on Razorpay `event_id` and
  `X-Razorpay-...` idempotency where available.
- Add `create_payment_order(team_id, amount_inr)` for credit wallet top-ups using
  Razorpay Orders API (`razorpay.Order.create`), returning `{order_id, amount, currency:
  "INR", key_id}` so the frontend can open the Razorpay Checkout (embedded).
  - **Razorpay amounts are in paise** (smallest currency unit): `amount` passed to the
    Order API must be `rupees * 100`. The frontend Checkout receives `amount` in paise and
    displays ₹. Wallet credits are added in rupees (e.g. a ₹499 order credits 499 credits).
- Signature verification secret from env `RAZORPAY_WEBHOOK_SECRET`.

### 2. `api/v1/billing.py`

- `AttachStripeRequest` → `AttachRazorpayRequest` (`razorpay_subscription_id`).
- `/subscriptions/{team_id}/stripe` → `/subscriptions/{team_id}/razorpay`.
- Webhook receiver: read `X-Razorpay-Signature` header; keep route `/billing/webhook`
  (public, signature-verified). Response to Razorpay should be `200` + JSON; Razorpay
  expects a JSON body on success.
- Add `/checkout` behavior unchanged (returns `{url, subscription_id}`).
- Add `/credits/order` endpoint (or extend checkout) to create a payment order for
  wallet top-up; add a verify endpoint `/credits/order/verify` that validates the
  `razorpay_payment_id`/`razorpay_signature` from the frontend's successful checkout and
  credits the wallet. (Verify via `razorpay.utility.verify_payment_signature`.)
- Top-up amount is now INR credits (e.g. ₹499 → 499 credits or configurable rate).

### 3. `database/models.py` + migration

- `Subscription` model: rename `stripe_customer_id` → `razorpay_customer_id`,
  `stripe_subscription_id` → `razorpay_subscription_id`, add
  `razorpay_payment_id` (nullable, for captured payments/top-ups).
- Update `to_dict()` accordingly.
- New Alembic migration `023_razorpay_billing.py`:
  - rename columns on `onramp_subscriptions`
  - drop nothing else; idempotency/event-log collections are provider-agnostic already
- Historical migration `008_add_dynamic_document_tables.py` stays as-is (history).

### 4. `main.py`

- Env validation: replace `STRIPE_*` requirements with `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (webhook secret required when billing
  enabled, same conditional logic).
- Public path `/api/v1/billing/webhook` unchanged (Razorpay calls it unauthenticated).

### 5. `requirements.txt`

- Remove `stripe>=10.0.0`; add `razorpay>=1.4` (or latest stable).

### 6. `.env.example` (backend)

- Replace `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` with
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
  `RAZORPAY_PLAN_STARTUP`, `RAZORPAY_PLAN_PROFESSIONAL`, `RAZORPAY_PLAN_USAGE_BASED`.

## Frontend Changes

### `web/src/pages/BillingPage.tsx`

- Tier price display: ₹ symbol instead of `$`; prices updated to INR values.
- `handleCreateSubscription`: for paid tiers, call checkout → redirect to
  `result.url` (Razorpay hosted checkout page).
- Usage-based top-up: replace direct `topUpCredits` with a Razorpay checkout flow —
  create order → open Razorpay Checkout with `key_id`, `order_id`, `amount`; on
  `payment.success` callback, POST verify endpoint → wallet credited. Load Razorpay
  Checkout script (`https://checkout.razorpay.com/v1/checkout.js`) lazily.
- Handle `checkout=success` query param (unchanged).

### `web/src/lib/api.ts`

- `attachStripe` → `attachRazorpay`; `Subscription` type: `stripe_*` → `razorpay_*`.
- Add `createPaymentOrder`, `verifyPaymentSignature`, and `openRazorpayCheckout` helpers
  (or a small `lib/razorpay.ts`).
- `createCheckoutSession` stays (returns `{url, subscription_id}`).

### Legal pages

- `TermsPage.tsx`, `PrivacyPage.tsx`, `DPAPage.tsx`: replace "Stripe" mentions with
  "Razorpay". DPA: "Razorpay Inc." payment processing. Privacy: "Payment data: handled by
  Razorpay. We never store full card numbers on our servers." Note Razorpay is RBI
  regulated (PA/PG) — keep the wording simple.

## Tests

- `test_billing_e2e.py`: rename/repurpose Stripe assertions → Razorpay (attach IDs,
  stub when disabled, checkout creates subscription, activated event attaches).
- `test_billing_webhook.py`: signature verification for Razorpay
  (`X-Razorpay-Signature`), secret-missing rejection, unverified-dev-mode flag, valid
  signature passes.
- `test_prod_env_validation.py`: env-var names updated (RAZORPAY_*).
- New `test_razorpay_topup.py`: order creation, payment signature verification, wallet
  credit on verified payment.
- New `test_razorpay_webhook_events.py`: subscription.activated / charged / cancelled /
  payment.captured mapping.

## Error Handling

- Razorpay SDK errors (auth failure, invalid plan) → 400 with message; billing stays in
  stub mode when not configured (`{error, stub: true}`), same pattern as today.
- Webhook: signature mismatch → 400; missing secret in prod → reject; idempotency key
  dedupe preserved.
- Top-up verify failure (bad signature) → no credits, 400.

## Migration / Rollout

1. Backend: billing_service, models, migration, env, requirements, main.py.
2. Frontend: BillingPage, api.ts, legal pages.
3. Tests updated/added.
4. Run Alembic upgrade on staging + prod.
5. Swap env vars (remove STRIPE_*, add RAZORPAY_*), create plans in Razorpay dashboard,
   point webhook to `/api/v1/billing/webhook`.
