"""
OAuth2 service for Google and GitHub social login.

Server-side OAuth flow:
1. Frontend redirects to /auth/oauth/{provider}/login
2. Backend redirects to provider's OAuth consent screen (with state=CSRF token)
3. Provider redirects back to /auth/oauth/{provider}/callback
4. Backend exchanges code for access token
5. Backend fetches user info (email, name) from provider
6. Backend creates/finds user by email, generates JWT
7. Backend redirects to frontend with token in query string
"""

import os
import secrets
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.services.user_service import create_user, get_user_by_email
from app.services.field_encryption import email_hash, encrypt_field, decrypt_field
from app.database.config import db_config
from app.database.models import User as UserModel
from sqlalchemy import select

logger = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

# Frontend URL for redirect after successful OAuth
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
)

# Backend public URL for OAuth redirect URIs
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# In-memory store for OAuth state tokens (CSRF protection).
# In production with multiple workers, replace with Redis.
_state_store: dict[str, dict] = {}


def _generate_state() -> str:
    """Generate a cryptographically random state string for CSRF protection."""
    state = secrets.token_urlsafe(32)
    _state_store[state] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return state


def _consume_state(state: str) -> bool:
    """Validate and consume a state token. Returns True if valid."""
    if state in _state_store:
        del _state_store[state]
        return True
    logger.warning("Invalid or expired OAuth state parameter")
    return False


def _clean_expired_states():
    """Remove state tokens older than 10 minutes."""
    now = datetime.now(timezone.utc)
    expired = [
        s for s, v in _state_store.items()
        if (now - datetime.fromisoformat(v["created_at"])).total_seconds() > 600
    ]
    for s in expired:
        _state_store.pop(s, None)


# ── Google OAuth ────────────────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_SCOPES = "openid email profile"


def get_google_login_url() -> str:
    """Build the Google OAuth consent screen URL."""
    state = _generate_state()
    redirect_uri = f"{BACKEND_URL}/api/v1/auth/oauth/google/callback"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def handle_google_callback(code: str, state: str) -> dict:
    """Exchange Google auth code for user info and return auth result.

    Returns a dict with 'uid', 'email', 'name', 'provider', 'token' on success,
    or raises an exception on failure.
    """
    if not _consume_state(state):
        raise ValueError("Invalid state parameter. Possible CSRF attack.")

    _clean_expired_states()

    # Exchange authorization code for tokens
    redirect_uri = f"{BACKEND_URL}/api/v1/auth/oauth/google/callback"
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.error("Google token exchange failed: %s", token_resp.text)
            raise ValueError("Failed to exchange authorization code with Google")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        # Fetch user info
        user_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_resp.status_code != 200:
            logger.error("Google userinfo failed: %s", user_resp.text)
            raise ValueError("Failed to fetch user info from Google")

        user_info = user_resp.json()

    email = user_info.get("email", "")
    name = user_info.get("name", "") or email.split("@")[0]
    google_id = user_info.get("id", "")

    if not email:
        raise ValueError("Google did not provide an email address")

    return await _find_or_create_oauth_user(email, name, "google.com", google_id)


# ── GitHub OAuth ────────────────────────────────────────────────────────────

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USERINFO_URL = "https://api.github.com/user"
GITHUB_SCOPES = "read:user user:email"


def get_github_login_url() -> str:
    """Build the GitHub OAuth consent screen URL."""
    state = _generate_state()
    redirect_uri = f"{BACKEND_URL}/api/v1/auth/oauth/github/callback"
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": GITHUB_SCOPES,
        "state": state,
    }
    return f"{GITHUB_AUTH_URL}?{urlencode(params)}"


async def handle_github_callback(code: str, state: str) -> dict:
    """Exchange GitHub auth code for user info and return auth result."""
    if not _consume_state(state):
        raise ValueError("Invalid state parameter. Possible CSRF attack.")

    _clean_expired_states()

    # Exchange authorization code for access token
    redirect_uri = f"{BACKEND_URL}/api/v1/auth/oauth/github/callback"
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            logger.error("GitHub token exchange failed: %s", token_resp.text)
            raise ValueError("Failed to exchange authorization code with GitHub")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        if not access_token:
            error_desc = token_data.get("error_description", token_data.get("error", "unknown error"))
            logger.error("GitHub token exchange no access_token: %s", error_desc)
            raise ValueError(f"GitHub OAuth error: {error_desc}")

        # Fetch user info
        user_resp = await client.get(
            GITHUB_USERINFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Onramp-2.0",
            },
        )
        if user_resp.status_code != 200:
            logger.error("GitHub userinfo failed: %s", user_resp.text)
            raise ValueError("Failed to fetch user info from GitHub")

        user_info = user_resp.json()

    # Try to get primary email
    email = user_info.get("email", "")
    name = user_info.get("name", "") or user_info.get("login", "")

    # GitHub doesn't always expose email in user endpoint
    if not email:
        # Try emails endpoint
        async with httpx.AsyncClient(timeout=15.0) as client:
            emails_resp = await client.get(
                f"{GITHUB_USERINFO_URL}/emails",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "Onramp-2.0",
                },
            )
            if emails_resp.status_code == 200:
                emails = emails_resp.json()
                for e in emails:
                    if e.get("primary") and e.get("verified"):
                        email = e["email"]
                        break
                if not email and emails:
                    email = emails[0].get("email", "")

    if not email:
        raise ValueError("GitHub did not provide an email address. Make sure your GitHub email is public or grant email permission.")

    github_id = str(user_info.get("id", ""))
    return await _find_or_create_oauth_user(email, name, "github.com", github_id)


# ── Shared ──────────────────────────────────────────────────────────────────


async def _find_or_create_oauth_user(
    email: str, name: str, provider: str, provider_id: str
) -> dict:
    """Find existing user by email or create a new one for OAuth login.

    Uses the ORM User model directly (consistent with login() path).
    Returns a dict with 'uid', 'email', 'name', 'provider', 'token'.
    """
    from app.api.v1.auth import _generate_jwt

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()

    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.email_hash == email_hash(email))
        )
        user_row = result.scalar_one_or_none()

        if user_row:
            # User exists — verify provider matches
            if user_row.provider != provider:
                raise ValueError(
                    f"This email is already registered with {user_row.provider}. "
                    f"Please sign in with {user_row.provider} instead."
                )
            if not user_row.is_active:
                raise ValueError("Account is deactivated")

            uid = user_row.id
            raw_email = user_row.email
            raw_name = user_row.name
            if raw_email.startswith("gAAAAA"):
                raw_email = decrypt_field(raw_email)
                raw_name = decrypt_field(raw_name)
        else:
            # Create new user
            uid = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            hashed_email = encrypt_field(email)
            hashed_name = encrypt_field(name)

            new_user = UserModel(
                id=uid,
                email=hashed_email,
                email_hash=email_hash(email),
                name=hashed_name,
                provider=provider,
                is_active=True,
                is_admin=False,
                created_at=now,
                updated_at=now,
                last_login_at=now,
            )
            session.add(new_user)
            await session.flush()
            raw_email = email
            raw_name = name

    token = _generate_jwt(uid, raw_email, raw_name, provider)
    return {
        "uid": uid,
        "email": raw_email,
        "name": raw_name,
        "provider": provider,
        "token": token,
    }
