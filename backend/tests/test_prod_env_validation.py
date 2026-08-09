"""Boot-time fail-fast validation (features_mvp.md 1.3): refuse to start with
ENV=production when required config is missing, instead of discovering it on
the first request.
"""
import logging

import pytest

from app.main import _validate_production_env

REQUIRED_VARS = (
    "DATABASE_URL", "STRIPE_WEBHOOK_SECRET", "GITHUB_TOKEN_ENCRYPTION_KEY",
    "REDIS_URL", "JWT_SECRET", "PII_ENCRYPTION_KEY",
    "API_KEY_HMAC_SECRET",
)
_ALL_ENV_KEYS = REQUIRED_VARS + (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "BACKEND_URL", "FRONTEND_URL",
)


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    for key in _ALL_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def _valid_fernet_key() -> str:
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()


def _set_all_required(monkeypatch, llm_key="OPENAI_API_KEY"):
    for var in REQUIRED_VARS:
        if var == "JWT_SECRET":
            # Must not equal the insecure default
            monkeypatch.setenv(var, "real-production-secret-xxxxxxxxxxxx")
        elif var == "DATABASE_URL":
            monkeypatch.setenv(var, "postgresql+asyncpg://user:pass@localhost:5432/onramp")
        elif var == "REDIS_URL":
            monkeypatch.setenv(var, "redis://localhost:6379/1")
        elif var in ("PII_ENCRYPTION_KEY", "GITHUB_TOKEN_ENCRYPTION_KEY"):
            monkeypatch.setenv(var, _valid_fernet_key())
        else:
            monkeypatch.setenv(var, "x")
    monkeypatch.setenv(llm_key, "sk-x")
    # Enable Stripe so STRIPE_WEBHOOK_SECRET is actually required (billing is
    # optional — without STRIPE_SECRET_KEY it runs in stub mode).
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")


def test_non_production_skips_validation(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    _validate_production_env()  # must not raise even with nothing set


def test_production_with_everything_set_passes(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    _set_all_required(monkeypatch)
    _validate_production_env()  # must not raise


@pytest.mark.parametrize("missing_var", REQUIRED_VARS)
def test_production_missing_one_required_var_fails(monkeypatch, missing_var):
    monkeypatch.setenv("ENV", "production")
    _set_all_required(monkeypatch)
    monkeypatch.delenv(missing_var, raising=False)

    with pytest.raises(RuntimeError, match=missing_var):
        _validate_production_env()


def test_production_without_any_llm_key_fails(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    for var in REQUIRED_VARS:
        if var == "DATABASE_URL":
            monkeypatch.setenv(var, "postgresql+asyncpg://user:pass@localhost:5432/onramp")
        elif var == "REDIS_URL":
            monkeypatch.setenv(var, "redis://localhost:6379/1")
        elif var in ("PII_ENCRYPTION_KEY", "GITHUB_TOKEN_ENCRYPTION_KEY"):
            monkeypatch.setenv(var, _valid_fernet_key())
        elif var != "JWT_SECRET":
            monkeypatch.setenv(var, "x")

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        _validate_production_env()


def test_production_without_stripe_config_does_not_require_webhook_secret(monkeypatch):
    """Billing is optional — a production deploy without Stripe needs no webhook secret."""
    monkeypatch.setenv("ENV", "production")
    _set_all_required(monkeypatch)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_STARTUP", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_PROFESSIONAL", raising=False)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)

    _validate_production_env()  # must not raise even with no Stripe webhook secret


def test_production_with_any_single_llm_key_passes(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    for var in REQUIRED_VARS:
        if var == "DATABASE_URL":
            monkeypatch.setenv(var, "postgresql+asyncpg://user:pass@localhost:5432/onramp")
        elif var == "REDIS_URL":
            monkeypatch.setenv(var, "redis://localhost:6379/1")
        elif var in ("PII_ENCRYPTION_KEY", "GITHUB_TOKEN_ENCRYPTION_KEY"):
            monkeypatch.setenv(var, _valid_fernet_key())
        else:
            monkeypatch.setenv(var, "x")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_x")

    _validate_production_env()  # must not raise


def test_production_warns_when_github_oauth_unconfigured(monkeypatch, caplog):
    """Missing GitHub OAuth creds are a boot warning, not a fatal error."""
    monkeypatch.setenv("ENV", "production")
    _set_all_required(monkeypatch)
    with caplog.at_level(logging.WARNING, logger="onramp.startup"):
        _validate_production_env()  # must not raise
    assert any("GITHUB_CLIENT_ID" in r.message for r in caplog.records)


def test_production_no_warning_when_github_oauth_configured(monkeypatch, caplog):
    """GitHub OAuth configured as a pair suppresses the unconfigured warning."""
    monkeypatch.setenv("ENV", "production")
    _set_all_required(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "Iv1.abc123")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "shh-secret")
    with caplog.at_level(logging.WARNING, logger="onramp.startup"):
        _validate_production_env()
    assert not any("GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET unset" in r.message for r in caplog.records)
