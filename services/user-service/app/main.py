"""
User Service - Authentication, profiles, team management
Handles user registration, login, profile management, and team organization.
Port: 3001
"""

import os
import time
import uuid
import hashlib
from datetime import datetime
from collections import defaultdict
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(
    title="User Service",
    version="2.0.0",
    description="Authentication, profiles, team management for CodeFlow",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()

        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if current_time - t < 60
        ]

        if len(self.requests[client_ip]) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
            )

        self.requests[client_ip].append(current_time)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(
            self.requests_per_minute - len(self.requests[client_ip])
        )
        return response


app.add_middleware(RateLimitMiddleware, requests_per_minute=60)


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "developer"


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    avatar_url: str = ""
    team_id: Optional[str] = None
    skill_level: str = "intermediate"
    created_at: str
    updated_at: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None
    skill_level: Optional[str] = None


class TeamCreateRequest(BaseModel):
    name: str
    description: str = ""


class TeamAddMemberRequest(BaseModel):
    user_id: str
    role: str = "member"


class Team(BaseModel):
    id: str
    name: str
    owner_id: str
    description: str
    members: List[dict] = []
    created_at: str
    updated_at: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ApiKeyResponse(BaseModel):
    key: str
    name: str
    created_at: str
    last_used: Optional[str] = None


class CreateApiKeyRequest(BaseModel):
    name: str


# ─── In-Memory Storage ───────────────────────────────────────────────────────

users_db: dict = {}
teams_db: dict = {}
api_keys_db: dict = {}
sessions_db: dict = {}


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _generate_token() -> str:
    return f"cf_{uuid.uuid4().hex}_{int(time.time())}"


def _generate_api_key() -> str:
    return f"cfk_{uuid.uuid4().hex}{uuid.uuid4().hex[:16]}"


def _get_current_user(token: str) -> Optional[dict]:
    session = sessions_db.get(token)
    if session and session.get("expires_at", 0) > time.time():
        user_id = session["user_id"]
        return users_db.get(user_id)
    return None


# ─── Middleware helper ────────────────────────────────────────────────────────

