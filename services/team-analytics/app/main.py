from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(
    title="Team Analytics Service",
    version="2.0.0",
    description="CTO Dashboard, team metrics, skill profiling, predictions",
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
            return HTTPException(
                status_code=429, detail="Rate limit exceeded. Please try again later."
            )

        self.requests[client_ip].append(current_time)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(
            self.requests_per_minute - len(self.requests[client_ip])
        )
        return response


app.add_middleware(RateLimitMiddleware, requests_per_minute=60)


class TeamMember(BaseModel):
    id: str
    name: str
    email: str
    role: str
    join_date: str
    skill_level: str = "intermediate"


class TeamMetrics(BaseModel):
    team_id: str
    total_members: int
    active_members: int
    avg_progress: float
    total_completed_tasks: int
    at_risk_count: int


class SkillProfile(BaseModel):
    user_id: str
    overall_score: float
    strengths: List[str]
    gaps: List[str]
    recommendations: List[str]


class ProbationPrediction(BaseModel):
    user_id: str
    success_probability: float
    risk_factors: List[str]
    recommendations: List[str]


class CTOSnapshot(BaseModel):
    team_id: str
    project_health: str
    onboarding_velocity: float
    skill_distribution: dict
    recommendations: List[str]
    generated_at: str


teams_db = {}
metrics_db = {}
skills_db = {}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "team-analytics"}


@app.post("/api/v1/teams")
async def create_team(name: str, owner_id: str):
    """Create a new team"""
    team_id = f"team_{name.lower().replace(' ', '_')}"

    team = {
        "id": team_id,
        "name": name,
        "owner_id": owner_id,
        "members": [],
        "created_at": datetime.now().isoformat(),
    }

    teams_db[team_id] = team

    return team


@app.get("/api/v1/teams/{team_id}/members", response_model=List[TeamMember])
async def get_team_members(team_id: str):
    """Get all team members"""
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")
    return teams_db[team_id].get("members", [])


@app.post("/api/v1/teams/{team_id}/members")
async def add_team_member(team_id: str, name: str, email: str, role: str):
    """Add a member to the team"""
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")

    member = TeamMember(
        id=f"member_{len(teams_db[team_id]['members']) + 1}",
        name=name,
        email=email,
        role=role,
        join_date=datetime.now().isoformat(),
    )

    teams_db[team_id]["members"].append(member)
    return member


@app.get("/api/v1/teams/{team_id}/metrics", response_model=TeamMetrics)
async def get_team_metrics(team_id: str):
    """Get team metrics"""
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")

    team = teams_db[team_id]
    members = team.get("members", [])
    total = len(members)
    active = sum(1 for m in members if m.skill_level != "beginner") if members else 0

    return TeamMetrics(
        team_id=team_id,
        total_members=total,
        active_members=active,
        avg_progress=65.5,
        total_completed_tasks=active * 10,
        at_risk_count=total - active,
    )


@app.get("/api/v1/users/{user_id}/skills", response_model=SkillProfile)
async def get_skill_profile(user_id: str):
    """Get user skill profile"""
    return SkillProfile(
        user_id=user_id,
        overall_score=72.5,
        strengths=["Python", "React", "API Design"],
        gaps=["Kubernetes", "Security"],
        recommendations=[
            "Focus on cloud security fundamentals",
            "Practice container orchestration",
        ],
    )


@app.get("/api/v1/users/{user_id}/probation", response_model=ProbationPrediction)
async def get_probation_prediction(user_id: str):
    """Get probation success prediction"""
    return ProbationPrediction(
        user_id=user_id,
        success_probability=0.78,
        risk_factors=["New to team", "Limited codebase exposure"],
        recommendations=["Pair programming sessions", "Daily standups with mentor"],
    )


@app.get("/api/v1/teams/{team_id}/cto-snapshot", response_model=CTOSnapshot)
async def get_cto_snapshot(team_id: str):
    """Get CTO dashboard snapshot"""
    if team_id not in teams_db:
        raise HTTPException(status_code=404, detail="Team not found")

    return CTOSnapshot(
        team_id=team_id,
        project_health="good",
        onboarding_velocity=72.5,
        skill_distribution={"frontend": 35, "backend": 45, "devops": 20},
        recommendations=[
            "Increase DevOps training",
            "Pair experienced with new engineers",
        ],
        generated_at=datetime.now().isoformat(),
    )


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.getenv("PORT", "3005"))
    uvicorn.run(app, host="0.0.0.0", port=port)
