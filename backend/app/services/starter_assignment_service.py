"""
Starter Task Assignment Service — automated first-task assignment.

When a new developer joins a team, this service picks 3 starter tasks from the
team's repository issues, matching difficulty to the developer's quiz score
and gamification level (connecting the existing quiz, gamification, and
GitHub issues infra).

Difficulty mapping:
  - quiz best percentage >= 80  OR gamification level >= 5  → senior (all issues)
  - quiz best percentage >= 60  OR gamification level >= 3  → mid  (3..7)
  - otherwise                                                → junior (<= 4)
"""

import logging
from typing import Any, Dict, List, Optional

from app.services.postgres_db import get_storage

logger = logging.getLogger("onramp.starter_assignment")

STARTER_TASK_COUNT = 3


async def _quiz_level(user_id: str) -> Optional[str]:
    """Derive a difficulty level from the user's best quiz percentage."""
    try:
        storage = get_storage()
        results = await storage.query_documents(
            "onramp_quiz_results", [("user_id", "==", user_id)]
        )
        percentages = [r.get("percentage", 0) for r in results if r.get("percentage") is not None]
        if not percentages:
            return None
        best = max(percentages)
        if best >= 80:
            return "senior"
        if best >= 60:
            return "mid"
        return "junior"
    except Exception:
        logger.exception("Failed to read quiz results for %s", user_id)
        return None


async def _gamification_level(user_id: str) -> int:
    """Return the user's gamification level (XP based)."""
    try:
        from app.services.gamification_service import get_total_xp
        total_xp = await get_total_xp(user_id)
        return (total_xp // 250) + 1
    except Exception:
        logger.exception("Failed to read gamification summary for %s", user_id)
        return 1


async def infer_user_level(user_id: str) -> str:
    """Blend quiz score and gamification level into a difficulty level."""
    quiz_level = await _quiz_level(user_id)
    gam_level = await _gamification_level(user_id)

    if quiz_level == "senior" or gam_level >= 5:
        return "senior"
    if quiz_level == "mid" or gam_level >= 3:
        return "mid"
    return "junior"


async def find_starter_issues(repo_url: str, user_level: str, count: int = STARTER_TASK_COUNT) -> List[dict]:
    """Find starter issues for a repo at the given difficulty level.

    Uses FirstPRAccelerator's issue discovery (keyword + optional LLM
    rescoring), filtered by user level. Falls back to IssueService directly if
    the accelerator isn't available.
    """
    try:
        from app.agents.first_pr_accelerator import FirstPRAccelerator

        accelerator = FirstPRAccelerator(None)  # llm=None → keyword scores only
        issues = await accelerator.find_issues(repo_url, user_level=user_level, limit=30)
        return issues[:count]
    except Exception:
        logger.exception("FirstPRAccelerator failed for %s", repo_url)
        try:
            from app.services.issue_service import IssueService

            service = IssueService()
            issues = await service.get_beginner_issues(repo_url, limit=30)
            # Filter by the same level bands as the accelerator
            if user_level == "junior":
                issues = [i for i in issues if i.get("complexity_score", 9) <= 4]
            elif user_level == "mid":
                issues = [i for i in issues if 3 <= i.get("complexity_score", 5) <= 7]
            return issues[:count]
        except Exception:
            logger.exception("IssueService fallback failed for %s", repo_url)
            return []


async def assign_starter_tasks(
    team_id: str,
    user_id: str,
    repo_url: str,
    created_by: str,
    count: int = STARTER_TASK_COUNT,
) -> Dict[str, Any]:
    """Assign `count` starter tasks to a new dev from the repo's issues.

    Creates real workflow tasks (state=assigned) whose difficulty matches the
    new dev's quiz score + gamification level. Tasks that already exist for
    this assignee+repo+issue number are skipped (idempotent).

    Returns the created tasks plus the inferred level.
    """
    from app.services.task_service import create_task, list_tasks

    level = await infer_user_level(user_id)
    issues = await find_starter_issues(repo_url, level, count=count)
    if not issues:
        return {
            "level": level,
            "created_count": 0,
            "tasks": [],
            "message": "No starter issues found for this repository at the inferred difficulty level.",
        }

    existing = await list_tasks(team_id=team_id, assigned_to=user_id)
    existing_numbers = set()
    for t in existing:
        src = t.get("source_issue") or {}
        num = src.get("number")
        if num:
            existing_numbers.add(num)

    created = []
    for issue in issues:
        number = issue.get("number")
        if number in existing_numbers:
            continue
        task = await create_task(
            team_id=team_id,
            created_by=created_by,
            title=issue.get("title", "Starter task"),
            description=issue.get("body", "") or "",
            priority="medium",
            repo_url=repo_url,
            estimated_hours=issue.get("estimated_hours"),
            assigned_to=user_id,
            # Dedicated field keeps idempotency + traceability safe from the
            # AI-review agent, which overwrites ai_review on submit.
            source_issue={"number": number, "url": issue.get("url", ""), "repo_url": repo_url},
        )
        created.append(task)
        if len(created) >= count:
            break

    return {
        "level": level,
        "created_count": len(created),
        "tasks": created,
    }
