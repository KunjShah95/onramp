"""API key pepper versioning tests.

Covers:
  - New keys record ``permissions.pepper_version`` at creation.
  - New keys validate against the current configured pepper.
  - Pre-versioning keys (hashed with the dev-default pepper, no version tag)
    keep validating via the legacy fallback during the rotation window.
  - ``API_KEY_ALLOW_LEGACY_PEPPER=false`` disables the fallback.
  - ``rehash_existing_keys`` reports current vs legacy classification.
"""

import pytest

from app.services import api_key_service as aks
from app.services.postgres_db import get_storage

TEST_UID = "u-pepper-test"
CURRENT_SECRET = "test-current-pepper-secret-32chars-min"


@pytest.fixture(autouse=True)
def _rotate_pepper(monkeypatch):
    """Simulate the production pepper rotation: env secret differs from the
    dev-default pepper legacy keys were hashed with."""
    monkeypatch.setenv("API_KEY_HMAC_SECRET", CURRENT_SECRET)
    monkeypatch.delenv("API_KEY_ALLOW_LEGACY_PEPPER", raising=False)


async def test_new_key_stores_pepper_version():
    plain, record = await aks.create_api_key(name="fresh", user_id=TEST_UID)
    perms = record.get("permissions") or {}
    assert perms.get("pepper_version") == aks.CURRENT_PEPPER_VERSION


async def test_new_key_validates_with_current_pepper():
    plain, _ = await aks.create_api_key(name="fresh", user_id=TEST_UID)
    rec = await aks.validate_api_key(plain)
    assert rec is not None
    assert (rec.get("permissions") or {}).get("pepper_version") == aks.CURRENT_PEPPER_VERSION


async def test_legacy_key_validates_via_fallback():
    """A key hashed with the dev-default pepper (no pepper_version) still
    authenticates after the pepper rotation, via the legacy fallback."""
    storage = get_storage()
    legacy_hash = aks._hash_with_pepper("cf_legacy_plaintext_key", aks._DEV_DEFAULT_PEPPER)
    await storage.create_document("api_keys", "key-legacy-1", {
        "key_hash": legacy_hash,
        "name": "legacy",
        "user_id": TEST_UID,
        "is_active": True,
        "permissions": {},
    })

    rec = await aks.validate_api_key("cf_legacy_plaintext_key")
    assert rec is not None
    assert rec["id"] == "key-legacy-1"


async def test_legacy_key_fails_when_fallback_disabled(monkeypatch):
    monkeypatch.setenv("API_KEY_ALLOW_LEGACY_PEPPER", "false")
    storage = get_storage()
    legacy_hash = aks._hash_with_pepper("cf_legacy_plaintext_key", aks._DEV_DEFAULT_PEPPER)
    await storage.create_document("api_keys", "key-legacy-2", {
        "key_hash": legacy_hash,
        "name": "legacy",
        "user_id": TEST_UID,
        "is_active": True,
        "permissions": {},
    })

    assert await aks.validate_api_key("cf_legacy_plaintext_key") is None


async def test_unknown_key_rejected():
    await aks.create_api_key(name="fresh", user_id=TEST_UID)
    assert await aks.validate_api_key("cf_nonexistent_key") is None


async def test_rehash_existing_keys_classifies_current_vs_legacy():
    storage = get_storage()

    # One current-pepper key (versioned)
    await aks.create_api_key(name="current", user_id=TEST_UID)
    # One legacy key (unversioned, dev-default pepper)
    legacy_hash = aks._hash_with_pepper("cf_legacy_plaintext_key", aks._DEV_DEFAULT_PEPPER)
    await storage.create_document("api_keys", "key-legacy-3", {
        "key_hash": legacy_hash,
        "name": "legacy",
        "user_id": TEST_UID,
        "is_active": True,
        "permissions": {},
    })
    # One revoked legacy key
    await storage.create_document("api_keys", "key-legacy-4", {
        "key_hash": legacy_hash,
        "name": "revoked",
        "user_id": TEST_UID,
        "is_active": False,
        "permissions": {},
    })

    result = await aks.rehash_existing_keys()
    assert result["total_keys"] == 3
    assert result["active_keys"] == 2
    assert result["keys_on_current_pepper"] == 1
    assert result["legacy_keys"] == 2
