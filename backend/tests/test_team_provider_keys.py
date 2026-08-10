"""Per-team BYOK provider keys — service, router overrides, and endpoints.

Covers:
  - Encrypted set/get round-trip with masked listing (raw key never exposed).
  - Upsert semantics (replacing a key keeps one record).
  - Provider/key validation, delete behavior.
  - LLMRouter + EmbeddingRouter honoring request-scoped ``provider_keys``
    overrides (availability + the actual key passed to the SDK).
  - HTTP endpoints: set/list/delete under key-manager RBAC.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.team_provider_keys import (
    SUPPORTED_PROVIDERS,
    set_team_key,
    get_team_keys_map,
    list_team_keys,
    delete_team_key,
    is_supported_provider,
)
from app.services.postgres_db import get_storage


# ── Service layer ──────────────────────────────────────────────────────────


class TestTeamProviderKeyService:
    async def test_set_get_roundtrip_masks_secret(self):
        team = "byok-r1"
        result = await set_team_key(team, "openai", "sk-team-openai-123", "u-1")
        assert result["provider"] == "openai"
        assert result["configured"] is True
        assert "sk-team" not in str(result)

        keys = await get_team_keys_map(team)
        assert keys == {"openai": "sk-team-openai-123"}

        masked = await list_team_keys(team)
        assert len(masked) == 1
        assert masked[0]["provider"] == "openai"
        assert "api_key" not in masked[0]
        assert "sk-team" not in str(masked)

    async def test_upsert_replaces_key(self):
        team = "byok-r2"
        await set_team_key(team, "gemini", "key-v1", "u-1")
        await set_team_key(team, "gemini", "key-v2", "u-2")
        keys = await get_team_keys_map(team)
        assert keys == {"gemini": "key-v2"}
        assert len(await list_team_keys(team)) == 1

    async def test_unsupported_provider_rejected(self):
        result = await set_team_key("byok-r3", "notaprovider", "k", "u-1")
        assert "error" in result
        assert not is_supported_provider("notaprovider")
        assert "openai" in SUPPORTED_PROVIDERS

    async def test_empty_key_rejected(self):
        result = await set_team_key("byok-r4", "openai", "   ", "u-1")
        assert "error" in result

    async def test_delete(self):
        team = "byok-r5"
        await set_team_key(team, "cohere", "ck", "u-1")
        assert await delete_team_key(team, "cohere") is True
        assert await delete_team_key(team, "cohere") is False
        assert await get_team_keys_map(team) == {}

    async def test_encrypted_at_rest(self):
        team = "byok-r6"
        await set_team_key(team, "voyage", "super-secret-voyage", "u-1")
        storage = get_storage()
        records = await storage.query_documents(
            "team_provider_keys", [("team_id", "==", team)]
        )
        assert records
        stored = str(records[0].get("api_key_encrypted", ""))
        assert "super-secret-voyage" not in stored
        assert stored != "super-secret-voyage"

    async def test_hf_inference_byok_supported(self):
        team = "byok-hf"
        result = await set_team_key(team, "huggingface_inference", "hf_token", "u-1")
        assert "error" not in result
        keys = await get_team_keys_map(team)
        assert keys == {"huggingface_inference": "hf_token"}
        assert await delete_team_key(team, "huggingface_inference") is True


# ── Router overrides ───────────────────────────────────────────────────────


def _clear_llm_keys(monkeypatch):
    for var in (
        "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "NVIDIA_API_KEY",
        "MISTRAL_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HUGGINGFACE_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)


def _clear_embedding_keys(monkeypatch):
    for var in ("OPENAI_API_KEY", "GEMINI_API_KEY", "NVIDIA_API_KEY", "COHERE_API_KEY", "VOYAGE_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)


class TestLLMRouterTeamKeyOverride:
    def _router(self, monkeypatch):
        _clear_llm_keys(monkeypatch)
        from app.llm import LLMRouter

        return LLMRouter()

    def test_override_makes_provider_available(self, monkeypatch):
        router = self._router(monkeypatch)
        # No env keys → only Ollama (local) is in the chain.
        assert [p.value for p in router.resolve_route(None)] == ["ollama"]
        # A team key flips the provider on without touching the env.
        chain = router.resolve_route(None, provider_keys={"openai": "sk-team"})
        assert chain[0].value == "openai"

    def test_provider_chain_honors_override(self, monkeypatch):
        router = self._router(monkeypatch)
        chain = router.provider_chain(
            model="anthropic", provider_keys={"anthropic": "sk-ant"}
        )
        assert chain[0].value == "anthropic"
        # Without the override the model is unresolvable → local fallback.
        assert router.provider_chain(model="anthropic")[0].value == "ollama"

    async def test_completion_uses_override_key(self, monkeypatch):
        router = self._router(monkeypatch)
        captured = {}

        async def fake_call(provider, config, prompt, system, max_tokens):
            captured["provider"] = provider.value
            captured["api_key"] = config["api_key"]
            return "hello from team key"

        monkeypatch.setattr(router, "_call_openai_sdk", fake_call)
        text, served, route = await router.openai_chat(
            "hello", provider_keys={"openai": "sk-team-key-9"}
        )
        assert text == "hello from team key"
        assert captured["provider"] == "openai"
        assert captured["api_key"] == "sk-team-key-9"
        assert "sk-team-key-9" not in served
        assert "sk-team-key-9" not in str(route)

    async def test_chat_honors_override(self, monkeypatch):
        router = self._router(monkeypatch)
        captured = {}

        async def fake_call(provider, config, prompt, system, max_tokens):
            captured["api_key"] = config["api_key"]
            return "ok"

        monkeypatch.setattr(router, "_call_openai_sdk", fake_call)
        await router.chat("hi", provider_keys={"groq": "sk-groq-team"})
        assert captured["api_key"] == "sk-groq-team"


class TestEmbeddingRouterTeamKeyOverride:
    def _router(self, monkeypatch):
        _clear_embedding_keys(monkeypatch)
        from app.embeddings import EmbeddingRouter

        # Deterministic env: treat the local sentence-transformers provider as
        # not installed so only override/env cloud keys matter in these tests.
        monkeypatch.setattr(
            EmbeddingRouter, "_hf_installed", staticmethod(lambda: False)
        )
        return EmbeddingRouter()

    async def test_embed_uses_team_key(self, monkeypatch):
        router = self._router(monkeypatch)
        captured = {}

        async def fake_call(provider, config, texts):
            captured["provider"] = provider.value
            captured["api_key"] = config["api_key"]
            return [[0.1] * 10]

        monkeypatch.setattr(router, "_call_openai_sdk", fake_call)
        vectors, provider, route = await router.embed_batch(
            ["hi"], provider_keys={"nvidia": "sk-nvidia-team"}
        )
        assert provider.value == "nvidia"
        assert captured["api_key"] == "sk-nvidia-team"
        assert len(vectors) == 1

    async def test_resolve_model_honors_override(self, monkeypatch):
        router = self._router(monkeypatch)
        # Without a key the model resolves away from openai (local/None fallback).
        resolved = router.resolve_model("text-embedding-3-small")
        assert resolved is None or resolved.value != "openai"
        # A team key makes the model resolve to openai.
        resolved2 = router.resolve_model(
            "text-embedding-3-small", provider_keys={"openai": "sk-x"}
        )
        assert resolved2 is not None and resolved2.value == "openai"


# ── HTTP endpoints ─────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"
TEST_UID = "u-byok-cto"


@pytest.fixture(autouse=True)
def _mock_team_rbac(monkeypatch):
    """Grant TEST_UID owner role for any org, bypassing DB team lookups."""
    from app.api.v1 import ai_gateway

    async def _member_of_any_org(team_id):
        return [{"id": TEST_UID, "user_id": TEST_UID, "role": "owner"}]

    async def _teams_for_user(user_id):
        return [{"id": "acme", "team_id": "acme", "role": "owner"}]

    async def _add_member(team_id, user_id, role="new_dev"):
        return {"id": team_id, "team_id": team_id, "user_id": user_id, "role": role}

    monkeypatch.setattr(ai_gateway, "get_team_members", _member_of_any_org)
    monkeypatch.setattr(ai_gateway, "get_user_teams", _teams_for_user)
    monkeypatch.setattr(ai_gateway, "add_member", _add_member)


def _app():
    from app.api.v1 import ai_gateway

    application = FastAPI()
    application.state.llm = None

    @application.middleware("http")
    async def _set_user(request, call_next):
        request.state.user = {
            "uid": TEST_UID,
            "email": "cto@test.com",
            "name": "Test CTO",
        }
        return await call_next(request)

    application.include_router(ai_gateway.router, prefix=API_PREFIX)
    return application


@pytest.fixture
def client():
    return TestClient(_app())


class TestProviderKeyEndpoints:
    def test_set_list_delete_roundtrip(self, client):
        r = client.put(
            f"{API_PREFIX}/ai/keys/acme/providers/openai",
            json={"api_key": "sk-acme-1"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["provider"] == "openai"
        assert "api_key" not in body
        assert "sk-acme" not in r.text

        r = client.get(f"{API_PREFIX}/ai/keys/acme/providers")
        assert r.status_code == 200
        providers = r.json()["providers"]
        assert any(p["provider"] == "openai" and p["configured"] for p in providers)
        assert "sk-acme" not in r.text

        r = client.delete(f"{API_PREFIX}/ai/keys/acme/providers/openai")
        assert r.status_code == 200
        r = client.get(f"{API_PREFIX}/ai/keys/acme/providers")
        assert all(p["provider"] != "openai" for p in r.json()["providers"])

    def test_unsupported_provider_400(self, client):
        r = client.put(
            f"{API_PREFIX}/ai/keys/acme/providers/azure", json={"api_key": "k"}
        )
        assert r.status_code == 400

    def test_empty_key_400(self, client):
        r = client.put(
            f"{API_PREFIX}/ai/keys/acme/providers/openai", json={"api_key": ""}
        )
        assert r.status_code == 400

    def test_delete_missing_404(self, client):
        r = client.delete(f"{API_PREFIX}/ai/keys/acme/providers/openai")
        assert r.status_code == 404

    def test_requires_key_manager_role(self, client):
        """Non-manager members are denied by _require_key_manager_role."""
        from app.api.v1 import ai_gateway

        original = ai_gateway._require_key_manager_role

        async def denied(org_name, user):
            from fastapi import HTTPException

            raise HTTPException(status_code=403, detail="Only CEO, CTO, senior, or HR can manage keys")

        ai_gateway._require_key_manager_role = denied
        try:
            r = client.get(f"{API_PREFIX}/ai/keys/acme/providers")
            assert r.status_code == 403
        finally:
            ai_gateway._require_key_manager_role = original
