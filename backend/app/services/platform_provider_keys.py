"""Platform-level provider keys — managed from the website instead of .env.

The LLM/embedding routers read their provider keys from environment variables
at boot. This service lets an admin configure the *same* keys from the Admin
Dashboard (owner role), stored encrypted at rest and pushed into the running
routers at startup and after every change — so deployments no longer need to
edit ``backend/.env`` to supply provider keys.

Precedence at call time (most specific wins):

    team BYOK key (Developer Portal) > platform key (Admin Dashboard) > env var

The store is a single global document in the ``platform_provider_keys``
collection (``DynamicDocument`` — generic JSONB, works on both storage
backends). Keys are Fernet-encrypted with ``PII_ENCRYPTION_KEY``; only masked
metadata is ever returned to clients.
"""

import logging
import time
from typing import Dict, List, Optional, Tuple

from app.services.postgres_db import get_storage
from app.services.field_encryption import encrypt_field, decrypt_field
from app.services.team_provider_keys import SUPPORTED_PROVIDERS, is_supported_provider

logger = logging.getLogger("onramp.platform_provider_keys")

COLLECTION = "platform_provider_keys"
DOC_ID = "global"

# Short-TTL in-memory cache for decrypted platform keys (mirrors the team-key
# service). Invalidated on writes so admin changes take effect immediately.
_CACHE_TTL_SECONDS = 30.0
_KEYS_CACHE: Dict[str, Tuple[float, Dict[str, str]]] = {}


def _invalidate_cache() -> None:
    _KEYS_CACHE.pop(DOC_ID, None)


def _masked(provider: str, record: Optional[dict]) -> dict:
    """Public metadata for a stored key — presence only, never the secret."""
    return {
        "provider": provider,
        "configured": True,
        "env_var": SUPPORTED_PROVIDERS.get(provider),
        "updated_at": (record or {}).get("updated_at"),
        "updated_by": (record or {}).get("updated_by"),
    }


async def _read_global_doc() -> Optional[dict]:
    return await get_storage().get_document(COLLECTION, DOC_ID)


async def get_platform_keys() -> Dict[str, str]:
    """Decrypted ``{provider: api_key}`` map for router overrides.

    Cached for ``_CACHE_TTL_SECONDS`` and invalidated on writes. Best-effort:
    an undecryptable key (e.g. after a Fernet key rotation) is skipped with a
    log instead of failing the whole request.
    """
    now = time.monotonic()
    cached = _KEYS_CACHE.get(DOC_ID)
    if cached is not None and cached[0] > now:
        return dict(cached[1])

    doc = await _read_global_doc()
    result: Dict[str, str] = {}
    for provider, encrypted in (doc or {}).get("provider_keys", {}).items():
        if not provider or not encrypted:
            continue
        try:
            result[provider] = decrypt_field(encrypted)
        except Exception:
            logger.exception("Failed to decrypt platform provider key %s", provider)
    _KEYS_CACHE[DOC_ID] = (now + _CACHE_TTL_SECONDS, result)
    return dict(result)


async def list_platform_keys() -> List[dict]:
    """Masked roster of configured platform keys (no secrets)."""
    doc = await _read_global_doc()
    keys = (doc or {}).get("provider_keys", {})
    return [
        _masked(provider, doc)
        for provider in sorted(keys)
    ]


async def set_platform_key(provider: str, api_key: str, user_id: str) -> dict:
    """Encrypt and store a platform key. Returns masked metadata."""
    provider = (provider or "").strip().lower()
    api_key = (api_key or "").strip()
    if not is_supported_provider(provider):
        return {
            "error": (
                f"Unsupported provider '{provider}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_PROVIDERS))}"
            )
        }
    if not api_key:
        return {"error": "api_key must not be empty"}

    storage = get_storage()
    doc = await _read_global_doc()
    keys: Dict[str, str] = dict((doc or {}).get("provider_keys", {}))
    keys[provider] = encrypt_field(api_key)

    if doc:
        # DynamicDocument replaces the whole JSONB on update — carry over the
        # audit fields (created_by) so they survive subsequent writes.
        updated = await storage.update_document(
            COLLECTION, DOC_ID,
            {
                "provider_keys": keys,
                "created_by": (doc or {}).get("created_by"),
                "updated_by": user_id,
            },
        )
    else:
        updated = await storage.create_document(
            COLLECTION, DOC_ID,
            {"provider_keys": keys, "created_by": user_id, "updated_by": user_id},
        )
    _invalidate_cache()
    return _masked(provider, updated)


async def delete_platform_key(provider: str) -> bool:
    """Remove a platform key. Returns False when none was configured."""
    provider = (provider or "").strip().lower()
    storage = get_storage()
    doc = await _read_global_doc()
    keys: Dict[str, str] = dict((doc or {}).get("provider_keys", {}))
    if provider not in keys:
        return False

    del keys[provider]
    if keys:
        await storage.update_document(
            COLLECTION, DOC_ID,
            {
                "provider_keys": keys,
                "created_by": (doc or {}).get("created_by"),
                "updated_by": None,
            },
        )
    else:
        await storage.delete_document(COLLECTION, DOC_ID)
    _invalidate_cache()
    return True


async def refresh_runtime_routers(app) -> Dict[str, str]:
    """Push the current platform keys into the running LLM + embedding routers.

    Called at startup (after the DB is ready) and after every admin write, so
    changes made on the website apply to the current worker immediately. In a
    multi-worker deployment each worker picks the keys up on its own boot or
    next admin write; the DB remains the source of truth.
    """
    keys = await get_platform_keys()
    llm = getattr(app.state, "llm", None)
    if llm is not None and hasattr(llm, "set_platform_keys"):
        llm.set_platform_keys(keys)
    embeddings = getattr(app.state, "embeddings", None)
    if embeddings is not None and hasattr(embeddings, "set_platform_keys"):
        embeddings.set_platform_keys(keys)
    return keys
