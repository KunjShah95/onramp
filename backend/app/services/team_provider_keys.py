"""Per-team BYOK provider keys — encrypted at rest, org-scoped overrides.

Teams can supply their own LLM / embedding provider API keys from the
Developer Portal. Keys are encrypted with ``PII_ENCRYPTION_KEY`` (Fernet)
before storage, never returned to clients in plaintext, and — when present —
override the platform-level env var for that provider for the team's gateway
requests. The OpenAI-compatible gateway loads these via
:func:`get_team_keys_map` and passes them into the routers as request-scoped
overrides (falling back to the platform keys when a team has no key).

A team may also register *multiple* keys for the same provider (``key pool``
— e.g. several DeepSeek accounts to spread traffic / dodge per-key rate
limits). The router rotates round-robin across the pool; ``get_team_keys_map``
keeps returning the primary key so existing single-key callers are
unaffected.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.services.postgres_db import get_storage, generate_id
from app.services.field_encryption import encrypt_field, decrypt_field

logger = logging.getLogger("onramp.team_provider_keys")

# Providers that may be overridden per team, and the platform env var each
# replaces. Ollama is local (base URL, not an API key) — BYOK-able via
# OLLAMA_BASE_URL override. Custom/generic providers use OpenAI-compatible
# base_url + api_key.
SUPPORTED_PROVIDERS = {
    "openrouter": "OPENROUTER_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "groq": "GROQ_API_KEY",
    "nvidia": "NVIDIA_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "qwen": "QWEN_API_KEY",
    "zhipu": "ZHIPU_API_KEY",
    "moonshot": "MOONSHOT_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "huggingface": "HUGGINGFACE_API_KEY",
    "cohere": "COHERE_API_KEY",
    "voyage": "VOYAGE_API_KEY",
    "huggingface_inference": "HUGGINGFACE_API_KEY",
    "ollama": "OLLAMA_BASE_URL",
    "together": "TOGETHER_API_KEY",
    "fireworks": "FIREWORKS_API_KEY",
    "perplexity": "PERPLEXITY_API_KEY",
    "azure": "AZURE_OPENAI_API_KEY",
    "custom_openai": "CUSTOM_OPENAI_API_KEY",
}

COLLECTION = "team_provider_keys"

# Short-TTL in-memory cache for decrypted team keys. The gateway reads these on
# every request, and teams have at most a handful of keys — a 30s TTL avoids a
# DB round trip per gateway call while keeping rotation effective quickly.
_CACHE_TTL_SECONDS = 30.0
# team_id -> (expiry, (primary_map, pool_map, pool_ids_map))
_KEYS_CACHE: Dict[str, Tuple[float, Tuple[Dict[str, str], Dict[str, List[str]], Dict[str, List[str]]]]] = {}


def _invalidate_team_cache(team_id: str) -> None:
    """Drop a team's cached keys after a write."""
    _KEYS_CACHE.pop(team_id, None)


def is_supported_provider(provider: str) -> bool:
    """True when ``provider`` can be stored as a team BYOK key."""
    return provider in SUPPORTED_PROVIDERS


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _record_id(record: dict) -> str:
    return record.get("id") or record.get("_id") or ""


def _key_id(record: dict) -> str:
    """Stable id for one key slot (key_id preferred, falls back to doc id)."""
    return record.get("key_id") or _record_id(record)


def _masked(record: dict) -> dict:
    """Public metadata for a stored key — presence only, never the secret."""
    return {
        "provider": record.get("provider"),
        "key_id": _key_id(record),
        "configured": True,
        "env_var": SUPPORTED_PROVIDERS.get(record.get("provider")),
        "is_primary": bool(record.get("is_primary")),
        "updated_at": record.get("updated_at"),
        "updated_by": record.get("updated_by"),
    }


