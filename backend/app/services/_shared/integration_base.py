"""BaseIntegrationClient — shared httpx + HMAC + config helpers."""
from __future__ import annotations
import hashlib
import hmac
from typing import Optional
import httpx


class BaseIntegrationClient:
    provider: str = "base"

    @staticmethod
    def build_client(
        base_url: str,
        *,
        headers=None,
        auth=None,
        timeout: float = 15.0,
    ) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers or {"Accept": "application/json", "Content-Type": "application/json"},
            auth=auth,
            timeout=timeout,
        )

    @staticmethod
    async def get_config(user_id: str, provider: str) -> Optional[dict]:
        from app.services.webhook_service import get_integration_config
        cfg = await get_integration_config(user_id, provider)
        if not cfg:
            return None
        return cfg.get("config", {})

    @staticmethod
    def verify_hmac(raw_body: bytes, signature: str, secret: str, *, digestmod=hashlib.sha256) -> bool:
        if not signature or not secret:
            return False
        expected = hmac.new(secret.encode(), raw_body, digestmod).hexdigest()
        return hmac.compare_digest(expected, signature)
