import os
import json
import pytest
import pytest_asyncio
import uuid

# Set env variables before importing BillingService
os.environ["STRIPE_SECRET_KEY"] = "sk_test_mock"
os.environ["STRIPE_WEBHOOK_SECRET"] = ""
os.environ["STRIPE_PRICE_STARTUP"] = "price_startup"
os.environ["STRIPE_PRICE_PROFESSIONAL"] = "price_professional"

from app.services.billing_service import BillingService, STRIPE_PRICE_IDS
from app.services.postgres_db import get_storage

@pytest_asyncio.fixture(autouse=True)
async def setup_stripe_prices():
    # Verify STRIPE_PRICE_IDS are set
    STRIPE_PRICE_IDS["startup"] = "price_startup"
    STRIPE_PRICE_IDS["professional"] = "price_professional"
    # Clear in-memory database
    storage = get_storage()
    if hasattr(storage, "_data"):
        for coll in list(storage._data.keys()):
            storage._data[coll].clear()

@pytest.mark.asyncio
async def test_checkout_session_completed():
    svc = BillingService()
    team_id = f"team-{uuid.uuid4()}"
    
    # 1. Create a local subscription first
    sub = await svc.create_subscription(team_id, "free", "monthly")
    assert sub["tier"] == "free"
    
    # 2. Prepare Stripe webhook payload for checkout.session.completed
    payload = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": team_id,
                "customer": "cus_test123",
                "subscription": "sub_test456",
                "metadata": {
                    "team_id": team_id,
                    "tier": "startup"
                }
            }
        }
    }
    
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    # 3. Process webhook
    result = await svc.handle_webhook(payload_bytes, sig_header=None)
    assert result["received"] is True
    assert result["type"] == "checkout.session.completed"
    
    # 4. Assert subscription attached Stripe IDs
    updated_sub = await svc.get_subscription(team_id)
    assert updated_sub is not None
    assert updated_sub["stripe_customer_id"] == "cus_test123"
    assert updated_sub["stripe_subscription_id"] == "sub_test456"

@pytest.mark.asyncio
async def test_customer_subscription_updated():
    svc = BillingService()
    team_id = f"team-{uuid.uuid4()}"
    
    # 1. Create local subscription and attach Stripe subscription ID
    await svc.create_subscription(team_id, "free", "monthly")
    await svc.attach_stripe(team_id, "cus_test123", "sub_test456")
    
    # 2. Payload for subscription updated to "startup"
    payload = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_test456",
                "status": "active",
                "cancel_at_period_end": False,
                "items": {
                    "data": [
                        {
                            "price": {
                                "id": "price_startup"
                            }
                        }
                    ]
                }
            }
        }
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    result = await svc.handle_webhook(payload_bytes, sig_header=None)
    assert result["received"] is True
    
    # 3. Assert updated tier
    updated_sub = await svc.get_subscription(team_id)
    assert updated_sub is not None
    assert updated_sub["tier"] == "startup"
    assert updated_sub["price"] == 49
    assert updated_sub["status"] == "active"

@pytest.mark.asyncio
async def test_customer_subscription_updated_cancel_at_period_end():
    svc = BillingService()
    team_id = f"team-{uuid.uuid4()}"
    
    await svc.create_subscription(team_id, "startup", "monthly")
    await svc.attach_stripe(team_id, "cus_test123", "sub_test456")
    
    # 2. Payload with cancel_at_period_end = True
    payload = {
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_test456",
                "status": "active",
                "cancel_at_period_end": True,
                "items": {
                    "data": [
                        {
                            "price": {
                                "id": "price_startup"
                            }
                        }
                    ]
                }
            }
        }
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    result = await svc.handle_webhook(payload_bytes, sig_header=None)
    assert result["received"] is True
    
    # 3. Assert status is canceled
    # Note: get_subscription filters by status == "active". If status is canceled, it returns None.
    # So we query storage directly
    storage = get_storage()
    subs = await storage.query_documents(svc.COLLECTION, [("team_id", "==", team_id)])
    assert len(subs) == 1
    assert subs[0]["status"] == "canceled"

@pytest.mark.asyncio
async def test_customer_subscription_deleted():
    svc = BillingService()
    team_id = f"team-{uuid.uuid4()}"
    
    await svc.create_subscription(team_id, "startup", "monthly")
    await svc.attach_stripe(team_id, "cus_test123", "sub_test456")
    
    payload = {
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_test456"
            }
        }
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    result = await svc.handle_webhook(payload_bytes, sig_header=None)
    assert result["received"] is True
    
    storage = get_storage()
    subs = await storage.query_documents(svc.COLLECTION, [("team_id", "==", team_id)])
    assert len(subs) == 1
    assert subs[0]["status"] == "canceled"

@pytest.mark.asyncio
async def test_invoice_payment_succeeded():
    svc = BillingService()
    team_id = f"team-{uuid.uuid4()}"
    
    await svc.create_subscription(team_id, "startup", "monthly")
    await svc.attach_stripe(team_id, "cus_test123", "sub_test456")
    
    payload = {
        "type": "invoice.payment_succeeded",
        "data": {
            "object": {
                "subscription": "sub_test456",
                "period_end": 1782000000
            }
        }
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    result = await svc.handle_webhook(payload_bytes, sig_header=None)
    assert result["received"] is True
    
    storage = get_storage()
    subs = await storage.query_documents(svc.COLLECTION, [("team_id", "==", team_id)])
    assert len(subs) == 1
    assert "current_period_end" in subs[0]
    assert subs[0]["current_period_end"] is not None

@pytest.mark.asyncio
async def test_invoice_payment_failed():
    svc = BillingService()
    team_id = f"team-{uuid.uuid4()}"
    
    await svc.create_subscription(team_id, "startup", "monthly")
    await svc.attach_stripe(team_id, "cus_test123", "sub_test456")
    
    payload = {
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "subscription": "sub_test456"
            }
        }
    }
    payload_bytes = json.dumps(payload).encode("utf-8")
    
    result = await svc.handle_webhook(payload_bytes, sig_header=None)
    assert result["received"] is True
    
    storage = get_storage()
    subs = await storage.query_documents(svc.COLLECTION, [("team_id", "==", team_id)])
    assert len(subs) == 1
    assert subs[0]["status"] == "past_due"
