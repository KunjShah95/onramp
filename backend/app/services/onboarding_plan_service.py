import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.services.postgres_db import get_storage, generate_id

logger = logging.getLogger("onramp.onboarding_plan")

DEFAULT_MILESTONES = {
    30: [
        {"title": "Environment fully set up and running locally",
         "category": "technical", "description": "Dev environment configured, project runs, tests pass"},
        {"title": "First PR submitted",
         "category": "technical", "description": "Small bug fix or documentation change merged"},
        {"title": "Met all team members",
         "category": "social", "description": "1:1s with team lead, buddy, and key cross-functional partners"},
        {"title": "Understands architecture overview",
         "category": "technical", "description": "Can explain the high-level system architecture"},
        {"title": "On track with learning path",
         "category": "process", "description": "Assigned learning modules are at least 40% complete"},
    ],
    60: [
        {"title": "Owns and delivers a medium feature",
         "category": "technical", "description": "Feature delivered with minimal guidance"},
        {"title": "Participates in code reviews",
         "category": "cultural", "description": "Reviews 3+ PRs with meaningful feedback"},
        {"title": "Understands team processes",
         "category": "process", "description": "Can describe CI/CD, on-call, sprint ceremonies"},
        {"title": "Contributes to documentation",
         "category": "product", "description": "Updates or creates documentation based on learnings"},
    ],
    90: [
        {"title": "Independently delivers complex features",
         "category": "technical", "description": "Takes ownership of significant feature end-to-end"},
        {"title": "Mentors other new team members",
         "category": "cultural", "description": "Can answer questions and guide newer developers"},
        {"title": "Leads a technical discussion",
         "category": "social", "description": "Presents in demo, design review, or tech talk"},
        {"title": "Full productivity sustained",
         "category": "process", "description": "Sustained output matches team baseline for 2+ weeks"},
    ],
}

DEFAULT_PRE_BOARDING_TASKS = [
    {"title": "Send welcome email with Day 1 agenda", "assignee": "hr", "is_required": True},
    {"title": "Provision laptop and equipment", "assignee": "it", "is_required": True},
    {"title": "Set up email, Slack, and tool accounts", "assignee": "it", "is_required": True},
    {"title": "Assign onboarding buddy", "assignee": "manager", "is_required": True},
    {"title": "Grant repository access", "assignee": "it", "is_required": True},
    {"title": "Share pre-reading materials (architecture docs)", "assignee": "manager", "is_required": False},
    {"title": "Schedule first week 1:1s", "assignee": "manager", "is_required": True},
    {"title": "Review and sign off on onboarding plan", "assignee": "developer", "is_required": True},
    {"title": "Complete HR paperwork and compliance training", "assignee": "developer", "is_required": True},
]