async def _load_team(team_id: str) -> Tuple[Dict[str, str], Dict[str, List[str]], Dict[str, List[str]]]:
    """Fetch all key records for a team once, returning
    ``(primary_map, pool_map, pool_ids_map)`` where each pool map's lists are
    aligned index-for-index — ``pool_ids[i]`` is the stable ``key_id`` of
    ``pool[i]`` — so route attribution can name the exact key that served a
    call. Cached for ``_CACHE_TTL_SECONDS``.
    """
    now = time.monotonic()
    cached = _KEYS_CACHE.get(team_id)
    if cached is not None and cached[0] > now:
        return (
            dict(cached[1][0]),
            {p: list(ks) for p, ks in cached[1][1].items()},
            {p: list(ks) for p, ks in cached[1][2].items()},
        )

    records = await get_storage().query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )
    primary: Dict[str, str] = {}
    pools: Dict[str, List[str]] = {}
    pool_ids: Dict[str, List[str]] = {}
    for record in records:
        provider = record.get("provider")
        encrypted = record.get("api_key_encrypted")
        if not provider or not encrypted:
            continue
        try:
            key = decrypt_field(encrypted)
        except Exception:
            logger.exception(
                "Failed to decrypt provider key %s for team %s", provider, team_id
            )
            continue
        pools.setdefault(provider, []).append(key)
        pool_ids.setdefault(provider, []).append(_key_id(record))
        if record.get("is_primary"):
            primary[provider] = key
    # Backfill: a provider with keys but no primary marker (legacy records)
    # uses its first key as the effective primary.
    for provider, keys in pools.items():
        if provider not in primary and keys:
            primary[provider] = keys[0]
    _KEYS_CACHE[team_id] = (now + _CACHE_TTL_SECONDS, (primary, pools, pool_ids))
    return (
        dict(primary),
        {p: list(ks) for p, ks in pools.items()},
        {p: list(ks) for p, ks in pool_ids.items()},
    )


async def list_team_keys(team_id: str) -> List[dict]:
    """Masked provider-key roster for a team (no secrets) — one entry per
    key slot, primary first."""
    records = await get_storage().query_documents(
        COLLECTION, [("team_id", "==", team_id)]
    )
    records.sort(
        key=lambda r: (not bool(r.get("is_primary")), r.get("created_at") or "")
    )
    return [_masked(r) for r in records]


async def get_team_keys_map(team_id: str) -> Dict[str, str]:
    """Decrypted ``{provider: primary_key}`` map for router overrides.

    Backward-compatible single-key view — the gateway passes this into the
    routers exactly as before; teams that registered pool keys additionally
    load :func:`get_team_key_pools` for round-robin selection. Best-effort:
    a single undecryptable key is skipped with a log instead of failing the
    whole request.
    """
    return (await _load_team(team_id))[0]


async def get_team_key_pools(team_id: str) -> Dict[str, List[str]]:
    """Decrypted ``{provider: [all keys, primary first]}`` map — the
    multi-key load-balancing view. Same cache as :func:`get_team_keys_map`."""
    return (await _load_team(team_id))[1]


async def get_team_key_pool(team_id: str, provider: str) -> List[str]:
    """All decrypted keys a team holds for one provider (primary first)."""
    return (await _load_team(team_id))[1].get(provider, [])


async def get_team_key_pool_ids(team_id: str) -> Dict[str, List[str]]:
    """Stable ``{provider: [key_id, ...]}`` map, aligned index-for-index with
    :func:`get_team_key_pools` — lets route records attribute a served call to
    the exact key slot that handled it (stable across pool edits, unlike a
    positional index). Same cache as the pool keys themselves."""
    return (await _load_team(team_id))[2]


def _validate(provider: str, api_key: str) -> Optional[dict]:
    """Shared validation for set/add — returns an error dict or None."""
    if not is_supported_provider(provider):
        return {
            "error": (
                f"Unsupported provider '{provider}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_PROVIDERS))}"
            )
        }
    if not api_key:
        return {"error": "api_key must not be empty"}
    return None


