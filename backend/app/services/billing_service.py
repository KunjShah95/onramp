import os
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("codeflow.billing")

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


class BillingService:
    COLLECTION = "codeflow_subscriptions"

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
            "current_period_start": datetime.now().isoformat(),
            "current_period_end": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "created_at": datetime.now().isoformat(),
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

    async def handle_webhook(self, payload: bytes, sig_header: Optional[str]) -> Dict[str, Any]:
        """Verify and process a Stripe webhook event."""
        if not self.is_stripe_enabled():
            return {"error": "Stripe is not configured"}
        secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        stripe = self._stripe()

        try:
            if secret and sig_header:
                event = stripe.Webhook.construct_event(payload, sig_header, secret)
            else:
                import json
                event = json.loads(payload)
                logger.warning("Stripe webhook processed WITHOUT signature verification.")
        except Exception as exc:
            logger.warning(f"Stripe webhook verification failed: {exc}")
            return {"error": "Invalid webhook signature"}

        event_type = event["type"] if isinstance(event, dict) else event.type
        data_obj = (event["data"]["object"] if isinstance(event, dict) else event.data.object)

        if event_type == "checkout.session.completed":
            team_id = (data_obj.get("metadata") or {}).get("team_id") or data_obj.get("client_reference_id")
            if team_id:
                await self.attach_stripe(
                    team_id,
                    data_obj.get("customer"),
                    data_obj.get("subscription"),
                )

        elif event_type == "customer.subscription.updated":
            subscription_id = data_obj.get("id")
            if not subscription_id:
                logger.warning("customer.subscription.updated event missing subscription id")
                return {"received": True, "type": event_type, "warning": "missing subscription id"}
            status = data_obj.get("status")
            if not status:
                logger.warning(f"customer.subscription.updated event missing status for {subscription_id}")
                return {"received": True, "type": event_type, "warning": "missing status"}
            items = data_obj.get("items", {}).get("data", [])
            price_id = None
            if items:
                price_id = items[0].get("price", {}).get("id")
            tier = None
            for t, pid in STRIPE_PRICE_IDS.items():
                if pid == price_id:
                    tier = t
                    break
            cancel_at_period_end = data_obj.get("cancel_at_period_end", False)
            updates = {"status": "canceled" if cancel_at_period_end and status == "active" else status}
            if tier:
                updates["tier"] = tier
            await self._update_subscription_by_stripe_id(subscription_id, updates)

        elif event_type == "customer.subscription.deleted":
            subscription_id = data_obj.get("id")
            if subscription_id:
                await self._update_subscription_by_stripe_id(
                    subscription_id,
                    {"status": "canceled"},
                )

        elif event_type == "invoice.payment_succeeded":
            subscription_id = data_obj.get("subscription")
            period_end = data_obj.get("period_end")
            if subscription_id and period_end:
                await self._update_subscription_by_stripe_id(
                    subscription_id,
                    {"current_period_end": datetime.fromtimestamp(period_end).isoformat()},
                )

        elif event_type == "invoice.payment_failed":
            subscription_id = data_obj.get("subscription")
            if subscription_id:
                await self._update_subscription_by_stripe_id(
                    subscription_id,
                    {"status": "past_due"},
                )

        return {"received": True, "type": event_type}

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
        updates["updated_at"] = datetime.now().isoformat()
        await self.storage.update_document(self.COLLECTION, sub_id, updates)
        return True

    @staticmethod
    def get_pricing():
        return TIER_PRICING
