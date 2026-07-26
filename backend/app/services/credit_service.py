"""Prepaid credit wallet for usage-based billing.

The tiered plans (free/startup/professional) meter against a fixed monthly
credit allowance. The ``usage_based`` tier instead draws down a prepaid wallet:
customers top up a credit balance and each AI query deducts its credit cost.
This module owns the wallet balance and an append-only ledger.

Wallets and ledger entries live in flexible ``DynamicDocument`` collections
(JSONB), so timestamps are stored as ISO strings and every update writes the
full document (partial updates replace the JSONB payload).
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.credits")

WALLETS = "credit_wallets"
LEDGER = "credit_ledger"


class InsufficientCreditsError(Exception):
    """Raised when a wallet lacks the credits to cover a charge."""

    def __init__(self, scope: str, balance: int, required: int):
        self.scope = scope
        self.balance = balance
        self.required = required
        super().__init__(
            f"Insufficient credits for {scope}: balance {balance}, required {required}"
        )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CreditService:
    def __init__(self):
        self.storage = get_storage()

    async def get_balance(self, scope: str) -> int:
        wallet = await self._get_wallet(scope)
        return int(wallet.get("balance", 0))

    async def get_wallet(self, scope: str) -> Dict[str, Any]:
        """Public wallet view (balance + lifetime totals)."""
        return await self._get_wallet(scope)

    async def add_credits(
        self, scope: str, amount: int, reason: str = "topup"
    ) -> Dict[str, Any]:
        """Top up a wallet. Returns the updated wallet."""
        if amount <= 0:
            raise ValueError("Top-up amount must be positive")
        wallet = await self._get_wallet(scope)
        wallet["balance"] = int(wallet.get("balance", 0)) + amount
        wallet["lifetime_purchased"] = int(wallet.get("lifetime_purchased", 0)) + amount
        await self._save_wallet(scope, wallet)
        await self._ledger_entry(scope, amount, wallet["balance"], reason, action="topup")
        return wallet

    async def deduct(self, scope: str, amount: int, action: str = "query") -> Dict[str, Any]:
        """Charge a wallet for a query. Raises InsufficientCreditsError if the
        balance can't cover the charge (leaving the balance untouched)."""
        if amount < 0:
            raise ValueError("Deduction amount cannot be negative")
        wallet = await self._get_wallet(scope)
        balance = int(wallet.get("balance", 0))
        if balance < amount:
            raise InsufficientCreditsError(scope, balance, amount)
        wallet["balance"] = balance - amount
        wallet["lifetime_spent"] = int(wallet.get("lifetime_spent", 0)) + amount
        await self._save_wallet(scope, wallet)
        await self._ledger_entry(scope, -amount, wallet["balance"], f"charge:{action}", action=action)
        return wallet

    async def get_ledger(self, scope: str, limit: int = 50) -> List[Dict[str, Any]]:
        rows = await self.storage.query_documents(LEDGER, [("scope", "==", scope)])
        entries = [self._flatten(r) for r in rows]
        entries.sort(key=lambda e: str(e.get("created_at", "")), reverse=True)
        return entries[:limit]

    # ── Internal ────────────────────────────────────────────────────────────

    async def _get_wallet(self, scope: str) -> Dict[str, Any]:
        row = await self.storage.get_document(WALLETS, scope)
        if row:
            return self._flatten(row)
        return {
            "scope": scope,
            "balance": 0,
            "lifetime_purchased": 0,
            "lifetime_spent": 0,
            "created_at": _now_iso(),
        }

    async def _save_wallet(self, scope: str, wallet: Dict[str, Any]) -> None:
        wallet["scope"] = scope
        wallet["updated_at"] = _now_iso()
        wallet.pop("id", None)
        wallet.pop("collection", None)
        existing = await self.storage.get_document(WALLETS, scope)
        if existing:
            await self.storage.update_document(WALLETS, scope, wallet)
        else:
            wallet.setdefault("created_at", _now_iso())
            await self.storage.create_document(WALLETS, scope, wallet)

    async def _ledger_entry(
        self, scope: str, delta: int, balance_after: int, reason: str, action: str
    ) -> None:
        entry_id = generate_id()
        await self.storage.create_document(LEDGER, entry_id, {
            "entry_id": entry_id,
            "scope": scope,
            "delta": delta,
            "balance_after": balance_after,
            "reason": reason,
            "action": action,
            "created_at": _now_iso(),
        })

    @staticmethod
    def _flatten(row: Dict[str, Any]) -> Dict[str, Any]:
        if row is None:
            return {}
        if isinstance(row.get("data"), dict):
            merged = {**row["data"]}
            merged.setdefault("id", row.get("id"))
            return merged
        return row
