"""Platform provider keys (managed via the Admin Dashboard, not .env).

Covers:
  - Encrypted set/get round-trip with masked listing (secret never exposed).
  - Update/delete semantics and validation.
  - Router precedence: team BYOK key > platform key > env var.
  - Platform keys make providers available with no env config.
  - Admin endpoints: owner-RBAC, CRUD round-trip, masked responses.
  - refresh_runtime_routers pushes keys into the running LLM + embedding routers.
"""

import types

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.services.platform_provider_keys import (
    set_platform_key,
    get_platform_keys,
    list_platform_keys,
    delete_platform_key,
    refresh_runtime_routers,
)
from app.services.postgres_db import get_storage


@pytest.fixture(autouse=True)
async def _clean_platform_store():
    """Fresh global store + cache before every test (memory backend persists)."""
    storage = get_storage()
    doc = await storage.get_document("platform_provider_keys", "global")
    if doc:
        await storage.delete_document("platform_provider_keys", "global")
    from app.services import platform_provider_keys as svc

    svc._invalidate_cache()
    yield


# ── Service layer ──────────────────────────────────────────────────────────


class TestPlatformProviderKeyService:
    async def test_set_get_roundtrip_masks_secret(self):
        result = await set_platform_key("openai", "sk-platform-123", "u-admin")
        assert result["provider"] == "openai"
        assert result["configured"] is True
        assert "sk-platform" not in str(result)

        keys = await get_platform_keys()
        assert keys.get("openai") == "sk-platform-123"

        masked = await list_platform_keys()
        assert any(p["provider"] == "openai" and p["configured"] for p in masked)
        assert all("api_key" not in p for p in masked)
        assert "sk-platform" not in str(masked)

    async def test_update_replaces_and_delete(self):
        await set_platform_key("gemini", "v1", "u-1")
        await set_platform_key("gemini", "v2", "u-2")
        assert (await get_platform_keys()).get("gemini") == "v2"

        assert await delete_platform_key("gemini") is True
        assert await delete_platform_key("gemini") is False
        assert "gemini" not in await get_platform_keys()

    async def test_unsupported_and_empty_rejected(self):
        assert "error" in await set_platform_key("notaprovider", "k", "u-1")
        assert "error" in await set_platform_key("openai", "   ", "u-1")

    async def test_encrypted_at_rest(self):
        await set_platform_key("voyage", "super-secret-platform", "u-1")
        doc = await get_storage().get_document("platform_provider_keys", "global")
        stored = str((doc or {}).get("provider_keys", {}).get("voyage", ""))
        assert stored != "super-secret-platform"
        assert "super-secret-platform" not in stored

    async def test_refresh_runtime_routers_pushes_keys(self):
        await set_platform_key("groq", "sk-groq-platform", "u-1")
        from app.llm import LLMRouter
        from app.embeddings import EmbeddingRouter

        llm = LLMRouter()
        embeddings = EmbeddingRouter()
        app = types.SimpleNamespace(
            state=types.SimpleNamespace(llm=llm, embeddings=embeddings)
        )

        keys = await refresh_runtime_routers(app)
        assert keys.get("groq") == "sk-groq-platform"
        assert llm.platform_keys.get("groq") == "sk-groq-platform"
        assert embeddings.platform_keys.get("groq") == "sk-groq-platform"


# ── Router precedence ──────────────────────────────────────────────────────


