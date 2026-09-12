import pytest

from app.core import security
from app.core.config import reset_settings


def test_password_roundtrip():
    hashed = security.hash_password("s3cret-pw")
    assert hashed != "s3cret-pw"
    assert security.verify_password("s3cret-pw", hashed) is True
    assert security.verify_password("wrong", hashed) is False


def test_password_verify_bad_hash_returns_false():
    assert security.verify_password("x", "not-a-valid-hash") is False


def test_jwt_roundtrip(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "test-secret-min-32-chars-1234567890")
    reset_settings()
    try:
        token = security.create_access_token("u1", "a@b.c", "Ann", "password")
        payload = security.decode_access_token(token)
        assert payload is not None
        assert payload["uid"] == "u1"
        assert payload["iss"] == "onramp"
        assert payload["aud"] == "onramp-api"
    finally:
        reset_settings()


def test_jwt_invalid_returns_none(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "test-secret-min-32-chars-1234567890")
    reset_settings()
    try:
        assert security.decode_access_token("garbage.token.here") is None
    finally:
        reset_settings()


def test_weak_secret_rejected_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "dev-jwt-secret-change-in-production")
    reset_settings()
    try:
        with pytest.raises(RuntimeError):
            security.get_jwt_secret()
    finally:
        reset_settings()


def test_refresh_token_hash_is_stable_hex(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "test-secret-min-32-chars-1234567890")
    reset_settings()
    try:
        token = security.generate_refresh_token()
        hashed = security.hash_refresh_token(token)
        assert len(hashed) == 64
        assert security.hash_refresh_token(token) == hashed
    finally:
        reset_settings()
