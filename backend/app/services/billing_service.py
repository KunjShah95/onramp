import os
import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.billing")

# Razorpay plan IDs per tier (set in env when using real Razorpay billing).
RAZORPAY_PLAN_IDS = {
    "startup": os.getenv("RAZORPAY_PLAN_STARTUP"),
    "professional": os.getenv("RAZORPAY_PLAN_PROFESSIONAL"),
    "usage_based": os.getenv("RAZORPAY_PLAN_USAGE_BASED"),
}


# INR pricing (platform usage only — BYOK keeps AI token cost on the user's own keys).
TIER_PRICING = {
    "free": {"price_monthly": 0, "price_yearly": 0, "features": ["1 member", "1 repo", "50 credits/mo"]},
    "startup": {"price_monthly": 999, "price_yearly": 9999, "features": ["5 members", "10 repos", "5000 credits/mo"]},
    "professional": {"price_monthly": 2999, "price_yearly": 29999, "features": ["20 members", "50 repos", "50000 credits/mo"]},
    "usage_based": {"price_monthly": 499, "price_yearly": 4999, "features": ["1 member", "1 repo", "Pay per query (usage-based)"]},
    "enterprise": {"price_monthly": 0, "price_yearly": 0, "features": ["Custom", "Unlimited", "Dedicated support"]},
}


# ── Idempotency ───────────────────────────────────────────────────────────────
IDEMPOTENCY_COLLECTION = "onramp_webhook_idempotency"
EVENT_LOG_COLLECTION = "onramp_webhook_events"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sentry_report(exc: Exception, context: dict) -> None:
    """Report an exception to Sentry if the SDK is configured."""
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(exc, extras=context)
    except Exception:
        logger.exception("Failed to report exception to Sentry")


