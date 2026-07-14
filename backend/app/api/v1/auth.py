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

    now = datetime.now(timezone.utc)
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


@router.post("/deactivate")
async def deactivate(user: dict = Depends(get_current_user)):
    """Deactivate the current user's account — removes teams, webhooks, and anonymizes PII."""
    uid = user.get("uid", "")
    record = await deactivate_user(uid)
    return {"ok": True, "uid": record.get("uid")}
