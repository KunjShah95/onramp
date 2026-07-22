"""
Agent Tasks — Heavy AI operations routed to the 'agent-tasks' queue.

Includes:
- Code health scoring
- PR review analysis
- Learning path generation
- First PR issue discovery
- Architecture exploration
- Quiz generation
- Pattern recognition

Each task is a @shared_task decorated async function. The Celery worker
provides its own async event loop, so we can safely call the same
LLMRouter / agent classes the main process uses.
"""

import logging
from typing import Optional
from celery import shared_task

logger = logging.getLogger("onramp.tasks.agent")


# ── Repo Analysis Tasks ──────────────────────────────────────────────────────

@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def score_repo_health(
    self,
    owner: str,
    repo: str,
    repo_structure: dict,
) -> dict:
    """Score a repository's code health using the HealthScorer agent.

    This is an async task, but Celery works synchronously by default.
    We use the embeded async runner to call the agent's async methods.
    """
    import asyncio
    from app.agents.health_scorer import HealthScorer
    from app.llm import LLMClient

    async def _run() -> dict:
        llm = LLMClient()
        scorer = HealthScorer(llm)
        result = await scorer.score(repo_structure)
        result["owner"] = owner
        result["repo"] = repo
        return result

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Health score failed for %s/%s", owner, repo)
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def analyze_pr_diffs(
    self,
    owner: str,
    repo: str,
    pr_number: int,
    diff_content: str,
) -> dict:
    """Run PR review analysis on a diff."""
    import asyncio
    from app.agents.pr_review import generate_pr_review
    from app.llm import LLMClient

    async def _run() -> dict:
        llm = LLMClient()
        return await generate_pr_review(llm, diff_content)

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("PR review failed for %s/%s#%d", owner, repo, pr_number)
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=1,
)
def generate_learning_path(
    self,
    user_id: str,
    repo_structure: dict,
    role: str = "developer",
) -> dict:
    """Generate a personalized learning path from a codebase structure."""
    import asyncio
    from app.agents.learning_path_generator import LearningPathGenerator
    from app.llm import LLMClient

    async def _run() -> dict:
        llm = LLMClient()
        gen = LearningPathGenerator(llm)
        path = await gen.generate(repo_structure, role=role)
        return {"user_id": user_id, "learning_path": path}

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Learning path generation failed for user %s", user_id)
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=1,
)
def find_first_pr_issues(
    self,
    owner: str,
    repo: str,
) -> list:
    """Find beginner-friendly issues for first-time contributors."""
    import asyncio
    from app.services.github_service import GitHubService

    async def _run() -> list:
        gh = GitHubService()
        issues = await gh.get_good_first_issues(owner, repo)
        return issues

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("First PR issues fetch failed for %s/%s", owner, repo)
        raise self.retry(exc=exc)
    finally:
        loop.close()