def _clear_llm_keys(monkeypatch):
    for var in (
        "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "NVIDIA_API_KEY",
        "MISTRAL_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)


class TestRouterPrecedence:
    def _router(self, monkeypatch):
        _clear_llm_keys(monkeypatch)
        from app.llm import LLMRouter

        return LLMRouter()

    def test_platform_key_beats_env(self, monkeypatch):
        monkeypatch.setenv("GROQ_API_KEY", "sk-groq-env")
        router = self._router(monkeypatch)
        router.set_platform_keys({"groq": "sk-groq-platform"})
        from app.llm import ModelProvider

        assert router._effective_api_key(ModelProvider.GROQ) == "sk-groq-platform"

    def test_team_key_beats_platform_key(self, monkeypatch):
        router = self._router(monkeypatch)
        router.set_platform_keys({"openai": "sk-openai-platform"})
        from app.llm import ModelProvider

        assert router._effective_api_key(
            ModelProvider.OPENAI, provider_keys={"openai": "sk-openai-team"}
        ) == "sk-openai-team"

    def test_platform_key_makes_provider_available(self, monkeypatch):
        router = self._router(monkeypatch)
        # No keys at all → only local Ollama is routable.
        assert router.resolve_route(None)[0].value == "ollama"
        router.set_platform_keys({"anthropic": "sk-ant-platform"})
        chain = router.resolve_route(None)
        assert "anthropic" in [p.value for p in chain]
        # Requesting by provider name now resolves to the platform-keyed provider.
        assert router.provider_chain(model="anthropic")[0].value == "anthropic"

    async def test_completion_uses_platform_key(self, monkeypatch):
        from app.llm import LLMRouter

        router = self._router(monkeypatch)
        router.set_platform_keys({"openai": "sk-openai-platform"})
        captured = {}

        async def fake_call(self_, provider, config, prompt, system, max_tokens):
            captured["api_key"] = config["api_key"]
            captured["provider"] = provider.value
            return "ok"

        monkeypatch.setattr(LLMRouter, "_call_openai_sdk", fake_call)
        await router.openai_chat("hi")
        assert captured["provider"] == "openai"
        assert captured["api_key"] == "sk-openai-platform"


class TestEmbeddingPlatformKeys:
    def _router(self, monkeypatch):
        for var in (
            "OPENAI_API_KEY", "GEMINI_API_KEY", "NVIDIA_API_KEY",
            "COHERE_API_KEY", "VOYAGE_API_KEY", "OLLAMA_BASE_URL",
        ):
            monkeypatch.delenv(var, raising=False)
        from app.embeddings import EmbeddingRouter

        monkeypatch.setattr(
            EmbeddingRouter, "_hf_installed", staticmethod(lambda: False)
        )
        return EmbeddingRouter()

    async def test_platform_key_used_for_embed(self, monkeypatch):
        from app.embeddings import EmbeddingRouter

        router = self._router(monkeypatch)
        router.set_platform_keys({"openai": "sk-embed-platform"})
        captured = {}

        async def fake(self_, provider, config, texts):
            captured["api_key"] = config["api_key"]
            captured["provider"] = provider.value
            return [[0.1] * 4]

        monkeypatch.setattr(EmbeddingRouter, "_call_openai_sdk", fake)
        vectors, provider, route = await router.embed_batch(["hi"])
        assert provider.value == "openai"
        assert captured["api_key"] == "sk-embed-platform"
        assert len(vectors) == 1

    async def test_team_key_still_wins_for_embeddings(self, monkeypatch):
        from app.embeddings import EmbeddingRouter

        router = self._router(monkeypatch)
        router.set_platform_keys({"nvidia": "sk-nvidia-platform"})
        captured = {}

        async def fake(self_, provider, config, texts):
            captured["api_key"] = config["api_key"]
            return [[0.1] * 4]

        monkeypatch.setattr(EmbeddingRouter, "_call_openai_sdk", fake)
        await router.embed_batch(
            ["hi"], provider_keys={"nvidia": "sk-nvidia-team"}
        )
        assert captured["api_key"] == "sk-nvidia-team"


# ── Admin endpoints ────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"
ADMIN_UID = "u-admin-owner"


@pytest.fixture(autouse=True)
def _mock_owner(monkeypatch):
    from app.api.v1 import admin

    async def _teams_for_user(uid):
        return [{"id": "acme", "team_id": "acme", "role": "admin"}]

    monkeypatch.setattr(admin, "get_user_teams", _teams_for_user)


def _app():
    from app.api.v1 import admin

    application = FastAPI()

    @application.middleware("http")
    async def _set_user(request, call_next):
        request.state.user = {
            "uid": ADMIN_UID,
            "email": "owner@test.com",
            "name": "Owner",
        }
        return await call_next(request)

    application.include_router(admin.router, prefix=API_PREFIX)
    return application


@pytest.fixture
def client():
    return TestClient(_app())


class TestAdminProviderKeyEndpoints:
    def test_set_list_delete_roundtrip(self, client):
        r = client.put(
            f"{API_PREFIX}/admin/ai/provider-keys/openai",
            json={"api_key": "sk-admin-1"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["provider"] == "openai"
        assert "api_key" not in body
        assert "sk-admin" not in r.text

        r = client.get(f"{API_PREFIX}/admin/ai/provider-keys")
        assert r.status_code == 200
        providers = r.json()["providers"]
        assert any(p["provider"] == "openai" and p["configured"] for p in providers)
        assert "sk-admin" not in r.text

        r = client.delete(f"{API_PREFIX}/admin/ai/provider-keys/openai")
        assert r.status_code == 200
        r = client.get(f"{API_PREFIX}/admin/ai/provider-keys")
        assert all(p["provider"] != "openai" for p in r.json()["providers"])

    def test_unsupported_provider_400(self, client):
        r = client.put(
            f"{API_PREFIX}/admin/ai/provider-keys/notaprovider", json={"api_key": "k"}
        )
        assert r.status_code == 400

    def test_empty_key_400(self, client):
        r = client.put(
            f"{API_PREFIX}/admin/ai/provider-keys/openai", json={"api_key": ""}
        )
        assert r.status_code == 400

    def test_delete_missing_404(self, client):
        r = client.delete(f"{API_PREFIX}/admin/ai/provider-keys/openai")
        assert r.status_code == 404

    def test_non_owner_403(self, client, monkeypatch):
        from app.api.v1 import admin

        async def _member_teams(uid):
            return [{"id": "acme", "team_id": "acme", "role": "member"}]

        monkeypatch.setattr(admin, "get_user_teams", _member_teams)
        r = client.get(f"{API_PREFIX}/admin/ai/provider-keys")
        assert r.status_code == 403