async def set_team_key(team_id: str, provider: str, api_key: str, user_id: str) -> dict:
    """Encrypt and upsert a team's *primary* key for a provider.

    Replaces the existing primary key in place (keeps one record, existing
    semantics) — use :func:`add_team_key` to append extra pool keys. Returns
    masked metadata.
    """
    provider = (provider or "").strip().lower()
    api_key = (api_key or "").strip()
    error = _validate(provider, api_key)
    if error:
        return error

    storage = get_storage()
    existing = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id), ("provider", "==", provider)]
    )
    encrypted = encrypt_field(api_key)
    if existing:
        primary = next((r for r in existing if r.get("is_primary")), existing[0])
        record_id = _record_id(primary)
        updated = await storage.update_document(
            COLLECTION,
            record_id,
            {"api_key_encrypted": encrypted, "updated_by": user_id},
        )
        _invalidate_team_cache(team_id)
        return _masked(updated or {**primary, "updated_by": user_id})

    key_id = generate_id()
    await storage.create_document(
        COLLECTION,
        generate_id(),
        {
            "team_id": team_id,
            "provider": provider,
            "key_id": key_id,
            "api_key_encrypted": encrypted,
            "is_primary": True,
            "created_by": user_id,
            "updated_by": user_id,
            "created_at": _utcnow(),
        },
    )
    _invalidate_team_cache(team_id)
    return _masked(
        {"provider": provider, "key_id": key_id, "is_primary": True, "updated_by": user_id}
    )


async def add_team_key(team_id: str, provider: str, api_key: str, user_id: str) -> dict:
    """Append an extra key to a team's pool for a provider (load balancing).

    The first key a team stores for a provider becomes the primary; every
    subsequent key is an additional slot the router rotates across. Returns
    the masked record including its ``key_id``.
    """
    provider = (provider or "").strip().lower()
    api_key = (api_key or "").strip()
    error = _validate(provider, api_key)
    if error:
        return error

    storage = get_storage()
    existing = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id), ("provider", "==", provider)]
    )
    record = {
        "team_id": team_id,
        "provider": provider,
        "key_id": generate_id(),
        "api_key_encrypted": encrypt_field(api_key),
        "is_primary": not existing,
        "created_by": user_id,
        "updated_by": user_id,
        "created_at": _utcnow(),
    }
    await storage.create_document(COLLECTION, generate_id(), record)
    _invalidate_team_cache(team_id)
    return _masked(record)


async def remove_team_key(team_id: str, provider: str, key_id: str) -> bool:
    """Remove one specific key slot from a provider's pool.

    Removing the primary promotes the oldest remaining key. Returns False
    when no key matched ``key_id``.
    """
    provider = (provider or "").strip().lower()
    if not key_id:
        return False
    storage = get_storage()
    existing = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id), ("provider", "==", provider)]
    )
    target = next((r for r in existing if _key_id(r) == key_id), None)
    if target is None:
        return False
    await storage.delete_document(COLLECTION, _record_id(target))
    if target.get("is_primary") and len(existing) > 1:
        remaining = [r for r in existing if _key_id(r) != key_id]
        remaining.sort(key=lambda r: r.get("created_at") or "")
        await storage.update_document(
            COLLECTION, _record_id(remaining[0]), {"is_primary": True}
        )
    _invalidate_team_cache(team_id)
    return True


async def delete_team_key(team_id: str, provider: str) -> bool:
    """Remove all of a team's BYOK keys for a provider. Returns False when
    none existed."""
    provider = (provider or "").strip().lower()
    storage = get_storage()
    existing = await storage.query_documents(
        COLLECTION, [("team_id", "==", team_id), ("provider", "==", provider)]
    )
    if not existing:
        return False
    for record in existing:
        await storage.delete_document(COLLECTION, _record_id(record))
    _invalidate_team_cache(team_id)
    return True