async def create_plan(team_id: str, user_id: str, created_by: str,
                      start_date: str | None = None, buddy_id: str | None = None,
                      notes: str | None = None) -> dict | None:
    storage = get_storage()
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else datetime.now(timezone.utc)

    plan_id = generate_id()
    plan = {
        "id": plan_id,
        "team_id": team_id,
        "user_id": user_id,
        "created_by": created_by,
        "start_date": start.isoformat(),
        "buddy_id": buddy_id,
        "status": "draft",
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await storage.create_document("onboarding_plans", plan_id, plan)

    for day, milestones in DEFAULT_MILESTONES.items():
        for i, m in enumerate(milestones):
            mid = generate_id()
            milestone = {
                "id": mid, "plan_id": plan_id, "day_target": day,
                "title": m["title"], "description": m.get("description"),
                "category": m["category"], "is_completed": False,
                "sort_order": i, "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await storage.create_document("onboarding_milestones", mid, milestone)

    for i, t in enumerate(DEFAULT_PRE_BOARDING_TASKS):
        tid = generate_id()
        task = {
            "id": tid, "plan_id": plan_id, "title": t["title"],
            "assignee": t["assignee"], "is_required": t["is_required"],
            "is_completed": False, "sort_order": i,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await storage.create_document("pre_boarding_tasks", tid, task)

    return await get_plan(plan_id)


async def get_plan(plan_id: str) -> dict | None:
    storage = get_storage()
    try:
        plan = await storage.get_document("onboarding_plans", plan_id)
        if not plan:
            return None
        milestones = await storage.query_documents("onboarding_milestones", [("plan_id", "==", plan_id)])
        milestones.sort(key=lambda m: (m.get("day_target", 90), m.get("sort_order", 0)))
        pre_board = await storage.query_documents("pre_boarding_tasks", [("plan_id", "==", plan_id)])
        pre_board.sort(key=lambda t: t.get("sort_order", 0))
        pulses = await storage.query_documents("pulse_surveys", [("plan_id", "==", plan_id)])
        pulses.sort(key=lambda p: p.get("week_number", 0))
        return {
            **plan,
            "milestones": milestones,
            "pre_boarding_tasks": pre_board,
            "pulse_surveys": pulses,
        }
    except Exception:
        logger.exception("Failed to get plan %s", plan_id)
        return None


async def list_plans(team_id: str | None = None, user_id: str | None = None) -> list[dict]:
    storage = get_storage()
    filters = []
    if team_id:
        filters.append(("team_id", "==", team_id))
    if user_id:
        filters.append(("user_id", "==", user_id))
    try:
        plans = await storage.query_documents("onboarding_plans", filters)
        plans.sort(key=lambda p: p.get("created_at", ""), reverse=True)
        return plans
    except Exception:
        logger.exception("Failed to list plans")
        return []


async def update_plan(plan_id: str, updates: dict) -> dict | None:
    storage = get_storage()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await storage.update_document("onboarding_plans", plan_id, updates)
    return await get_plan(plan_id)


async def upsert_pulse(plan_id: str, week_number: int, data: dict) -> dict:
    storage = get_storage()
    existing = await storage.query_documents(
        "pulse_surveys", [("plan_id", "==", plan_id), ("week_number", "==", week_number)]
    )
    payload = {
        "plan_id": plan_id, "week_number": week_number,
        "confidence_score": data.get("confidence_score"),
        "clarity_score": data.get("clarity_score"),
        "support_score": data.get("support_score"),
        "workload_score": data.get("workload_score"),
        "sentiment": data.get("sentiment"),
        "open_feedback": data.get("open_feedback"),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        eid = existing[0]["id"]
        await storage.update_document("pulse_surveys", eid, payload)
        return {**existing[0], **payload}
    pid = generate_id()
    payload["id"] = pid
    payload["created_at"] = datetime.now(timezone.utc).isoformat()
    await storage.create_document("pulse_surveys", pid, payload)
    return payload


async def get_pulse_trends(plan_id: str) -> dict:
    storage = get_storage()
    pulses = await storage.query_documents("pulse_surveys", [("plan_id", "==", plan_id)])
    pulses.sort(key=lambda p: p.get("week_number", 0))
    if not pulses:
        return {"pulses": [], "trends": {}}
    scores = [p for p in pulses if p.get("confidence_score")]
    trend = {
        "confidence_avg": round(sum(p.get("confidence_score", 0) for p in scores) / len(scores), 1) if scores else None,
        "clarity_avg": round(sum(p.get("clarity_score", 0) for p in scores) / len(scores), 1) if scores else None,
        "support_avg": round(sum(p.get("support_score", 0) for p in scores) / len(scores), 1) if scores else None,
        "workload_avg": round(sum(p.get("workload_score", 0) for p in scores) / len(scores), 1) if scores else None,
        "response_count": len(pulses),
    }
    return {"pulses": pulses, "trends": trend}


async def submit_pulse(plan_id: str, data: dict) -> dict:
    week = data.get("week_number", 1)
    return await upsert_pulse(plan_id, week, data)


async def complete_milestone(milestone_id: str) -> dict | None:
    storage = get_storage()
    updates = {"is_completed": True, "completed_at": datetime.now(timezone.utc).isoformat()}
    try:
        await storage.update_document("onboarding_milestones", milestone_id, updates)
        return await storage.get_document("onboarding_milestones", milestone_id)
    except Exception:
        logger.exception("Failed to complete milestone %s", milestone_id)
        return None


async def complete_preboarding(task_id: str) -> dict | None:
    storage = get_storage()
    updates = {"is_completed": True, "completed_at": datetime.now(timezone.utc).isoformat()}
    try:
        await storage.update_document("pre_boarding_tasks", task_id, updates)
        return await storage.get_document("pre_boarding_tasks", task_id)
    except Exception:
        logger.exception("Failed to complete preboarding task %s", task_id)
        return None


async def get_team_pulse_overview(team_id: str) -> list[dict]:
    storage = get_storage()
    plans = await storage.query_documents("onboarding_plans", [("team_id", "==", team_id)])
    results = []
    for plan in plans:
        pid = plan["id"]
        pulses = await storage.query_documents("pulse_surveys", [("plan_id", "==", pid)])
        if pulses:
            latest = pulses[-1]
            results.append({
                "user_id": plan["user_id"],
                "plan_id": pid,
                "week_number": latest.get("week_number"),
                "confidence_score": latest.get("confidence_score"),
                "sentiment": latest.get("sentiment"),
                "submitted_at": latest.get("submitted_at"),
            })
    return results
