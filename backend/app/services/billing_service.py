import os
import asyncio
import hashlib
import hmac
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
from app.services.postgres_db import get_storage, generate_id, idempotency_document_id

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
SELF_SERVICE_TIERS = {"free", "startup", "professional", "usage_based"}


# Razorpay subscription event → local subscription status mapping.
# Razorpay uses "cancelled" (double-l); the local status enum uses the
# Stripe-spelled "canceled" (single-l) — that asymmetry is intentional.
SUBSCRIPTION_STATUS_MAP = {
    "subscription.activated": "active",
    "subscription.charged": "active",
    "subscription.authenticated": "active",
    "subscription.resumed": "active",
    "subscription.cancelled": "canceled",
    "subscription.completed": "completed",
    "subscription.pending": "past_due",
    "subscription.halted": "past_due",
    "subscription.paused": "past_due",
}


# ── Idempotency ───────────────────────────────────────────────────────────────
IDEMPOTENCY_COLLECTION = "onramp_webhook_idempotency"
EVENT_LOG_COLLECTION = "onramp_webhook_events"
# A worker that dies mid-processing must not strand an event forever. A fresh
# processing claim remains in flight; an older one may be atomically reclaimed.
IDEMPOTENCY_CLAIM_TIMEOUT_SECONDS = 300


