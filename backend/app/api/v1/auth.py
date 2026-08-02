import logging
import os
import secrets as _secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.database.config import db_config
from app.database.models import User as UserModel
from app.services.user_service import (
    create_user,
    get_user_by_uid,
    get_user_by_email,
    deactivate_user,
)
from app.services.postgres_db import get_storage
from app.services.field_encryption import email_hash, encrypt_field, decrypt_field
from app.services.email_service import is_enabled as email_is_enabled
from app.services.email_service import send_email
from app.services.api_key_service import APIKeyService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-in-production")
JWT_ALGORITHM = "HS256"
# Access token lifetime — short-lived per the session-refresh design (FEATURES_PLAN §6).
JWT_ACCESS_EXPIRY_MINUTES = int(os.getenv("JWT_ACCESS_EXPIRY_MINUTES", "15"))
JWT_REFRESH_EXPIRY_DAYS = int(os.getenv("JWT_REFRESH_EXPIRY_DAYS", "30"))
JWT_EXPIRY_HOURS = 168  # legacy fallback when no refresh flow used
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
)

# Refresh tokens are stored (hashed) in the generic dynamic_documents table so
# they survive server restarts and can be revoked/rotated server-side.
REFRESH_TOKEN_COLLECTION = "onramp_refresh_tokens"


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class AuthResponse(BaseModel):
    uid: str
    email: str
    name: str
    provider: str
    token: str
    refresh_token: str | None = None


class MeResponse(BaseModel):
    uid: str
    email: str
    name: str
    provider: str


class ProviderCheckResponse(BaseModel):
    email: str
    registered: bool
    provider: str | None


async def get_current_user(request: Request) -> dict:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def get_user_or_api_key(request: Request) -> dict:
    """Dependency that accepts either a JWT (Authorization header) or an API key (X-API-Key header).

    Used by the AIaaS public gateway so external users can authenticate with
    just an API key without needing a user JWT.

    Returns a dict with:
      - ``uid`` (str) — user ID from JWT or "api:{org_name}" for API key auth
      - ``auth_method`` (str) — "jwt" or "api_key"
      - ``tier`` (str) — tier from the API key, or "free" for JWT
      - ``org_name`` (str, optional) — org scope from API key
    """
    # Try JWT first
    user = getattr(request.state, "user", None)
    if user is not None:
        return {**user, "auth_method": "jwt", "tier": user.get("tier", "free")}

    # Fall back to X-API-Key header
    api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Not authenticated. Provide a JWT (Authorization) or API key (X-API-Key).")

    key_service = APIKeyService()
    key = await key_service.validate_key(api_key)
    if not key:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")

    perms = key.get("permissions") or {}
    org_name = perms.get("org_name") or key.get("org_name", "")
    tier = perms.get("tier", "free")

    return {
        "uid": f"api:{org_name}" if org_name else "api:unknown",
        "email": f"api@{org_name}.placeholder" if org_name else "api@unknown.placeholder",
        "name": f"API Key ({org_name})" if org_name else "API Key",
        "provider": "api_key",
        "auth_method": "api_key",
        "tier": tier,
        "org_name": org_name,
        "raw_key_record": key,
    }


def _generate_jwt(uid: str, email: str, name: str, provider: str, remember_me: bool = False) -> str:
    """Issue a short-lived access token.

    Access tokens are intentionally short-lived (default 15 min). Long-lived
    sessions are maintained by rotating refresh tokens stored server-side.
    """
    payload = {
        "uid": uid,
        "email": email,
        "name": name,
        "provider": provider,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_ACCESS_EXPIRY_MINUTES),
        "iat": datetime.now(timezone.utc),
        "remember_me": remember_me,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ── Refresh token store (server-side rotation) ───────────────────────────


def _hash_refresh_token(token: str) -> str:
    """Hash a refresh token so the raw value is never stored at rest."""
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_refresh_token() -> str:
    """Generate a cryptographically random opaque refresh token."""
    return _secrets.token_urlsafe(48)


