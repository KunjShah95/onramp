"""Field-level encryption for PII data at rest.

Uses Fernet (symmetric authenticated encryption). All PII fields are encrypted
before storage and decrypted on read. A deterministic hash (email_hash) is stored
alongside encrypted email for lookup purposes while keeping the actual email
encrypted at rest.

Env:
    PII_ENCRYPTION_KEY: Fernet-compatible key (base64-urlsafe-32-bytes).
        Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import hashlib
import logging
import os
from typing import Optional
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


def _get_fernet() -> Optional[Fernet]:
    key = os.getenv("PII_ENCRYPTION_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
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
    f = _get_fernet()
    if f is None:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        logger.exception("Failed to decrypt PII field — key may have changed")
        return ciphertext


def email_hash(email: str) -> str:
    return hashlib.sha256(email.lower().strip().encode()).hexdigest()
