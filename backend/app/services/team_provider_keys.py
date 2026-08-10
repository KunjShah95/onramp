"""Per-team BYOK provider keys — encrypted at rest, org-scoped overrides.

Teams can supply their own LLM / embedding provider API keys from the
Developer Portal. Keys are encrypted with ``PII_ENCRYPTION_KEY`` (Fernet)
before storage, never returned to clients in plaintext, and — when present —
override the platform-level env var for that provider for the team's gateway
requests. The OpenAI-compatible gateway loads these via
:func:`get_team_keys_map` and passes them into the routers as request-scoped
overrides (falling back to the platform keys when a team has no key).
"""

import logging
import time
from typing import Dict, List, Tuple

from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import encrypt_field, decrypt_field

logger = logging.getLogger("onramp.team_provider_keys")

# Providers that may be overridden per team, and the platform env var each
# replaces. Ollama is local (base URL, not an API key) so it is not BYOK-able.
SUPPORTED_PROVIDERS = {
    "openrouter": "OPENROUTER_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "groq": "GROQ_API_KEY",
    "nvidia": "NVIDIA_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "huggingface": "HUGGINGFACE_API_KEY",
    "cohere": "COHERE_API_KEY",
    "voyage": "VOYAGE_API_KEY",
    "huggingface_inference": "HUGGINGFACE_API_KEY",
}

COLLECTION = "team_provider_keys"

# Short-TTL in-memory cache for decrypted team keys. The gateway reads these on
# every request, and teams have at most a handful of keys — a 30s TTL avoids a
# DB round trip per gateway call while keeping rotation effective quickly.
_CACHE_TTL_SECONDS = 30.0
_KEYS_CACHE: Dict[str, Tuple[float, Dict[str, str]]] = {}


def _invalidate_team_cache(team_id: str) -> None:
    """Drop a team's cached keys after a write."""
    _KEYS_CACHE.pop(team_id, None)


def is_supported_provider(provider: str) -> bool:
    """True when ``provider`` can be stored as a team BYOK key."""
    return provider in SUPPORTED_PROVIDERS


def _masked(record: dict) -> dict:
    """Public metadata for a stored key — presence only, never the secret."""
    return {
        "provider": record.get("provider"),
        "configured": True,
        "env_var": SUPPORTED_PROVIDERS.get(record.get("provider")),
        "updated_at": record.get("updated_at"),
        "updated_by": record.get("updated_by"),
    }


async def list_team_keys(team_id: str) -> List[dict]:
    """Masked provider-key roster for a team (no secrets)."""
    records = await get_storage().query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )
    return [_masked(r) for r in records]


async def get_team_keys_map(team_id: str) -> Dict[str, str]:
    """Decrypted ``{provider: api_key}`` map for router overrides.

    Cached per team for ``_CACHE_TTL_SECONDS`` and invalidated on writes, so
    the gateway's per-request reads stay cheap. Best-effort: a single
    undecryptable key (e.g. after a key rotation) is skipped with a log
    instead of failing the whole request.
    """
    now = time.monotonic()
    cached = _KEYS_CACHE.get(team_id)
    if cached is not None and cached[0] > now:
        return dict(cached[1])

    records = await get_storage().query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )
    result: Dict[str, str] = {}
    for record in records:
        provider = record.get("provider")
        encrypted = record.get("api_key_encrypted")
        if not provider or not encrypted:
            continue
        try:
            result[provider] = decrypt_field(encrypted)
        except Exception:
            logger.exception(
                "Failed to decrypt provider key %s for team %s", provider, team_id
            )
    _KEYS_CACHE[team_id] = (now + _CACHE_TTL_SECONDS, result)
    return dict(result)


async def set_team_key(team_id: str, provider: str, api_key: str, user_id: str) -> dict:
    """Encrypt and upsert a team's provider key. Returns masked metadata."""
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
    existing = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id), ("provider", "==", provider)]
    )
    encrypted = encrypt_field(api_key)
    if existing:
        record_id = existing[0].get("id") or existing[0].get("_id")
        updated = await storage.update_document(
            COLLECTION,
            record_id,
            {"api_key_encrypted": encrypted, "updated_by": user_id},
        )
        _invalidate_team_cache(team_id)
        return _masked(updated or {**existing[0], "updated_by": user_id})

    await storage.create_document(
        COLLECTION,
        generate_id(),
        {
            "team_id": team_id,
            "provider": provider,
            "api_key_encrypted": encrypted,
            "created_by": user_id,
            "updated_by": user_id,
        },
    )
    return _masked({"provider": provider, "updated_by": user_id})


async def delete_team_key(team_id: str, provider: str) -> bool:
    """Remove a team's BYOK key. Returns False when none existed."""
    provider = (provider or "").strip().lower()
    storage = get_storage()
    existing = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id), ("provider", "==", provider)]
    )
    if not existing:
        return False
    record_id = existing[0].get("id") or existing[0].get("_id")
    await storage.delete_document(COLLECTION, record_id)
    _invalidate_team_cache(team_id)
    return True