class BillingService:
    COLLECTION = "onramp_subscriptions"

    def __init__(self):
        self.storage = get_storage()

    async def create_subscription(self, team_id: str, tier: str, billing_cycle: str = "monthly") -> Dict[str, Any]:
        sub_id = generate_id()
        pricing = TIER_PRICING.get(tier, TIER_PRICING["free"])
        price = pricing["price_monthly"] if billing_cycle == "monthly" else pricing["price_yearly"]

        sub = {
            "subscription_id": sub_id,
            "team_id": team_id,
            "tier": tier,
            "billing_cycle": billing_cycle,
            "price": price,
            "status": "active",
            "current_period_start": _utcnow(),
            "current_period_end": None,
            "razorpay_customer_id": None,
            "razorpay_subscription_id": None,
            "razorpay_payment_id": None,
            "created_at": _utcnow(),
        }
        await self.storage.create_document(self.COLLECTION, sub_id, sub)
        return sub

    async def get_subscription(self, team_id: str) -> Optional[Dict[str, Any]]:
        subs = await self.storage.query_documents(self.COLLECTION, [("team_id", "==", team_id), ("status", "==", "active")])
        return subs[0] if subs else None

    async def update_subscription(self, team_id: str, tier: str) -> Optional[Dict[str, Any]]:
        sub = await self.get_subscription(team_id)
        if not sub:
            return None
        sub_id = sub.get("subscription_id", sub.get("id", ""))
        pricing = TIER_PRICING.get(tier, TIER_PRICING["free"])
        billing_cycle = sub.get("billing_cycle", "monthly")
        price = pricing["price_monthly"] if billing_cycle == "monthly" else pricing["price_yearly"]

        await self.storage.update_document(self.COLLECTION, sub_id, {
            "tier": tier,
            "price": price,
        })
        return {**sub, "tier": tier, "price": price}

    async def cancel_subscription(self, team_id: str) -> bool:
        sub = await self.get_subscription(team_id)
        if not sub:
            return False
        sub_id = sub.get("subscription_id", sub.get("id", ""))
        await self.storage.update_document(self.COLLECTION, sub_id, {"status": "canceled"})
        return True

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

    # ── Razorpay integration (optional, guarded by RAZORPAY_KEY_ID) ──────────

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

    # ── Webhook processing ──────────────────────────────────────────────────

    async def _check_idempotency(self, idempotency_key: Optional[str]) -> bool:
        """Return True if this idempotency key has been processed before."""
        if not idempotency_key:
            return False
        result = await self.storage.query_documents(
            IDEMPOTENCY_COLLECTION,
            [("idempotency_key", "==", idempotency_key)],
        )
        return len(result) > 0

    async def _record_idempotency(self, idempotency_key: str, event_id: str, event_type: str) -> None:
        """Record a processed idempotency key to prevent duplicates."""
        await self.storage.create_document(
            IDEMPOTENCY_COLLECTION,
            generate_id(),
            {
                "idempotency_key": idempotency_key,
                "event_id": event_id,
                "event_type": event_type,
                "processed_at": _utcnow(),
            },
        )

    async def _log_event(self, event_id: str, event_type: str, status: str, details: Optional[dict] = None) -> None:
        """Persist a webhook event record for audit trail."""
        await self.storage.create_document(
            EVENT_LOG_COLLECTION,
            event_id,
            {
                "event_id": event_id,
                "event_type": event_type,
                "status": status,
                "details": details or {},
                "received_at": _utcnow(),
            },
        )

    async def _verify_and_parse_event(self, payload: bytes, sig_header: Optional[str]) -> Optional[dict]:
        """Verify Razorpay webhook signature and parse the event.

        Returns the parsed (normalized) event dict, or None if verification
        fails. Runs the sync Razorpay SDK call in a thread to avoid blocking.
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

    async def handle_webhook(
        self,
        payload: bytes,
        sig_header: Optional[str],
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Verify and process a Razorpay webhook event with idempotency."""
        if not self.is_razorpay_enabled():
            return {"error": "Razorpay is not configured"}

        # 1. Parse and verify
        event = await self._verify_and_parse_event(payload, sig_header)
        if event is None:
            return {"error": "Invalid webhook signature"}

        event_id = event.get("id") or "evt_unknown"
        event_type = event.get("type") or "unknown"
        data_obj = event.get("data", {}).get("object", {})

        # 2. Idempotency check — skip if already processed. Key on the
        #    caller-supplied idempotency key, or the Razorpay webhook event id
        #    (Razorpay retries failed deliveries, so event-id keying dedupes
        #    retries in production).
        dedupe_key = idempotency_key or (event_id if event_id != "evt_unknown" else None)
        if dedupe_key:
            already_processed = await self._check_idempotency(dedupe_key)
            if already_processed:
                logger.info(f"Duplicate webhook event {event_id} ({event_type}) — skipping (idempotency key {dedupe_key[:12]}...)")
                return {"received": True, "type": event_type, "duplicate": True}

        # 3. Process the event
        try:
            result = await self._process_event(event_type, data_obj)
        except Exception as exc:
            logger.error(f"Failed to process webhook event {event_id} ({event_type}): {exc}")
            _sentry_report(exc, {"event_id": event_id, "event_type": event_type})
            await self._log_event(event_id, event_type, "failed", {"error": str(exc)})
            return {"error": f"Failed to process event: {exc}"}

        # 4. Record idempotency key
        if dedupe_key:
            await self._record_idempotency(dedupe_key, event_id, event_type)

        # 5. Log event for audit trail
        await self._log_event(event_id, event_type, "processed", result)

        return {"received": True, "type": event_type}

    async def _process_event(self, event_type: str, data_obj: dict) -> dict:
        """Route a verified Razorpay webhook event to its handler."""
        subscription_id = data_obj.get("id")
        notes = data_obj.get("notes") or {}

        if event_type == "subscription.activated":
            team_id = notes.get("team_id")
            if not team_id:
                logger.warning("subscription.activated missing team_id in notes")
                return {"warning": "missing team_id"}
            # Checkout creates the Razorpay subscription directly, so a local
            # subscription may not exist yet — upsert one from the plan.
            if not await self.get_subscription(team_id):
                plan_id = data_obj.get("plan_id")
                tier = next((t for t, pid in RAZORPAY_PLAN_IDS.items() if pid == plan_id), "startup")
                await self.create_subscription(team_id, tier, "monthly")
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
            current_end = data_obj.get("current_end")
            if current_end:
                try:
                    updates["current_period_end"] = datetime.fromtimestamp(int(current_end), tz=timezone.utc)
                except (TypeError, ValueError, OverflowError, OSError):
                    logger.warning(f"Invalid current_end in subscription.charged: {current_end!r}")
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
                credited = await self._credit_topup(order_id, payment_id, amount_paise)
                return {"order_id": order_id, "payment_id": payment_id, "credited": credited}
            return {"logged": True, "payment_id": payment_id}

        elif event_type == "payment.failed":
            return {"logged": True, "payment_id": data_obj.get("id")}

        else:
            logger.debug(f"Unhandled Razorpay webhook event type: {event_type}")
            return {"unhandled": True}

    # ── Webhook event log queries ────────────────────────────────────────────

    async def get_event_log(
        self,
        limit: int = 50,
        event_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[dict]:
        """Retrieve recent webhook event log entries for monitoring/audit."""
        filters = []
        if event_type:
            filters.append(("event_type", "==", event_type))
        if status:
            filters.append(("status", "==", status))
        events = await self.storage.query_documents(EVENT_LOG_COLLECTION, filters)
        events.sort(key=lambda e: e.get("received_at", ""), reverse=True)
        return events[:limit]

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

        # Automatically update price when tier is updated
        if "tier" in updates:
            tier = updates["tier"]
            billing_cycle = sub.get("billing_cycle", "monthly")
            pricing = TIER_PRICING.get(tier, TIER_PRICING["free"])
            price = pricing["price_monthly"] if billing_cycle == "monthly" else pricing["price_yearly"]
            updates["price"] = price

        await self.storage.update_document(self.COLLECTION, sub_id, updates)
        return True

    async def _credit_topup(self, order_id: str, payment_id: str, amount_paise: int) -> bool:
        """Credit the wallet for a verified Razorpay top-up (idempotent per payment).

        The stored order's ``amount_inr`` is the source of truth for credits;
        the payment's amount (in paise) is validated against the order's stored
        paise amount when both are present.
        """
        from app.services.credit_service import CreditService
        existing = await self.storage.query_documents(
            "credit_topup_payments",
            [("payment_id", "==", payment_id)],
        )
        if existing:
            return True
        orders = await self.storage.query_documents(
            "credit_topup_orders", [("order_id", "==", order_id)]
        )
        if not orders:
            logger.warning(f"No top-up order {order_id} for payment {payment_id}")
            return False
        order = orders[0]
        team_id = order.get("team_id")
        amount_inr = order.get("amount_inr") or 0
        if not team_id or amount_inr <= 0:
            logger.warning(f"Top-up order {order_id} is missing team_id/amount")
            return False
        stored_paise = order.get("amount_paise") or 0
        if stored_paise and amount_paise and stored_paise != amount_paise:
            logger.warning(
                f"Payment {payment_id} amount {amount_paise} does not match order {order_id} amount {stored_paise} — refusing credit"
            )
            return False
        await CreditService().add_credits(team_id, amount_inr, reason="razorpay_topup")
        await self.storage.create_document(
            "credit_topup_payments", generate_id(),
            {"order_id": order_id, "payment_id": payment_id, "credits": amount_inr, "processed_at": _utcnow()},
        )
        return True

    # ── Credit top-ups: Razorpay orders + signature verification ─────────────

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

    async def verify_payment_order(self, order_id: str, payment_id: str, signature: str, caller_id: Optional[str] = None) -> Dict[str, Any]:
        """Verify a Razorpay payment signature and credit the wallet once.

        ``caller_id`` (the authenticated user's uid) is checked against the
        order's owner when provided — prevents an authenticated user from
        verifying/flipping the status of an order that isn't theirs.
        """
        orders = await self.storage.query_documents("credit_topup_orders", [("order_id", "==", order_id)])
        if not orders:
            return {"error": "Unknown order"}
        order_owner = orders[0].get("team_id")
        if caller_id and order_owner and order_owner != caller_id:
            logger.warning(f"Credit order {order_id} owned by {order_owner} — denied for caller {caller_id}")
            return {"error": "Not authorized for this order"}

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

        credits = orders[0].get("amount_inr", 0)
        credited = await self._credit_topup(order_id, payment_id, orders[0].get("amount_paise", 0))
        if not credited:
            return {"error": "Could not credit wallet"}
        await self.storage.update_document("credit_topup_orders", order_id, {"status": "paid"})
        return {"credited": True, "credits": credits}

    @staticmethod
    def get_pricing():
        return TIER_PRICING
