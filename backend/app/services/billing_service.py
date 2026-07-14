import os
import asyncio
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.billing")

# Stripe Price IDs per tier (set in env when using real Stripe billing).
STRIPE_PRICE_IDS = {
    "startup": os.getenv("STRIPE_PRICE_STARTUP"),
    "professional": os.getenv("STRIPE_PRICE_PROFESSIONAL"),
}


TIER_PRICING = {
    "free": {"price_monthly": 0, "price_yearly": 0, "features": ["1 member", "1 repo", "50 credits/mo"]},
    "startup": {"price_monthly": 49, "price_yearly": 499, "features": ["5 members", "10 repos", "5000 credits/mo"]},
    "professional": {"price_monthly": 299, "price_yearly": 2999, "features": ["20 members", "50 repos", "50000 credits/mo"]},
    "enterprise": {"price_monthly": 0, "price_yearly": 0, "features": ["Custom", "Unlimited", "Dedicated support"]},
}


# ── Idempotency ───────────────────────────────────────────────────────────────
IDEMPOTENCY_COLLECTION = "onramp_webhook_idempotency"
EVENT_LOG_COLLECTION = "onramp_webhook_events"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


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
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
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

    async def attach_stripe(self, team_id: str, stripe_customer_id: str, stripe_subscription_id: str) -> bool:
        sub = await self.get_subscription(team_id)
        if not sub:
            return False
        sub_id = sub.get("subscription_id", sub.get("id", ""))
        await self.storage.update_document(self.COLLECTION, sub_id, {
            "stripe_customer_id": stripe_customer_id,
            "stripe_subscription_id": stripe_subscription_id,
        })
        return True

    # ── Stripe integration (optional, guarded by STRIPE_SECRET_KEY) ──────────

    @staticmethod
    def is_stripe_enabled() -> bool:
        return bool(os.getenv("STRIPE_SECRET_KEY"))

    @staticmethod
    def _stripe():
        """Lazily import and configure the Stripe SDK."""
        import stripe
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
        return stripe

    async def create_checkout_session(
        self, team_id: str, tier: str, success_url: str, cancel_url: str
    ) -> Dict[str, Any]:
        """Create a Stripe Checkout session for a paid tier. Returns {url}."""
        if not self.is_stripe_enabled():
            return {"error": "Stripe is not configured", "stub": True}
        price_id = STRIPE_PRICE_IDS.get(tier)
        if not price_id:
            return {"error": f"No Stripe price configured for tier '{tier}'"}

        stripe = self._stripe()

        def _create():
            return stripe.checkout.Session.create(
                mode="subscription",
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=success_url,
                cancel_url=cancel_url,
                client_reference_id=team_id,
                metadata={"team_id": team_id, "tier": tier},
            )

        session = await asyncio.to_thread(_create)
        return {"url": session.url, "session_id": session.id}

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
        """Verify Stripe webhook signature and parse the event.

        Returns the parsed event dict, or None if verification fails.
        Runs the sync Stripe SDK call in a thread to avoid blocking.
        """
        secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        stripe = self._stripe()

        if not secret and not sig_header:
            env = os.getenv("ENV", "development").lower()
            allow_unverified = os.getenv("ALLOW_UNVERIFIED_STRIPE", "false").lower() == "true"
            if env == "production":
                logger.error("STRIPE_WEBHOOK_SECRET is required in production — refusing unverified webhook.")
                return None
            if not allow_unverified:
                logger.error(
                    "Stripe webhook secret not set and ALLOW_UNVERIFIED_STRIPE is not true. "
                    "Set ALLOW_UNVERIFIED_STRIPE=true to process without verification (dev only)."
                )
                return None
            logger.warning("Stripe webhook processed WITHOUT signature verification (ALLOW_UNVERIFIED_STRIPE=true, dev mode).")
            return json.loads(payload)

        if not secret:
            logger.error("STRIPE_WEBHOOK_SECRET not set — cannot verify webhook signatures.")
            return None

        if not sig_header:
            logger.error("Missing Stripe-Signature header.")
            return None

        try:
            event = await asyncio.to_thread(
                stripe.Webhook.construct_event,
                payload,
                sig_header,
                secret,
            )
            # Normalise to dict for consistent processing
            return {
                "id": event.id,
                "type": event.type,
                "data": {"object": dict(event.data.object)},
                "created": event.created,
                "account": event.account,
            }
        except Exception as exc:
            logger.warning(f"Stripe webhook signature verification failed: {exc}")
            _sentry_report(exc, {"phase": "webhook_verify"})
            return None

    async def handle_webhook(
        self,
        payload: bytes,
        sig_header: Optional[str],
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Verify and process a Stripe webhook event with idempotency."""
        if not self.is_stripe_enabled():
            return {"error": "Stripe is not configured"}

        # 1. Parse and verify
        event = await self._verify_and_parse_event(payload, sig_header)
        if event is None:
            return {"error": "Invalid webhook signature"}

        event_id = event.get("id", "evt_unknown")
        event_type = event.get("type", "unknown")
        data_obj = event.get("data", {}).get("object", {})

        # 2. Idempotency check — skip if already processed
        if idempotency_key:
            already_processed = await self._check_idempotency(idempotency_key)
            if already_processed:
                logger.info(f"Duplicate webhook event {event_id} ({event_type}) — skipping (idempotency key {idempotency_key[:12]}...)")
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
        if idempotency_key:
            await self._record_idempotency(idempotency_key, event_id, event_type)

        # 5. Log event for audit trail
        await self._log_event(event_id, event_type, "processed", result)

        return {"received": True, "type": event_type}

    async def _process_event(self, event_type: str, data_obj: dict) -> dict:
        """Route a verified webhook event to its handler. Returns a result summary."""

        if event_type == "checkout.session.completed":
            team_id = (data_obj.get("metadata") or {}).get("team_id") or data_obj.get("client_reference_id")
            if not team_id:
                logger.warning("checkout.session.completed missing team_id")
                return {"warning": "missing team_id"}
            await self.attach_stripe(
                team_id,
                data_obj.get("customer"),
                data_obj.get("subscription"),
            )
            return {"team_id": team_id, "customer": data_obj.get("customer"), "subscription": data_obj.get("subscription")}

        elif event_type == "customer.subscription.updated":
            subscription_id = data_obj.get("id")
            if not subscription_id:
                return {"warning": "missing subscription id"}
            status = data_obj.get("status")
            if not status:
                return {"warning": f"missing status for {subscription_id}"}
            items = data_obj.get("items", {}).get("data", [])
            price_id = items[0].get("price", {}).get("id") if items else None
            tier = next((t for t, pid in STRIPE_PRICE_IDS.items() if pid == price_id), None)
            cancel_at_period_end = data_obj.get("cancel_at_period_end", False)
            updates: dict = {"status": "canceled" if cancel_at_period_end and status == "active" else status}
            if tier:
                updates["tier"] = tier
            await self._update_subscription_by_stripe_id(subscription_id, updates)
            return {"subscription_id": subscription_id, "status": updates["status"], "tier": tier}

        elif event_type == "customer.subscription.deleted":
            subscription_id = data_obj.get("id")
            if subscription_id:
                await self._update_subscription_by_stripe_id(subscription_id, {"status": "canceled"})
                return {"subscription_id": subscription_id, "status": "canceled"}
            return {"warning": "missing subscription id"}

        elif event_type == "customer.subscription.trial_will_end":
            subscription_id = data_obj.get("id")
            trial_end = data_obj.get("trial_end")
            if subscription_id and trial_end:
                logger.info(f"Trial ending soon for subscription {subscription_id}: ends at {trial_end}")
                return {"subscription_id": subscription_id, "trial_end": trial_end}
            return {"warning": "missing subscription id or trial_end"}

        elif event_type == "invoice.payment_succeeded":
            subscription_id = data_obj.get("subscription")
            period_end = data_obj.get("period_end")
            if subscription_id and period_end:
                await self._update_subscription_by_stripe_id(
                    subscription_id,
                    {"current_period_end": datetime.fromtimestamp(period_end, tz=timezone.utc).isoformat()},
                )
                return {"subscription_id": subscription_id, "period_end": period_end}
            return {"warning": "missing subscription id or period_end"}

        elif event_type == "invoice.payment_failed":
            subscription_id = data_obj.get("subscription")
            if subscription_id:
                await self._update_subscription_by_stripe_id(subscription_id, {"status": "past_due"})
                return {"subscription_id": subscription_id, "status": "past_due"}
            return {"warning": "missing subscription id"}

        elif event_type in ("payment_intent.succeeded", "payment_intent.payment_failed"):
            # Log for monitoring; no local state changes needed
            return {"logged": True, "amount": data_obj.get("amount"), "currency": data_obj.get("currency")}

        elif event_type == "setup_intent.created":
            return {"logged": True}

        else:
            logger.debug(f"Unhandled Stripe webhook event type: {event_type}")
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

    async def _update_subscription_by_stripe_id(self, stripe_subscription_id: str, updates: dict) -> bool:
        subs = await self.storage.query_documents(
            self.COLLECTION,
            [("stripe_subscription_id", "==", stripe_subscription_id)],
        )
        if not subs:
            logger.warning(f"No local subscription for Stripe ID {stripe_subscription_id}")
            return False
        if len(subs) > 1:
            logger.warning(f"Found {len(subs)} subscriptions for Stripe ID {stripe_subscription_id}, using first")
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

    @staticmethod
    def get_pricing():
        return TIER_PRICING
