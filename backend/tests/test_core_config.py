import os

from app.core.config import get_settings, reset_settings


def test_settings_defaults_test_env(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    for key in (
        "JWT_ISSUER",
        "JWT_AUDIENCE",
        "JWT_ACCESS_EXPIRY_MINUTES",
        "JWT_REFRESH_EXPIRY_DAYS",
    ):
        monkeypatch.delenv(key, raising=False)
    reset_settings()
    try:
        s = get_settings()
        assert s.jwt_issuer == "onramp"
        assert s.jwt_audience == "onramp-api"
        assert s.jwt_access_expiry_minutes == 15
        assert s.jwt_refresh_expiry_days == 30
    finally:
        reset_settings()


def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("JWT_ISSUER", "custom-iss")
    reset_settings()
    try:
        assert get_settings().jwt_issuer == "custom-iss"
    finally:
        reset_settings()


def test_settings_cache_and_reset(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("JWT_ISSUER", "first")
    reset_settings()
    try:
        assert get_settings().jwt_issuer == "first"
        monkeypatch.setenv("JWT_ISSUER", "second")
        # Cached — still old value until reset
        assert get_settings().jwt_issuer == "first"
        reset_settings()
        assert get_settings().jwt_issuer == "second"
    finally:
        reset_settings()


def test_invalid_int_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("JWT_ACCESS_EXPIRY_MINUTES", "not-a-number")
    reset_settings()
    try:
        assert get_settings().jwt_access_expiry_minutes == 15
    finally:
        reset_settings()
