import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
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

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 168  # 7 days


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class AuthResponse(BaseModel):
    uid: str
    email: str
    name: str
    provider: str
    token: str


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


def _generate_jwt(uid: str, email: str, name: str, provider: str) -> str:
    payload = {
        "uid": uid,
        "email": email,
        "name": name,
        "provider": provider,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


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

    storage = get_storage()
    await storage.create_document("users", uid, record)

    token = _generate_jwt(uid, body.email, body.name, "password")

    return AuthResponse(
        uid=uid,
        email=body.email,
        name=body.name,
        provider="password",
        token=token,
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

    token = _generate_jwt(uid, raw_email, raw_name, "password")

    return AuthResponse(
        uid=uid,
        email=raw_email,
        name=raw_name,
        provider="password",
        token=token,
    )


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

import secrets as _secrets
from app.services.email_service import send_email


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


RESET_TOKEN_EXPIRY_MINUTES = 60
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")[0].strip(),
)


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
    from app.services.email_service import is_enabled as email_is_enabled

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
        await session.flush()

    logger.info("Password reset successful for user: %s", uid[:12])
    return {"ok": True, "message": "Password has been reset successfully."}


def _build_reset_email_html(reset_link: str) -> str:
    """Build the HTML email template for password reset."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0D0906;padding:40px 20px">
<div style="max-width:480px;margin:0 auto;background:#1A110D;border-radius:12px;padding:32px;border:1px solid rgba(253,251,248,0.08)">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:40px;margin-bottom:8px">🔐</div>
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