async def _store_refresh_token(user_id: str, token: str, remember_me: bool) -> dict:
    """Persist a refresh token (hashed) with expiry, revoking any prior tokens."""
    storage = get_storage()
    expires_at = datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_EXPIRY_DAYS)
    record = {
        "user_id": user_id,
        "token_hash": _hash_refresh_token(token),
        "expires_at": expires_at.isoformat(),
        "remember_me": remember_me,
        "revoked": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Revoke existing tokens for this user (single active session per design).
    try:
        existing = await storage.query_documents(
            REFRESH_TOKEN_COLLECTION, [("user_id", "==", user_id)]
        )
        for e in existing:
            await storage.update_document(
                REFRESH_TOKEN_COLLECTION, e["id"], {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}
            )
    except Exception:
        logger.exception("Failed to revoke prior refresh tokens for %s", user_id)
    token_id = _secrets.token_hex(16)
    record["id"] = token_id
    try:
        await storage.create_document(REFRESH_TOKEN_COLLECTION, token_id, record)
    except Exception:
        logger.exception("Failed to persist refresh token")
    return record


async def _validate_refresh_token(token: str) -> dict | None:
    """Validate a refresh token. Returns the stored record or None."""
    storage = get_storage()
    token_hash = _hash_refresh_token(token)
    try:
        rows = await storage.query_documents(
            REFRESH_TOKEN_COLLECTION, [("token_hash", "==", token_hash)]
        )
    except Exception:
        logger.exception("Refresh token lookup failed")
        return None
    if not rows:
        return None
    record = rows[0]
    if record.get("revoked"):
        return None
    try:
        expires = datetime.fromisoformat(record["expires_at"])
        if expires < datetime.now(timezone.utc):
            return None
    except (KeyError, ValueError):
        return None
    return record


async def _revoke_refresh_token(token: str) -> None:
    """Revoke a refresh token (rotation invalidates the previous one)."""
    storage = get_storage()
    token_hash = _hash_refresh_token(token)
    try:
        rows = await storage.query_documents(
            REFRESH_TOKEN_COLLECTION, [("token_hash", "==", token_hash)]
        )
        for r in rows:
            await storage.update_document(
                REFRESH_TOKEN_COLLECTION, r["id"], {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}
            )
    except Exception:
        logger.exception("Failed to revoke refresh token")


async def _issue_tokens(
    uid: str, email: str, name: str, provider: str, remember_me: bool = False
) -> dict:
    """Issue an access token and (optionally) a rotating refresh token.

    Returns ``{token, refresh_token?}``. Refresh tokens are only issued for
    remember-me sessions; otherwise the client gets a plain access token.
    """
    token = _generate_jwt(uid, email, name, provider, remember_me=remember_me)
    result: dict = {"token": token}
    if remember_me:
        refresh = _generate_refresh_token()
        await _store_refresh_token(uid, refresh, remember_me=True)
        result["refresh_token"] = refresh
    return result


def _decode_jwt(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None



# ── OAuth Social Login ──────────────────────────────────────────────────────

from app.services.oauth_service import get_google_login_url, handle_google_callback
from app.services.oauth_service import get_github_login_url, handle_github_callback
from fastapi.responses import RedirectResponse


@router.get("/oauth/google/login")
async def google_login():
    """Redirect to Google OAuth consent screen."""
    url = get_google_login_url()
    return RedirectResponse(url=url)


@router.get("/oauth/google/callback")
async def google_callback(code: str, state: str):
    """Handle Google OAuth callback."""
    try:
        result = await handle_google_callback(code, state)
        frontend_url = os.getenv(
            "FRONTEND_URL",
            os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
        )
        redirect_url = f"{frontend_url}/auth/callback?token={result['token']}"
        return RedirectResponse(url=redirect_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/oauth/github/login")
async def github_login():
    """Redirect to GitHub OAuth consent screen."""
    url = get_github_login_url()
    return RedirectResponse(url=url)


@router.get("/oauth/github/callback")
async def github_callback(code: str, state: str):
    """Handle GitHub OAuth callback."""
    try:
        result = await handle_github_callback(code, state)
        frontend_url = os.getenv(
            "FRONTEND_URL",
            os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
        )
        redirect_url = f"{frontend_url}/auth/callback?token={result['token']}"
        return RedirectResponse(url=redirect_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest):
    """Register a new user with email/password."""
    if not body.email or not body.password or not body.name:
        raise HTTPException(status_code=400, detail="email, password, and name are required")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    uid = str(uuid.uuid4())
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    record = {
        "email": encrypt_field(body.email),
        "name": encrypt_field(body.name),
        "email_hash": email_hash(body.email),
        "provider": "password",
        "password_hash": password_hash,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }

    # Generate email verification token for password registrations
    verification_token = _secrets.token_urlsafe(32)

    # Attach verification token to the record
    record["email_verification_token"] = verification_token

    storage = get_storage()
    await storage.create_document("users", uid, record)

    # Also set via ORM so the model's relationship tracking is consistent
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.email_hash == email_hash(body.email))
        )
        user_row = result.scalar_one_or_none()
        if user_row:
            verification_token_expires = datetime.now(timezone.utc) + timedelta(hours=48)
            user_row.email_verification_token = verification_token
            user_row.email_verification_token_expires_at = verification_token_expires
            user_row.email_verified = False
            session.add(user_row)
            await session.commit()

    # Send verification email (non-blocking best-effort)
    verification_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"

    try:
        if email_is_enabled():
            await send_email(
                to=body.email,
                subject="Verify your email — Onramp",
                html_body=_build_verification_email_html(verification_link),
            )
        else:
            logger.info("=" * 60)
            logger.info("EMAIL VERIFICATION LINK (dev mode): %s", verification_link)
            logger.info("=" * 60)
    except Exception:
        logger.exception("Failed to send verification email to %s", body.email)

    tokens = await _issue_tokens(uid, body.email, body.name, "password", remember_me=False)

    return AuthResponse(
        uid=uid,
        email=body.email,
        name=body.name,
        provider="password",
        token=tokens["token"],
        refresh_token=tokens.get("refresh_token"),
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    """Authenticate with email/password and return a JWT."""
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="email and password are required")

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.email_hash == email_hash(body.email))
        )
        user_row = result.scalar_one_or_none()

    if not user_row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user_row.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not bcrypt.checkpw(body.password.encode(), user_row.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user_row.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    uid = user_row.id
    raw_email = user_row.email
    raw_name = user_row.name

    if raw_email.startswith("gAAAAA"):  # encrypted (Fernet)
        raw_email = decrypt_field(raw_email)
        raw_name = decrypt_field(raw_name)

    tokens = await _issue_tokens(uid, raw_email, raw_name, "password", remember_me=body.remember_me)

    return AuthResponse(
        uid=uid,
        email=raw_email,
        name=raw_name,
        provider="password",
        token=tokens["token"],
        refresh_token=tokens.get("refresh_token"),
    )


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    token: str
    refresh_token: str | None = None


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(body: RefreshRequest):
    """Exchange a refresh token for a new access token (with rotation).

    The presented refresh token is validated, then rotated: the old token is
    revoked and a new refresh token is issued. This endpoint is public — it is
    authenticated by the refresh token itself, so the client can call it after
    its access token expires (silent 401 retry on the frontend).
    """
    record = await _validate_refresh_token(body.refresh_token)
    if not record:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    uid = record["user_id"]
    user = await get_user_by_uid(uid)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is not active")

    email = user.get("email", "")
    if email.startswith("gAAAAA"):
        email = decrypt_field(email)
    name = user.get("name", "")
    if name.startswith("gAAAAA"):
        name = decrypt_field(name)

    # Rotate: revoke the old refresh token, issue a fresh pair.
    await _revoke_refresh_token(body.refresh_token)
    tokens = await _issue_tokens(uid, email, name, user.get("provider", "password"), remember_me=True)
    return RefreshResponse(token=tokens["token"], refresh_token=tokens.get("refresh_token"))


@router.get("/me", response_model=MeResponse)
async def me(user: dict = Depends(get_current_user)):
    """Return the current user's profile from the backend."""
    uid = user.get("uid", "")
    record = await get_user_by_uid(uid)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found in backend")

    return MeResponse(
        uid=record["uid"],
        email=record["email"],
        name=record["name"],
        provider=record["provider"],
    )


class VerifyEmailResponse(BaseModel):
    ok: bool
    message: str


@router.get("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(token: str):
    """Verify email address using a token sent via email."""
    if not token:
        raise HTTPException(status_code=400, detail="Verification token is required")

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.email_verification_token == token)
        )
        user_row = result.scalar_one_or_none()

        if not user_row:
            raise HTTPException(status_code=400, detail="Invalid or expired verification token")

        if user_row.email_verification_token_expires_at and user_row.email_verification_token_expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Verification token has expired")

        user_row.email_verified = True
        user_row.email_verification_token = None
        user_row.email_verification_token_expires_at = None
        user_row.updated_at = datetime.now(timezone.utc)
        session.add(user_row)
        await session.commit()

    return VerifyEmailResponse(ok=True, message="Email verified successfully")


