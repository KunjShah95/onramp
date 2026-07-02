from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from app.services.user_service import create_user, get_user_by_uid, get_user_by_email
from app.middleware.auth import verify_session_token

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenPayload(BaseModel):
    id_token: str
    provider: str  # "google.com", "github.com", or "password"


class RegisterResponse(BaseModel):
    uid: str
    email: str
    name: str
    provider: str


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


@router.post("/register", response_model=RegisterResponse)
async def register(body: TokenPayload):
    """Register or login a user with a Neon Auth session token.

    If the user already exists with the same provider, returns the existing record.
    If the user exists with a *different* provider, raises 409 Conflict.
    """
    _ALLOWED_PROVIDERS = ("google.com", "github.com", "password")

    decoded = await verify_session_token(body.id_token)
    if decoded is None:
        raise HTTPException(status_code=401, detail="Invalid or expired ID token")

    uid = decoded.get("uid", "")
    email = decoded.get("email", "") or ""
    name = decoded.get("name", "") or decoded.get("email", "").split("@")[0]

    if not email:
        raise HTTPException(status_code=400, detail="No email in token")

    token_provider = decoded.get("provider", "")
    if token_provider == "dev":
        token_provider = "password"
    provider = token_provider or body.provider
    if provider not in _ALLOWED_PROVIDERS:
        raise HTTPException(status_code=400, detail="Provider must be 'google.com', 'github.com', or 'password'")

    try:
        record = await create_user(uid=uid, email=email, name=name, provider=provider)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return RegisterResponse(uid=record["uid"], email=record["email"], name=record["name"], provider=record["provider"])


@router.get("/me", response_model=MeResponse)
async def me(user: dict = Depends(get_current_user)):
    """Return the current user's profile from the backend."""
    uid = user.get("uid", "")
    record = await get_user_by_uid(uid)
    if record is None:
        raise HTTPException(status_code=404, detail="User not found in backend")

    return MeResponse(uid=record["uid"], email=record["email"], name=record["name"], provider=record["provider"])


@router.get("/check-provider", response_model=ProviderCheckResponse)
async def check_provider(email: str):
    """Check what auth provider a given email uses (or if it's unregistered)."""
    record = await get_user_by_email(email)
    if record is None:
        return ProviderCheckResponse(email=email, registered=False, provider=None)
    return ProviderCheckResponse(email=email, registered=True, provider=record.get("provider"))
