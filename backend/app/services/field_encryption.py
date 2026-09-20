"""Field-level encryption for PII data at rest.

Uses Fernet (symmetric authenticated encryption). All PII fields are encrypted
before storage and decrypted on read. A deterministic hash (email_hash) is stored
alongside encrypted email for lookup purposes while keeping the actual email
encrypted at rest.

Supports key rotation via PII_ENCRYPTION_KEY (current) and PII_ENCRYPTION_KEY_PREV
(previous key for migration). On rotation:
  1. Set PII_ENCRYPTION_KEY_PREV = old PII_ENCRYPTION_KEY
  2. Set PII_ENCRYPTION_KEY = new key
  3. Run migration script to re-encrypt existing data (or rely on lazy re-encryption on read)

Env:
    PII_ENCRYPTION_KEY: Current Fernet-compatible key (base64-urlsafe-32-bytes).
        Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    PII_ENCRYPTION_KEY_PREV: Previous key for decrypting legacy data during rotation.
"""

import hashlib
import logging
import os
from typing import Optional, List
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _get_fernet_keys() -> List[Fernet]:
    """Get all valid Fernet keys in order: current first, then previous keys.
    
    Returns a list of Fernet instances for multi-key decryption support during rotation.
    """
    keys = []
    
    # Current key (required in production)
    current = os.getenv("PII_ENCRYPTION_KEY")
    if current:
        try:
            keys.append(Fernet(current.encode() if isinstance(current, str) else current))
        except Exception:
            logger.exception("Invalid PII_ENCRYPTION_KEY format")
    
    # Previous key(s) for rotation migration
    prev = os.getenv("PII_ENCRYPTION_KEY_PREV")
    if prev:
        try:
            keys.append(Fernet(prev.encode() if isinstance(prev, str) else prev))
        except Exception:
            logger.exception("Invalid PII_ENCRYPTION_KEY_PREV format")
    
    # Additional legacy keys could be added here as PII_ENCRYPTION_KEY_PREV2, etc.
    
    return keys


def _get_fernet() -> Optional[Fernet]:
    """Get the current Fernet instance for encryption (backward compat)."""
    current = os.getenv("PII_ENCRYPTION_KEY")
    if not current:
        return None
    try:
        return Fernet(current.encode() if isinstance(current, str) else current)
    except Exception:
        logger.exception("Invalid PII_ENCRYPTION_KEY format")
        return None


def encrypt_field(plaintext: str) -> str:
    f = _get_fernet()
    if f is None:
        env = os.getenv("ENV", "development").lower()
        if env == "production":
            raise RuntimeError(
                "PII_ENCRYPTION_KEY must be set in production — "
                "refusing to store PII in plaintext."
            )
        logger.warning("PII_ENCRYPTION_KEY not set — storing PII in plaintext (dev only)")
        return plaintext
    return f.encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str) -> str:
    """Strict decrypt using multi-key fallback for rotation support.
    
    Tries current key first, then previous keys. Raises on failure so caller
    can handle rotation explicitly (write paths must use strict decrypt).
    """
    fernet_keys = _get_fernet_keys()
    if not fernet_keys:
        return ciphertext
    
    last_error = None
    for f in fernet_keys:
        try:
            return f.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            last_error = "InvalidToken"
            continue
        except Exception as e:
            last_error = str(e)
            continue
    
    logger.exception("Failed to decrypt PII field with all available keys — key rotation mismatch or corrupted data")
    raise ValueError(f"Failed to decrypt PII field — encryption key mismatch or corrupted data (last error: {last_error})")


def decrypt_field_lenient(ciphertext: str | None, fallback: str | None = None) -> str | None:
    """Best-effort decrypt for read/display paths.

    Returns the decrypted value, or the original plaintext when the value was
    never encrypted (legacy/dev rows seeded without encryption, e.g. tests that
    write ``{\"name\": \"Alice\"}`` directly via storage). Never raises — falls
    back to ``fallback if fallback is not None else ciphertext`` so a single
    legacy row can't crash a whole list endpoint (get_team_members, ramp
    summaries, review-ops boards).

    Write paths must keep using strict :func:`decrypt_field` so key rotation
    is surfaced explicitly instead of silently double-encrypting.
    """
    if not ciphertext:
        return ciphertext if fallback is None else fallback
    try:
        return decrypt_field(ciphertext)
    except Exception:
        logger.warning(
            "decrypt_field_lenient: returning plaintext fallback for undecryptable value"
        )
        return fallback if fallback is not None else ciphertext


def reencrypt_field(ciphertext: str) -> str:
    """Re-encrypt a field with the current key (for migration scripts).
    
    Decrypts using multi-key fallback and re-encrypts with current key.
    Returns the newly encrypted value, or the original if decryption fails.
    """
    try:
        plaintext = decrypt_field(ciphertext)
        return encrypt_field(plaintext)
    except Exception:
        logger.warning("Failed to re-encrypt field, keeping original")
        return ciphertext


def _normalize_email(email: str) -> str:
    return email.lower().strip()


def _email_hash_secret() -> bytes:
    """Pepper for the keyed email hash.

    Prefers a dedicated secret, falls back to the PII key then the JWT
    secret (both required in production already). Dev/test use an insecure
    constant so local rows stay comparable — never in production.
    """
    secret = (
        os.getenv("EMAIL_HASH_SECRET")
        or os.getenv("PII_ENCRYPTION_KEY")
        or os.getenv("JWT_SECRET")
    )
    if not secret:
        if os.getenv("ENV", "development").lower() == "production":
            raise RuntimeError("EMAIL_HASH_SECRET (or PII_ENCRYPTION_KEY) must be set in production")
        secret = "dev-email-hash-pepper"
    return secret.encode() if isinstance(secret, str) else secret


def email_hash(email: str) -> str:
    """Keyed (HMAC-SHA256) deterministic hash for email lookups.

    Replaces the legacy unkeyed SHA-256 (see :func:`email_hash_legacy`),
    which allowed offline dictionary enumeration of the ``email_hash``
    column. Normalization (lowercase + strip) is unchanged.
    """
    import hmac as _hmac

    return _hmac.new(
        _email_hash_secret(), _normalize_email(email).encode(), hashlib.sha256
    ).hexdigest()


def email_hash_legacy(email: str) -> str:
    """Pre-HMAC email hash (unkeyed SHA-256). Lookup fallback only."""
    return hashlib.sha256(_normalize_email(email).encode()).hexdigest()


def email_hash_candidates(email: str) -> list[str]:
    """All hashes a stored row may carry — new first, legacy second (deduped)."""
    new, old = email_hash(email), email_hash_legacy(email)
    return [new] if new == old else [new, old]