def _validate_subscription_tier(tier: str, *, internal: bool = False) -> dict:
    if tier not in TIER_PRICING:
        raise ValueError(f"Unknown subscription tier: {tier}")
    if not internal and tier not in SELF_SERVICE_TIERS:
        raise ValueError("Enterprise subscriptions require internal provisioning")
    return TIER_PRICING[tier]


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

    async def create_subscription(
        self,
        team_id: str,
        tier: str,
        billing_cycle: str = "monthly",
        *,
        verified_checkout: bool = False,
        internal: bool = False,
    ) -> Dict[str, Any]:
        """Create a local subscription record.

        Paid tiers start pending unless activation comes from a verified
        checkout webhook or an explicitly internal provisioning path. This
        keeps authenticated API callers from granting themselves paid access.
        """
        sub_id = generate_id()
        pricing = _validate_subscription_tier(tier, internal=internal)
        price = pricing["price_monthly"] if billing_cycle == "monthly" else pricing["price_yearly"]
        is_paid = any(int(value) > 0 for value in pricing.values() if isinstance(value, int))
        status = "active" if tier == "free" or internal or verified_checkout or not is_paid else "pending"

        sub = {
            "subscription_id": sub_id,
            "team_id": team_id,
            "tier": tier,
            "billing_cycle": billing_cycle,
            "price": price,
            "status": status,
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
        """Return the active subscription dict for a team, or None when none exists.

        Returned dict shape (documented contract)::

            {"subscription_id": str, "team_id": str, "tier": str,
             "billing_cycle": str, "price": int (INR), "status": "active",
             "current_period_start": datetime, "current_period_end": datetime|None,
             "razorpay_customer_id": str|None, "razorpay_subscription_id": str|None,
             "razorpay_payment_id": str|None, "created_at": datetime}

        ``None`` is the normal "no subscription" signal — never an error.
        Callers (API layer, ``backend/app/api/v1/billing.py``) translate
        None → HTTP 404 "No active subscription", so they must always check
        for None before dereferencing the result.
        """
        subs = await self.storage.query_documents(self.COLLECTION, [("team_id", "==", team_id), ("status", "==", "active")])
        return subs[0] if subs else None

    async def update_subscription(
        self,
        team_id: str,
        tier: str,
        *,
        verified_checkout: bool = False,
        internal: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Update tier/price without bypassing paid checkout activation.

        Returns ``None`` when no active subscription exists. A transition to a
        paid tier becomes pending unless it is an internal or verified-checkout
        operation.
        """
        sub = await self.get_subscription(team_id)
        if not sub:
            return None
        sub_id = sub.get("subscription_id", sub.get("id", ""))
        pricing = _validate_subscription_tier(tier, internal=internal)
        billing_cycle = sub.get("billing_cycle", "monthly")
        price = pricing["price_monthly"] if billing_cycle == "monthly" else pricing["price_yearly"]
        is_paid = any(int(value) > 0 for value in pricing.values() if isinstance(value, int))
        status = (
            "active"
            if tier == "free" or internal or verified_checkout or not is_paid
            else "pending"
        )

        await self.storage.update_document(self.COLLECTION, sub_id, {
            "tier": tier,
            "price": price,
            "status": status,
        })
        return {**sub, "tier": tier, "price": price, "status": status}

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
        if tier not in SELF_SERVICE_TIERS:
            return {"error": "Tier is not available for self-service checkout"}
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

        try:
            sub = await asyncio.to_thread(_create)
        except Exception as exc:
            logger.error("Razorpay checkout creation failed: %s", exc)
            _sentry_report(exc, {"team_id": team_id, "tier": tier})
            return {"error": "Checkout creation failed"}
        return {"url": sub.get("short_url"), "subscription_id": sub.get("id")}

    # ── Webhook processing ──────────────────────────────────────────────────

    async def _check_idempotency(self, idempotency_key: Optional[str]) -> bool:
        """Return True only when the key reached the terminal ``done`` state."""
        if not idempotency_key:
            return False
        rec = await self.storage.get_document(
            IDEMPOTENCY_COLLECTION, idempotency_document_id(idempotency_key)
        )
        if rec is not None:
            # Rows created before the status migration were all completed.
            return rec.get("status", "done") == "done"
        result = await self.storage.query_documents(
            IDEMPOTENCY_COLLECTION,
            [("idempotency_key", "==", idempotency_key)],
        )
        return bool(result and result[0].get("status", "done") == "done")

    @staticmethod
    def _idempotency_claim_is_stale(record: dict) -> bool:
        raw = record.get("processed_at")
        try:
            claimed_at = raw if isinstance(raw, datetime) else datetime.fromisoformat(str(raw))
            if claimed_at.tzinfo is None:
                claimed_at = claimed_at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return True
        return _utcnow() - claimed_at >= timedelta(
            seconds=IDEMPOTENCY_CLAIM_TIMEOUT_SECONDS
        )

    async def _claim_idempotency(
        self,
        idempotency_key: str,
        event_id: str,
        event_type: str,
        claim_token: Optional[str] = None,
    ) -> bool:
        """Atomically acquire a retryable webhook-processing claim."""
        document_id = idempotency_document_id(idempotency_key)
        claim_token = claim_token or generate_id()
        now = _utcnow()
        created = await self.storage.create_document_if_absent(
            IDEMPOTENCY_COLLECTION,
            document_id,
            {
                "idempotency_key": idempotency_key,
                "event_id": event_id,
                "event_type": event_type,
                "processed_at": now,
                "status": "processing",
                "claim_token": claim_token,
            },
        )
        if created:
            return True
        existing = await self.storage.get_document(
            IDEMPOTENCY_COLLECTION, document_id
        )

        if existing is None:
            result = await self.storage.query_documents(
                IDEMPOTENCY_COLLECTION,
                [("idempotency_key", "==", idempotency_key)],
            )
            existing = result[0] if result else None
        if existing is None:
            raise RuntimeError("Unable to create or recover webhook idempotency claim")

        status = existing.get("status", "done")
        if status == "done":
            return False
        if status == "failed":
            return await self.storage.claim_document(
                IDEMPOTENCY_COLLECTION,
                document_id,
                "status",
                "failed",
                {
                    "status": "processing",
                    "claim_token": claim_token,
                    "processed_at": now,
                },
            )
        if status == "processing":
            if not self._idempotency_claim_is_stale(existing):
                return False
            # Compare the lease token, not just status, so two simultaneous
            # stale-claim retries cannot both acquire the event.
            return await self.storage.claim_document(
                IDEMPOTENCY_COLLECTION,
                document_id,
                "claim_token",
                existing.get("claim_token"),
                {
                    "status": "processing",
                    "claim_token": claim_token,
                    "processed_at": now,
                },
            )
        return False

    async def _release_idempotency(
        self, dedupe_key: str, claim_token: str
    ) -> None:
        """Release only the claim token owned by this processing attempt."""
        try:
            await self.storage.claim_document(
                IDEMPOTENCY_COLLECTION,
                idempotency_document_id(dedupe_key),
                "claim_token",
                claim_token,
                {"status": "failed", "claim_token": None, "processed_at": _utcnow()},
            )
        except Exception:
            logger.exception("Failed to release webhook idempotency claim %s", dedupe_key)

    async def _record_idempotency(
        self, dedupe_key: str, claim_token: str
    ) -> None:
        """Mark the owned claim as terminal."""
        finalized = await self.storage.claim_document(
            IDEMPOTENCY_COLLECTION,
            idempotency_document_id(dedupe_key),
            "claim_token",
            claim_token,
            {"status": "done", "claim_token": None, "processed_at": _utcnow()},
        )
        if not finalized:
            raise RuntimeError("Webhook idempotency claim ownership was lost")

    async def _log_event(
        self, event_id: str, event_type: str, status: str, details: Optional[dict] = None
    ) -> None:
        """Persist or update the audit row for a provider event."""
        doc_id = event_id if (event_id and event_id != "evt_unknown") else generate_id()
        values = {
            "event_id": event_id,
            "event_type": event_type,
            "status": status,
            "details": details or {},
            "received_at": _utcnow(),
        }
        existing = await self.storage.get_document(EVENT_LOG_COLLECTION, doc_id)
        if existing is not None:
            await self.storage.update_document(EVENT_LOG_COLLECTION, doc_id, values)
            return
        await self.storage.create_document(EVENT_LOG_COLLECTION, doc_id, values)

    @staticmethod
    def verify_razorpay_webhook_signature(payload: bytes, sig_header: str, secret: str) -> bool:
        """Verify a Razorpay webhook signature with HMAC-SHA256 (no SDK needed).

        Razorpay scheme: ``HMAC_SHA256(payload_bytes, webhook_secret)``
        hex-encoded, compared against the ``X-Razorpay-Signature`` header
        with a constant-time comparison.
        """
        if not payload or not sig_header or not secret:
            return False
        expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, sig_header)

    async def _verify_and_parse_event(self, payload: bytes, sig_header: Optional[str]) -> Optional[dict]:
        """Verify Razorpay webhook signature and parse the event.

        Returns the parsed (normalized) event dict, or None if verification
        fails. A None return means "reject": the caller must return an error
        (HTTP 400) and perform NO state change. All rejections are logged at
        WARNING so signature attacks are visible.
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
            logger.warning("Razorpay webhook rejected: missing X-Razorpay-Signature header.")
            return None

        # Primary path: pure-HMAC verification of the Razorpay signature
        # scheme (no SDK dependency, deterministic in tests and production).
        if self.verify_razorpay_webhook_signature(payload, sig_header, secret):
            try:
                return self._normalize_event(json.loads(payload_text))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                logger.warning(f"Razorpay webhook had a valid signature but unparseable payload: {exc}")
                return None

        # Fallback: Razorpay SDK verification (same scheme; kept for
        # byte-encoding edge cases). Runs in a thread to avoid blocking.
        try:
            client = self._razorpay()
            verified = await asyncio.to_thread(
                client.utility.verify_webhook_signature,
                payload_text,
                sig_header,
                secret,
            )
            if not verified:
                logger.warning("Razorpay webhook signature verification failed (HMAC + SDK both reject).")
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
        claimed = False
        claim_token: Optional[str] = None
        if dedupe_key:
            claim_token = generate_id()
            claimed = await self._claim_idempotency(
                dedupe_key, event_id, event_type, claim_token=claim_token
            )
            if not claimed:
                logger.info(f"Duplicate webhook event {event_id} ({event_type}) — skipping (idempotency key {dedupe_key[:12]}...)")
                return {"received": True, "type": event_type, "duplicate": True}

        # 3. Process the event
        try:
            result = await self._process_event(event_type, data_obj)
        except Exception as exc:
            logger.error(f"Failed to process webhook event {event_id} ({event_type}): {exc}")
            _sentry_report(exc, {"event_id": event_id, "event_type": event_type})
            if dedupe_key and claimed and claim_token:
                await self._release_idempotency(dedupe_key, claim_token)
            try:
                await self._log_event(event_id, event_type, "failed", {"error": str(exc)})
            except Exception:
                logger.exception("Failed to log failed webhook event %s", event_id)
            return {"error": "Failed to process payment event"}

        # 4. Finalize the claim before acknowledging the provider delivery.
        if dedupe_key and claimed and claim_token:
            try:
                await self._record_idempotency(dedupe_key, claim_token)
            except Exception as exc:
                logger.error("Webhook %s processed but its claim could not be finalized: %s", event_id, exc)
                return {"error": "Failed to finalize webhook processing"}

        # 5. Log event for audit trail. A completed/duplicate delivery must still
        # be acknowledged if the non-authoritative audit write is unavailable.
        try:
            await self._log_event(event_id, event_type, "processed", result)
        except Exception:
            logger.exception("Failed to log processed webhook event %s", event_id)

        return {"received": True, "type": event_type}

    async def _process_event(self, event_type: str, data_obj: dict) -> dict:
        """Route a verified Razorpay webhook event to its handler.

        Simple subscription lifecycle events sync status via
        :data:`SUBSCRIPTION_STATUS_MAP` (activated→active,
        cancelled→canceled, completed→completed, pending/halted/paused→past_due,
        resumed/charged→active). ``subscription.activated`` and
        ``subscription.charged`` carry extra upsert/period logic below;
        payment events are handled separately.
        """
        subscription_id = data_obj.get("id")
        notes = data_obj.get("notes") or {}

        if event_type == "subscription.activated":
            team_id = notes.get("team_id")
            if not team_id:
                logger.warning("subscription.activated missing team_id in notes")
                return {"warning": "missing team_id"}
            # Checkout creates the Razorpay subscription directly, so a local
            # record may not exist. A direct API-created paid record may instead
            # exist as ``pending`` and must be activated by this verified event.
            local = await self.storage.query_documents(
                self.COLLECTION, [("team_id", "==", team_id)]
            )
            if local:
                local_id = local[0].get("subscription_id", local[0].get("id", ""))
                await self.storage.update_document(
                    self.COLLECTION,
                    local_id,
                    {
                        "status": "active",
                        "razorpay_customer_id": data_obj.get("customer_id"),
                        "razorpay_subscription_id": subscription_id,
                        "updated_at": _utcnow(),
                    },
                )
            else:
                plan_id = data_obj.get("plan_id")
                tier = next(
                    (t for t, pid in RAZORPAY_PLAN_IDS.items() if pid == plan_id),
                    "startup",
                )
                sub = await self.create_subscription(
                    team_id, tier, "monthly", verified_checkout=True
                )
                await self.storage.update_document(
                    self.COLLECTION,
                    sub["subscription_id"],
                    {
                        "razorpay_customer_id": data_obj.get("customer_id"),
                        "razorpay_subscription_id": subscription_id,
                    },
                )
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

        elif event_type in ("subscription.cancelled", "subscription.completed",
                              "subscription.pending", "subscription.halted",
                              "subscription.paused", "subscription.resumed"):
            # Status-only sync events — see SUBSCRIPTION_STATUS_MAP.
            if subscription_id:
                status = SUBSCRIPTION_STATUS_MAP[event_type]
                await self._update_subscription_by_razorpay_id(subscription_id, {"status": status})
                return {"subscription_id": subscription_id, "status": status}
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
            # Legacy rows have no status field and are already terminal. New
            # rows are not successful until their wallet credit is committed.
            marker = await self.storage.get_document(
                "credit_topup_payments", f"payment:{payment_id}"
            )
            return bool(marker and marker.get("status") == "done") if marker else True

        # Claim the payment before touching the wallet. The previous check-then-
        # credit-then-record sequence allowed two concurrent webhook/verify
        # requests to credit the same payment twice.
        marker_id = f"payment:{payment_id}"
        claimed = await self.storage.create_document_if_absent(
            "credit_topup_payments",
            marker_id,
            {
                "payment_id": payment_id,
                "order_id": order_id,
                "status": "processing",
                "created_at": _utcnow(),
            },
        )
        if not claimed:
            marker = await self.storage.get_document("credit_topup_payments", marker_id)
            return bool(marker and marker.get("status") == "done")

        async def _fail(reason: str) -> bool:
            await self.storage.update_document(
                "credit_topup_payments", marker_id,
                {"status": "failed", "error": reason, "failed_at": _utcnow()},
            )
            return False

        orders = await self.storage.query_documents(
            "credit_topup_orders", [("order_id", "==", order_id)]
        )
        if not orders:
            logger.warning(f"No top-up order {order_id} for payment {payment_id}")
            return await _fail("order not found")
        order = orders[0]
        wallet_scope = (
            order.get("wallet_scope")
            or order.get("owner_id")
            or order.get("team_id")
        )
        amount_inr = order.get("amount_inr") or 0
        if not wallet_scope or amount_inr <= 0:
            logger.warning(f"Top-up order {order_id} is missing wallet scope/amount")
            return await _fail("invalid order")
        stored_paise = order.get("amount_paise") or (int(amount_inr) * 100)
        if stored_paise != amount_paise:
            logger.warning(
                f"Payment {payment_id} amount {amount_paise} does not match order {order_id} amount {stored_paise} — refusing credit"
            )
            return await _fail("payment amount mismatch")
        try:
            await CreditService().add_credits(wallet_scope, amount_inr, reason="razorpay_topup")
        except Exception:
            # Leave a failed marker for reconciliation rather than allowing an
            # automatic retry to double-credit an already-credited wallet.
            await self.storage.update_document(
                "credit_topup_payments", marker_id,
                {"status": "failed", "error": "wallet credit failed", "failed_at": _utcnow()},
            )
            raise
        await self.storage.update_document(
            "credit_topup_payments", marker_id,
            {
                "status": "done",
                "credits": amount_inr,
                "wallet_scope": wallet_scope,
                "processed_at": _utcnow(),
            },
        )
        return True

    # ── Credit top-ups: Razorpay orders + signature verification ─────────────

    async def create_payment_order(
        self,
        wallet_scope: str,
        amount_inr: int,
        owner_id: Optional[str] = None,
    ) -> Dict[str, Any]:
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
                "notes": {"wallet_scope": wallet_scope, "owner_id": owner_id or wallet_scope, "topup": "1"},
            })

        try:
            order = await asyncio.to_thread(_create)
        except Exception as exc:
            logger.error("Razorpay order creation failed: %s", exc)
            _sentry_report(exc, {"wallet_scope": wallet_scope, "amount_inr": amount_inr})
            return {"error": "Payment order creation failed"}
        await self.storage.create_document(
            "credit_topup_orders", order.get("id"),
            {
                "order_id": order.get("id"),
                # Keep the historical field for compatibility, but explicit
                # ownership/wallet fields prevent user-vs-team scope confusion.
                "team_id": wallet_scope,
                "owner_id": owner_id or wallet_scope,
                "wallet_scope": wallet_scope,
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
        order = orders[0]
        wallet_scope = (
            order.get("wallet_scope")
            or order.get("owner_id")
            or order.get("team_id")
        )
        if caller_id and wallet_scope:
            owner_id = order.get("owner_id")
            authorized = str(caller_id) == str(owner_id or wallet_scope)
            if not authorized:
                from app.services.team_service import get_user_teams
                caller_teams = await get_user_teams(caller_id)
                caller_team_ids = {
                    str(t.get("team_id") or t.get("id")) for t in caller_teams or []
                }
                authorized = str(wallet_scope) in caller_team_ids
            if not authorized:
                logger.warning(
                    "Credit order %s owned by scope %s — denied for caller %s",
                    order_id,
                    wallet_scope,
                    caller_id,
                )
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

        # Fetch the actual captured payment amount from Razorpay and validate it
        # against the stored order amount before crediting. The payment signature
        # only binds order_id + payment_id, NOT the amount — a caller could pay a
        # different amount and still produce a valid signature, so passing the
        # stored order amount here would make _credit_topup's mismatch check
        # trivially pass. Fail closed when the payment can't be fetched.
        try:
            payment = await asyncio.to_thread(client.payment.fetch, payment_id)
            actual_amount_paise = int(payment.get("amount") or 0)
        except Exception as exc:
            logger.warning(f"Could not fetch payment {payment_id} to verify amount: {exc}")
            _sentry_report(exc, {"order_id": order_id, "payment_id": payment_id, "phase": "topup_amount_check"})
            return {"error": "Could not verify payment amount"}
        if actual_amount_paise <= 0:
            logger.warning(f"Payment {payment_id} has no captured amount — refusing credit")
            return {"error": "Could not verify payment amount"}
        # Only credit captured payments — mirrors the webhook path, which acts on
        # payment.captured (an authorized-but-uncaptured payment may still fail).
        if payment.get("status") != "captured":
            logger.warning(
                f"Payment {payment_id} is not captured (status={payment.get('status')}) — refusing credit"
            )
            return {"error": "Could not verify payment amount"}

        credits = orders[0].get("amount_inr", 0)
        credited = await self._credit_topup(order_id, payment_id, actual_amount_paise)
        if not credited:
            return {"error": "Could not credit wallet"}
        await self.storage.update_document("credit_topup_orders", order_id, {"status": "paid"})
        return {"credited": True, "credits": credits}

    @staticmethod
    def get_pricing():
        return TIER_PRICING
