from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from enum import Enum
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware

app = FastAPI(
    title="Learning Path Service",
    version="2.0.0",
    description="Roadmaps, tasks, progress tracking",
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


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class RoadmapNode(BaseModel):
    id: str
    title: str
    description: str
    file_path: Optional[str] = None
    concepts: List[str] = []


class LearningTask(BaseModel):
    id: str
    roadmap_id: str
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    priority: int = 1
    file_path: Optional[str] = None
    completed_at: Optional[str] = None


class LearningRoadmap(BaseModel):
    id: str
    user_id: str
    repo_id: str
    name: str
    nodes: List[RoadmapNode] = []
    current_node: Optional[str] = None
    progress: float = 0.0
    created_at: str


class Progress(BaseModel):
    id: str
    user_id: str
    repo_id: str
    task_id: str
    completed: bool = False
    timestamp: str


roadmaps_db = {}
tasks_db = {}
progress_db = {}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "learning-path"}


@app.post("/api/v1/roadmaps", response_model=LearningRoadmap)
async def create_roadmap(repo_id: str, user_id: str, name: str = "Learning Path"):
    """Create a new learning roadmap"""
    roadmap_id = f"roadmap_{repo_id}_{user_id}"

    nodes = [
        RoadmapNode(
            id="1",
            title="Understand Project Structure",
            description="Explore the repository structure and key directories",
            concepts=["project-layout", "directories"],
        ),
        RoadmapNode(
            id="2",
            title="Identify Key Files",
            description="Find the main entry points and configuration",
            concepts=["entry-points", "config"],
        ),
        RoadmapNode(
            id="3",
            title="Core Logic",
            description="Understand the core business logic",
            concepts=["business-logic", "domain"],
        ),
        RoadmapNode(
            id="4",
            title="Data Layer",
            description="Review database schemas and data flow",
            concepts=["database", "models"],
        ),
        RoadmapNode(
            id="5",
            title="API Endpoints",
            description="Study the API endpoints",
            concepts=["api", "controllers"],
        ),
    ]

    roadmap = LearningRoadmap(
        id=roadmap_id,
        user_id=user_id,
        repo_id=repo_id,
        name=name,
        nodes=nodes,
        current_node="1",
        progress=0.0,
        created_at="2026-04-18T00:00:00Z",
    )

    roadmaps_db[roadmap_id] = roadmap

    task_id = f"task_{roadmap_id}"
    for node in nodes:
        task = LearningTask(
            id=f"{task_id}_{node.id}",
            roadmap_id=roadmap_id,
            title=node.title,
            description=node.description,
            status=TaskStatus.PENDING,
            priority=int(node.id),
        )
        tasks_db[task.id] = task

    return roadmap


@app.get("/api/v1/roadmaps/{roadmap_id}", response_model=LearningRoadmap)
async def get_roadmap(roadmap_id: str):
    """Get a learning roadmap"""
    if roadmap_id not in roadmaps_db:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmaps_db[roadmap_id]


@app.get("/api/v1/roadmaps/{roadmap_id}/tasks", response_model=List[LearningTask])
async def get_roadmap_tasks(roadmap_id: str):
    """Get all tasks for a roadmap"""
    tasks = [t for t in tasks_db.values() if t.roadmap_id == roadmap_id]
    return tasks


@app.post("/api/v1/tasks/{task_id}")
async def update_task(task_id: str, status: TaskStatus):
    """Update task status"""
    if task_id not in tasks_db:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks_db[task_id]
    task.status = status

    if status == TaskStatus.COMPLETED:
        task.completed_at = "2026-04-18T00:00:00Z"

    return task


@app.post("/api/v1/progress")
async def track_progress(user_id: str, repo_id: str, task_id: str):
    """Track learning progress"""
    progress_id = f"progress_{user_id}_{repo_id}_{task_id}"

    progress = Progress(
        id=progress_id,
        user_id=user_id,
        repo_id=repo_id,
        task_id=task_id,
        completed=True,
        timestamp="2026-04-18T00:00:00Z",
    )

    progress_db[progress_id] = progress

    roadmap_id = f"roadmap_{repo_id}_{user_id}"
    if roadmap_id in roadmaps_db:
        roadmap = roadmaps_db[roadmap_id]
        completed_tasks = sum(
            1
            for t in tasks_db.values()
            if t.roadmap_id == roadmap_id and t.status == TaskStatus.COMPLETED
        )
        roadmap.progress = (
            (completed_tasks / len(roadmap.nodes)) * 100 if roadmap.nodes else 0
        )

    return progress


@app.get("/api/v1/progress/{user_id}/{repo_id}")
async def get_user_progress(user_id: str, repo_id: str):
    """Get user progress for a repository"""
    progress = [
        p for p in progress_db.values() if p.user_id == user_id and p.repo_id == repo_id
    ]
    return {"completed_tasks": len(progress), "progress": progress}


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.getenv("PORT", "3003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
