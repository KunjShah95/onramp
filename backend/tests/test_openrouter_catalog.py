"""Dynamic OpenRouter catalog service — normalize + fetch with mocked transport.

Covers:
  - normalize_model: pricing parsing, free detection, malformed entries.
  - fetch_catalog: caching, best-effort failure (→ stale or []), never raises.
"""

import pytest

import httpx

from app.services.openrouter_catalog import (
    normalize_model,
    fetch_catalog,
    invalidate_cache,
)

SAMPLE_PAID = {
    "id": "deepseek/deepseek-r1",
    "name": "DeepSeek R1",
    "context_length": 163840,
    "pricing": {"prompt": "0.55", "completion": "2.19", "request": "0", "image": "0"},
}

SAMPLE_FREE = {
    "id": "google/gemini-2.5-flash:free",
    "name": "Gemini 2.5 Flash",
    "context_length": 1048576,
    "pricing": {"prompt": "0", "completion": "0", "request": "0", "image": "0"},
}


class _FakeResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


class _FakeClient:
    def __init__(self, data):
        self._data = data

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None):
        return _FakeResponse(self._data)


class _RaisingClient:
    """Client whose get() explodes — exercises the fail-open path."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None):
        raise httpx.ConnectError("boom")


@pytest.fixture(autouse=True)
def _clean_cache():
    invalidate_cache()
    yield
    invalidate_cache()


class TestNormalizeModel:
    def test_paid_model(self):
        m = normalize_model(SAMPLE_PAID)
        assert m["id"] == "deepseek/deepseek-r1"
        assert m["free"] is False
        assert m["pricing"] == {"prompt": 0.55, "completion": 2.19}
        assert m["context_length"] == 163840
        assert m["vendor"] == "deepseek"

    def test_free_suffix_model(self):
        m = normalize_model(SAMPLE_FREE)
        assert m["free"] is True
        assert m["pricing"]["prompt"] == 0.0

    def test_missing_id_returns_none(self):
        assert normalize_model({}) is None
        assert normalize_model({"name": "no id"}) is None

    def test_bad_pricing_falls_back_zero(self):
        m = normalize_model({"id": "x/y", "pricing": {"prompt": "NaN", "completion": "nope"}})
        assert m["pricing"] == {"prompt": 0.0, "completion": 0.0}
        assert m["free"] is True  # zero rate card reads as free

    def test_malformed_context_length_does_not_crash(self):
        m = normalize_model({"id": "x/y", "context_length": "not-a-number", "pricing": {}})
        assert m["context_length"] == 0

    async def test_bad_entry_skipped_not_whole_catalog(self, monkeypatch):
        monkeypatch.setattr(
            httpx, "AsyncClient",
            lambda **kw: _FakeClient({"data": [
                {"id": None},  # malformed — skipped by normalize
                SAMPLE_PAID,
                {"id": "x/y", "context_length": "garbage", "pricing": {}},
            ]}),
        )
        models = await fetch_catalog()
        assert [m["id"] for m in models] == ["deepseek/deepseek-r1", "x/y"]
        assert models[1]["context_length"] == 0


class TestFetchCatalog:
    async def test_fetch_returns_normalized_catalog(self, monkeypatch):
        monkeypatch.setattr(
            httpx, "AsyncClient",
            lambda **kw: _FakeClient({"data": [SAMPLE_PAID, SAMPLE_FREE]}),
        )
        models = await fetch_catalog()
        assert [m["id"] for m in models] == [
            "deepseek/deepseek-r1", "google/gemini-2.5-flash:free",
        ]

    async def test_cache_serves_without_second_fetch(self, monkeypatch):
        calls = {"n": 0}

        def factory(**kw):
            calls["n"] += 1
            return _FakeClient({"data": [SAMPLE_PAID]})

        monkeypatch.setattr(httpx, "AsyncClient", factory)
        await fetch_catalog()
        await fetch_catalog()
        assert calls["n"] == 1

    async def test_failure_returns_empty(self, monkeypatch):
        monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: _RaisingClient())
        assert await fetch_catalog() == []

    async def test_failure_serves_stale_cache(self, monkeypatch):
        monkeypatch.setattr(
            httpx, "AsyncClient",
            lambda **kw: _FakeClient({"data": [SAMPLE_PAID]}),
        )
        assert len(await fetch_catalog()) == 1
        monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: _RaisingClient())
        # Transient failure now returns the previously cached catalog.
        models = await fetch_catalog()
        assert [m["id"] for m in models] == ["deepseek/deepseek-r1"]

    async def test_no_key_still_works(self, monkeypatch):
        monkeypatch.setattr(
            httpx, "AsyncClient",
            lambda **kw: _FakeClient({"data": [SAMPLE_FREE]}),
        )
        assert len(await fetch_catalog(api_key="sk-openrouter")) == 1