@router.get("/check-provider", response_model=ProviderCheckResponse)
async def check_provider(email: str):
    """Check what auth provider a given email uses (or if it's unregistered)."""
    record = await get_user_by_email(email)
    if record is None:
        return ProviderCheckResponse(email=email, registered=False, provider=None)
    return ProviderCheckResponse(
        email=email, registered=True, provider=record.get("provider")
    )



# ── Password Reset ───────────────────────────────────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class SetPasswordRequest(BaseModel):
    password: str


RESET_TOKEN_EXPIRY_MINUTES = 60


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Send a password reset email with a short-lived JWT token."""
    if not body.email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Look up user by email hash
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    user_row = None
    raw_email = body.email

    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.email_hash == email_hash(body.email))
        )
        user_row = result.scalar_one_or_none()

    # Always return 200 to avoid leaking whether the email exists
    if not user_row or not user_row.is_active or user_row.provider != "password":
        logger.info("Password reset requested for non-existent/inactive/non-password user: %s", email_hash(body.email)[:12])
        return {"ok": True, "message": "If an account exists, a reset link has been sent."}

    # Generate a short-lived reset JWT
    nonce = _secrets.token_urlsafe(16)
    reset_payload = {
        "purpose": "password_reset",
        "uid": user_row.id,
        "nonce": nonce,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRY_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    reset_token = jwt.encode(reset_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    # Decrypt the user's email for sending
    user_email = user_row.email
    if user_email.startswith("gAAAAA"):
        user_email = decrypt_field(user_email)

    # Build reset link
    # dev mode: logs token; production: sends email
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    email_sent = False

    if email_is_enabled():
        html = _build_reset_email_html(reset_link)
        email_sent = await send_email(
            to=user_email,
            subject="Password Reset — Onramp",
            html_body=html,
        )

    if not email_sent:
        # Dev mode: log the reset link
        logger.info("=" * 60)
        logger.info("PASSWORD RESET LINK (dev mode): %s", reset_link)
        logger.info("=" * 60)

    return {"ok": True, "message": "If an account exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """Reset a user's password using a valid reset token."""
    if not body.token or not body.password:
        raise HTTPException(status_code=400, detail="Token and password are required")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Verify the reset token
    try:
        payload = jwt.decode(body.token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token")

    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    # Update password in database
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    now = datetime.now(timezone.utc)

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.id == uid)
        )
        user_row = result.scalar_one_or_none()

        if not user_row:
            raise HTTPException(status_code=400, detail="User not found")

        if not user_row.is_active:
            raise HTTPException(status_code=400, detail="Account is deactivated")

        user_row.password_hash = password_hash
        user_row.updated_at = now
        session.add(user_row)
        await session.commit()

    logger.info("Password reset successful for user: %s", uid[:12])
    return {"ok": True, "message": "Password has been reset successfully."}


