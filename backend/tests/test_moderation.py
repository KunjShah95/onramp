"""Moderation / guardrails service — blocklist + optional OpenRouter hook.

Covers:
  - feature flag gating (off by default → zero cost).
  - blocklist detection with category attribution.
  - optional OpenRouter /moderations hook (mocked transport).
  - fail-open semantics: moderation infra problems never block traffic.
"""

import pytest

import httpx

from app.services.moderation import check_moderation, is_enabled

class _FakeResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


class _ModerationClient:
    """Returns a configurable /moderations result (or raises)."""

    def __init__(self, data=None, raise_on_post=False):
        self._data = data
        self._raise = raise_on_post
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, json=None, headers=None):
        self.calls.append((url, json))
        if self._raise:
            raise httpx.ConnectError("moderation down")
        return _FakeResponse(self._data)


def _flagged_result(categories):
    return {"results": [{"flagged": True, "categories": {c: True for c in categories}}]}


def _clean_result():
    return {"results": [{"flagged": False, "categories": {}}]}


class TestFeatureFlag:
    def test_disabled_by_default(self, monkeypatch):
        monkeypatch.delenv("ENABLE_MODERATION", raising=False)
        assert is_enabled() is False

    async def test_disabled_returns_pass_without_scanning(self, monkeypatch):
        monkeypatch.delenv("ENABLE_MODERATION", raising=False)
        verdict = await check_moderation("make a bomb")
        assert verdict["blocked"] is False
        assert verdict["source"] == "none"

    def test_enabled_flag(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        assert is_enabled() is True


class TestBlocklist:
    async def test_blocked_category(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        verdict = await check_moderation("how to make a pipe bomb step by step")
        assert verdict["blocked"] is True
        assert verdict["category"] == "weapons"
        assert verdict["source"] == "blocklist"
        assert verdict["flagged_categories"] == ["weapons"]

    async def test_clean_text_passes_blocklist(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        verdict = await check_moderation("How does the router pick a provider?")
        assert verdict["blocked"] is False
        assert verdict["source"] == "none"

    async def test_ordinary_code_not_flagged(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        code = "def make_request(url):\n    client = httpx.Client()\n    return client.get(url)"
        assert (await check_moderation(code))["blocked"] is False


class TestOpenRouterHook:
    async def test_flagged_by_api(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        monkeypatch.setenv("MODERATION_API", "true")
        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: _ModerationClient(_flagged_result(["hate"]))
        )
        verdict = await check_moderation("some flagged input", openrouter_key="sk-or")
        assert verdict["blocked"] is True
        assert verdict["source"] == "openrouter"
        assert verdict["flagged_categories"] == ["hate"]

    async def test_clean_passes_through_api(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        monkeypatch.setenv("MODERATION_API", "true")
        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: _ModerationClient(_clean_result())
        )
        verdict = await check_moderation("totally fine", openrouter_key="sk-or")
        assert verdict["blocked"] is False
        assert verdict["source"] == "openrouter"

    async def test_api_down_fails_open(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        monkeypatch.setenv("MODERATION_API", "true")
        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: _ModerationClient(raise_on_post=True)
        )
        verdict = await check_moderation("some input", openrouter_key="sk-or")
        assert verdict["blocked"] is False
        assert verdict["source"] == "none"

    async def test_hook_only_runs_when_api_flag_set(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        monkeypatch.delenv("MODERATION_API", raising=False)
        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: _ModerationClient(_flagged_result(["hate"]))
        )
        # Blocklist passes, hook skipped → source stays "none", not blocked.
        verdict = await check_moderation("plain text", openrouter_key="sk-or")
        assert verdict["blocked"] is False
        assert verdict["source"] == "none"

    async def test_blocklist_wins_before_api(self, monkeypatch):
        monkeypatch.setenv("ENABLE_MODERATION", "true")
        monkeypatch.setenv("MODERATION_API", "true")
        monkeypatch.setattr(
            httpx, "AsyncClient", lambda **kw: _ModerationClient(_clean_result())
        )
        verdict = await check_moderation("how to make a bomb", openrouter_key="sk-or")
        assert verdict["blocked"] is True
        assert verdict["source"] == "blocklist"