def require_auth(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header else ""
    user = _get_current_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


# ─── API Routes ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "user-service"}


@app.post("/api/v1/auth/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """Register a new user"""
    if not request.name or not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Name, email, and password are required")

    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    for user in users_db.values():
        if user["email"] == request.email:
            raise HTTPException(status_code=409, detail="Email already registered")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()

    user = {
        "id": user_id,
        "name": request.name,
        "email": request.email,
        "password_hash": _hash_password(request.password),
        "role": request.role,
        "avatar_url": "",
        "team_id": None,
        "skill_level": "intermediate",
        "created_at": now,
        "updated_at": now,
    }
    users_db[user_id] = user

    token = _generate_token()
    sessions_db[token] = {
        "user_id": user_id,
        "created_at": now,
        "expires_at": time.time() + 86400 * 7,  # 7 days
    }

    return AuthResponse(
        token=token,
        user={k: v for k, v in user.items() if k != "password_hash"},
    )


@app.post("/api/v1/auth/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Authenticate a user"""
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    for user in users_db.values():
        if user["email"] == request.email and user["password_hash"] == _hash_password(request.password):
            token = _generate_token()
            sessions_db[token] = {
                "user_id": user["id"],
                "created_at": datetime.now().isoformat(),
                "expires_at": time.time() + 86400 * 7,
            }
            return AuthResponse(
                token=token,
                user={k: v for k, v in user.items() if k != "password_hash"},
            )

    raise HTTPException(status_code=401, detail="Invalid email or password")


@app.post("/api/v1/auth/logout")
async def logout(request: Request):
    """Invalidate the current session"""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "") if auth_header else ""
    if token in sessions_db:
        del sessions_db[token]
    return {"message": "Logged out successfully"}


@app.get("/api/v1/auth/me", response_model=UserProfile)
async def get_current_profile(request: Request):
    """Get the current authenticated user's profile"""
    user = require_auth(request)
    return UserProfile(**{k: v for k, v in user.items() if k != "password_hash"})


@app.put("/api/v1/auth/profile", response_model=UserProfile)
async def update_profile(request: Request, update: UpdateProfileRequest):
    """Update the current user's profile"""
    user = require_auth(request)

    if update.name is not None:
        user["name"] = update.name
    if update.role is not None:
        user["role"] = update.role
    if update.avatar_url is not None:
        user["avatar_url"] = update.avatar_url
    if update.skill_level is not None:
        user["skill_level"] = update.skill_level

    user["updated_at"] = datetime.now().isoformat()
    users_db[user["id"]] = user

    return UserProfile(**{k: v for k, v in user.items() if k != "password_hash"})


@app.post("/api/v1/auth/change-password")
async def change_password(request: Request, body: ChangePasswordRequest):
    """Change the current user's password"""
    user = require_auth(request)

    if user["password_hash"] != _hash_password(body.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    user["password_hash"] = _hash_password(body.new_password)
    user["updated_at"] = datetime.now().isoformat()
    users_db[user["id"]] = user

    return {"message": "Password changed successfully"}


@app.get("/api/v1/auth/users", response_model=List[UserProfile])
async def list_users(request: Request):
    """List all registered users (admin/team view)"""
    require_auth(request)
    profiles = []
    for user in users_db.values():
        profiles.append(UserProfile(**{k: v for k, v in user.items() if k != "password_hash"}))
    return profiles


@app.get("/api/v1/auth/users/{user_id}", response_model=UserProfile)
async def get_user(user_id: str, request: Request):
    """Get a specific user's profile"""
    require_auth(request)
    user = users_db.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfile(**{k: v for k, v in user.items() if k != "password_hash"})


# ─── API Keys ──────────────────────────────────────────────────────────────

@app.get("/api/v1/auth/api-keys", response_model=List[ApiKeyResponse])
async def list_api_keys(request: Request):
    """List all API keys for the current user"""
    user = require_auth(request)
    keys = [k for k in api_keys_db.values() if k.get("user_id") == user["id"]]
    return [ApiKeyResponse(**k) for k in keys]


@app.post("/api/v1/auth/api-keys", response_model=ApiKeyResponse)
async def create_api_key(request: Request, body: CreateApiKeyRequest):
    """Create a new API key"""
    user = require_auth(request)
    key_id = f"apik_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()

    api_key = {
        "id": key_id,
        "user_id": user["id"],
        "key": _generate_api_key(),
        "name": body.name,
        "created_at": now,
        "last_used": None,
    }
    api_keys_db[key_id] = api_key

    return ApiKeyResponse(**api_key)


@app.delete("/api/v1/auth/api-keys/{key_id}")
async def delete_api_key(key_id: str, request: Request):
    """Delete an API key"""
    user = require_auth(request)
    api_key = api_keys_db.get(key_id)
    if not api_key or api_key.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="API key not found")
    del api_keys_db[key_id]
    return {"message": "API key deleted"}


# ─── Team Management ──────────────────────────────────────────────────────

@app.post("/api/v1/auth/teams", response_model=Team)
async def create_team(request: Request, body: TeamCreateRequest):
    """Create a new team"""
    user = require_auth(request)
    team_id = f"team_{uuid.uuid4().hex[:12]}"
    now = datetime.now().isoformat()

    team = {
        "id": team_id,
        "name": body.name,
        "owner_id": user["id"],
        "description": body.description,
        "members": [
            {"user_id": user["id"], "name": user["name"], "email": user["email"], "role": "owner", "joined_at": now}
        ],
        "created_at": now,
        "updated_at": now,
    }
    teams_db[team_id] = team

    user["team_id"] = team_id
    users_db[user["id"]] = user

    return Team(**team)


@app.get("/api/v1/auth/teams", response_model=List[Team])
async def list_teams(request: Request):
    """List all teams (with membership check)"""
    user = require_auth(request)
    teams = []
    for team in teams_db.values():
        member_ids = {m["user_id"] for m in team["members"]}
        if user["id"] in member_ids or user["id"] == team["owner_id"]:
            teams.append(Team(**team))
    return teams


@app.get("/api/v1/auth/teams/{team_id}", response_model=Team)
async def get_team(team_id: str, request: Request):
    """Get team details"""
    require_auth(request)
    team = teams_db.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return Team(**team)


@app.post("/api/v1/auth/teams/{team_id}/members")
async def add_team_member(team_id: str, request: Request, body: TeamAddMemberRequest):
    """Add a member to a team"""
    user = require_auth(request)
    team = teams_db.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the team owner can add members")

    new_user = users_db.get(body.user_id)
    if not new_user:
        raise HTTPException(status_code=404, detail="User not found")

    if any(m["user_id"] == body.user_id for m in team["members"]):
        raise HTTPException(status_code=409, detail="User is already a team member")

    now = datetime.now().isoformat()
    team["members"].append({
        "user_id": body.user_id,
        "name": new_user["name"],
        "email": new_user["email"],
        "role": body.role,
        "joined_at": now,
    })
    team["updated_at"] = now
    teams_db[team_id] = team

    new_user["team_id"] = team_id
    users_db[body.user_id] = new_user

    return {"message": "Member added successfully", "team": Team(**team)}


@app.delete("/api/v1/auth/teams/{team_id}/members/{user_id}")
async def remove_team_member(team_id: str, user_id: str, request: Request):
    """Remove a member from a team"""
    user = require_auth(request)
    team = teams_db.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the team owner can remove members")

    team["members"] = [m for m in team["members"] if m["user_id"] != user_id]
    team["updated_at"] = datetime.now().isoformat()
    teams_db[team_id] = team

    removed_user = users_db.get(user_id)
    if removed_user and removed_user.get("team_id") == team_id:
        removed_user["team_id"] = None
        users_db[user_id] = removed_user

    return {"message": "Member removed successfully"}


# ─── Stats ────────────────────────────────────────────────────────────────

@app.get("/api/v1/auth/stats")
async def get_stats():
    """Get user service statistics"""
    total_users = len(users_db)
    total_teams = len(teams_db)
    active_sessions = sum(1 for s in sessions_db.values() if s.get("expires_at", 0) > time.time())
    roles = defaultdict(int)
    for user in users_db.values():
        roles[user["role"]] += 1

    return {
        "total_users": total_users,
        "total_teams": total_teams,
        "active_sessions": active_sessions,
        "roles": dict(roles),
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
