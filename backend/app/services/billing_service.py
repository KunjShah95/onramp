from typing import Dict, Any, Optional
from datetime import datetime
from app.services.postgres_db import get_storage, generate_id


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

    @staticmethod
    def get_pricing():
        return TIER_PRICING