@router.post("/set-password")
async def set_password(
    body: SetPasswordRequest,
    user: dict = Depends(get_current_user),
):
    """Set a new password (required for provisioned users on first login)."""
    uid = user.get("uid", "")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    now = datetime.now(timezone.utc)

    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        result = await session.execute(
            select(UserModel).where(UserModel.id == uid)
        )
        user_row = result.scalar_one_or_none()

        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        user_row.password_hash = password_hash
        user_row.password_reset_required = False
        user_row.updated_at = now
        session.add(user_row)
        await session.commit()

    return {"ok": True, "message": "Password has been set"}


def _build_verification_email_html(verification_link: str) -> str:
    """Build the HTML email template for email verification."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px"></div>
<h1 style="color:#FDFBF8;font-size:20px;margin:0">Verify Your Email</h1>
</div>
<p style="color:rgba(253,251,248,0.6);font-size:14px;line-height:1.6;margin-bottom:24px">
Thanks for signing up! Click the button below to verify your email address and get started.
</p>
<div style="text-align:center;margin-bottom:24px">
<a href="{verification_link}" style="display:inline-block;background:#FF8C00;color:#3D1C00;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:700;font-size:14px">Verify Email</a>
</div>
<p style="color:rgba(253,251,248,0.3);font-size:11px;text-align:center;margin:0">
If you didn't create an account, you can safely ignore this email.
</p>
</div></body></html>"""


def _build_reset_email_html(reset_link: str) -> str:
    """Build the HTML email template for password reset."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px"></div>
<h1 style="color:#FDFBF8;font-size:20px;margin:0">Password Reset</h1>
</div>
<p style="color:rgba(253,251,248,0.6);font-size:14px;line-height:1.6;margin-bottom:24px">
We received a request to reset your password. Click the button below to set a new one.
This link expires in 60 minutes.
</p>
<div style="text-align:center;margin-bottom:24px">
<a href="{reset_link}" style="display:inline-block;background:#FF8C00;color:#3D1C00;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:700;font-size:14px">Reset Password</a>
</div>
<p style="color:rgba(253,251,248,0.3);font-size:11px;text-align:center;margin:0">
If you didn't request this, you can safely ignore this email.
</p>
</div></body></html>"""


@router.post("/deactivate")
async def deactivate(user: dict = Depends(get_current_user)):
    """Deactivate the current user's account — removes teams, webhooks, and anonymizes PII."""
    uid = user.get("uid", "")
    record = await deactivate_user(uid)
    return {"ok": True, "uid": record.get("uid")}
