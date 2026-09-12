from app.services._shared import errors, cache_backend, tenant_settings, audit_store, integration_base


def test_shared_imports():
    assert errors.QuotaExceeded is not None
    assert hasattr(cache_backend, "MemoryBackend")
    assert hasattr(tenant_settings, "TenantScopedSettingStore")
    assert hasattr(audit_store, "AuditStore")
    assert hasattr(integration_base, "BaseIntegrationClient")


def test_make_key_sha256():
    k1 = cache_backend.make_key("a", "b")
    k2 = cache_backend.make_key("a", "b")
    assert k1 == k2
    assert len(k1) == 64


def test_errors_to_http_shape():
    exc = errors.QuotaExceeded("Monthly credit quota exceeded", details={"used": 1, "limit": 2, "tier": "free"})
    http_exc = errors.to_http(exc)
    assert http_exc.status_code == 429
    assert http_exc.detail["code"] == "QUOTA_EXCEEDED"


async def test_memory_backend_roundtrip():
    be = cache_backend.MemoryBackend()
    assert await be.get("missing") is None
    assert await be.set("k1", "v1") is True
    assert await be.get("k1") == "v1"
    await be.set("p:a", "1")
    await be.set("p:b", "2")
    assert await be.invalidate_prefix("p:") == 2


async def test_tenant_store_ttl_and_invalidate():
    store = tenant_settings.TenantScopedSettingStore(ttl_seconds=60)
    calls = {"n": 0}

    async def loader():
        calls["n"] += 1
        return {"v": 1}

    first = await store.get_or_load("t1", loader)
    second = await store.get_or_load("t1", loader)
    assert first == second
    assert calls["n"] == 1
    store.invalidate("t1")
    await store.get_or_load("t1", loader)
    assert calls["n"] == 2
