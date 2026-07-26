"""Unit tests for neon_auth service — JWKS fetch, token validation, session verification."""

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa as rsa_mod
from jwt.algorithms import RSAAlgorithm

from app.services import neon_auth


@pytest.fixture(autouse=True)
def _reset_globals():
    neon_auth._cached_jwks = None
    neon_auth._cached_jwks_at = None
    neon_auth.JWKS_URL = "https://neon.example.com/.well-known/jwks.json"
    neon_auth.ISSUER = "https://neon.example.com"
    yield
    neon_auth._cached_jwks = None
    neon_auth._cached_jwks_at = None


@pytest.fixture(scope="session")
def rsa_key_pair():
    private_key = rsa_mod.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    return private_key


@pytest.fixture
def jwks_payload(rsa_key_pair):
    jwk = json.loads(RSAAlgorithm.to_jwk(rsa_key_pair.public_key()))
    jwk["kid"] = "test-kid-1"
    jwk["alg"] = "RS256"
    return {"keys": [jwk]}


@pytest.fixture
def valid_token(rsa_key_pair):
    now = int(time.time())
    payload = {
        "sub": "neon-user-123",
        "email": "test@example.com",
        "name": "Test User",
        "iat": now,
        "exp": now + 3600,
        "iss": "https://neon.example.com",
    }
    headers = {"kid": "test-kid-1"}
    token = jwt.encode(payload, rsa_key_pair, algorithm="RS256", headers=headers)
    return token


@pytest.fixture
def expired_token(rsa_key_pair):
    now = int(time.time())
    payload = {
        "sub": "neon-user-123",
        "email": "test@example.com",
        "name": "Test User",
        "iat": now - 7200,
        "exp": now - 3600,
        "iss": "https://neon.example.com",
    }
    headers = {"kid": "test-kid-1"}
    token = jwt.encode(payload, rsa_key_pair, algorithm="RS256", headers=headers)
    return token


# ── _fetch_jwks ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fetch_jwks_success(jwks_payload):
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        result = await neon_auth._fetch_jwks()

    assert result == jwks_payload
    assert neon_auth._cached_jwks == jwks_payload
    assert neon_auth._cached_jwks_at is not None


@pytest.mark.asyncio
async def test_fetch_jwks_empty_url():
    neon_auth.JWKS_URL = ""
    with pytest.raises(ValueError, match="NEON_AUTH_JWKS_URL is not configured"):
        await neon_auth._fetch_jwks()


@pytest.mark.asyncio
async def test_fetch_jwks_http_error():
    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = Exception("HTTP 500")

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        with pytest.raises(Exception, match="HTTP 500"):
            await neon_auth._fetch_jwks()


@pytest.mark.asyncio
async def test_fetch_jwks_caching(jwks_payload):
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        result1 = await neon_auth._fetch_jwks()
        result2 = await neon_auth._fetch_jwks()

    assert result1 == result2
    assert mock_client.get.call_count == 1


# ── validate_neon_token ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_validate_token_success(valid_token, jwks_payload):
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        payload = await neon_auth.validate_neon_token(valid_token)

    assert payload is not None
    assert payload["sub"] == "neon-user-123"
    assert payload["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_validate_token_expired(expired_token, jwks_payload):
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        result = await neon_auth.validate_neon_token(expired_token)

    assert result is None


@pytest.mark.asyncio
async def test_validate_token_invalid():
    result = await neon_auth.validate_neon_token("totally-invalid-token")
    assert result is None


@pytest.mark.asyncio
async def test_validate_token_no_matching_kid(valid_token, jwks_payload):
    jwks_payload["keys"][0]["kid"] = "different-kid"
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        result = await neon_auth.validate_neon_token(valid_token)

    assert result is None


@pytest.mark.asyncio
async def test_validate_token_no_jwks_url():
    neon_auth.JWKS_URL = ""
    result = await neon_auth.validate_neon_token("some-token")
    assert result is None


# ── verify_neon_session ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_session_success(valid_token, jwks_payload):
    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        result = await neon_auth.verify_neon_session(valid_token)

    assert result is not None
    assert result["uid"] == "neon-user-123"
    assert result["email"] == "test@example.com"
    assert result["name"] == "Test User"
    assert result["provider"] == "neon"
    assert result["role"] == "member"


@pytest.mark.asyncio
async def test_verify_session_no_jwks_url():
    neon_auth.JWKS_URL = ""
    result = await neon_auth.verify_neon_session("some-token")
    assert result is None


@pytest.mark.asyncio
async def test_verify_session_no_issuer():
    neon_auth.ISSUER = ""
    result = await neon_auth.verify_neon_session("some-token")
    assert result is None


@pytest.mark.asyncio
async def test_verify_session_invalid_token():
    result = await neon_auth.verify_neon_session("invalid-token")
    assert result is None


@pytest.mark.asyncio
async def test_verify_session_missing_sub(jwks_payload, rsa_key_pair):
    now = int(time.time())
    payload = {
        "email": "no-sub@example.com",
        "name": "No Sub",
        "iat": now,
        "exp": now + 3600,
        "iss": "https://neon.example.com",
    }
    headers = {"kid": "test-kid-1"}
    token = jwt.encode(payload, rsa_key_pair, algorithm="RS256", headers=headers)

    mock_resp = MagicMock()
    mock_resp.json = MagicMock(return_value=jwks_payload)

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_resp

        result = await neon_auth.verify_neon_session(token)

    assert result is None


# ── Concurrency guard ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_concurrent_fetch_uses_lock(jwks_payload):
    call_count = 0

    async def slow_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.05)
        mock_resp = MagicMock()
        mock_resp.json = MagicMock(return_value=jwks_payload)
        return mock_resp

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.get.side_effect = slow_get

        results = await asyncio.gather(
            neon_auth._fetch_jwks(),
            neon_auth._fetch_jwks(),
            neon_auth._fetch_jwks(),
        )

    assert all(r == jwks_payload for r in results)
    assert call_count == 1, "Expected only one HTTP call due to lock"
