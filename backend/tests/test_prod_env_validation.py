"""Boot-time fail-fast validation (features_mvp.md 1.3): refuse to start with
ENV=production when required config is missing, instead of discovering it on
the first request.
"""
import pytest

from app.main import _validate_production_env

REQUIRED_VARS = ("DATABASE_URL", "STRIPE_WEBHOOK_SECRET", "GITHUB_TOKEN_ENCRYPTION_KEY", "REDIS_URL")
_ALL_ENV_KEYS = REQUIRED_VARS + (
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
)


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    for key in _ALL_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def _set_all_required(monkeypatch, llm_key="OPENAI_API_KEY"):
    for var in REQUIRED_VARS:
        monkeypatch.setenv(var, "x")
    monkeypatch.setenv(llm_key, "sk-x")


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
        monkeypatch.setenv(var, "x")

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        _validate_production_env()


def test_production_with_any_single_llm_key_passes(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    for var in REQUIRED_VARS:
        monkeypatch.setenv(var, "x")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_x")

    _validate_production_env()  # must not raise
