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

import os
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
        # Session-aware: create ephemeral health_scorer session if DB available
        sess_id = None
        try:
            from app.services.agent_context import agent_context
            sess = await agent_context.create_session(agent_type="health_scorer", scratchpad={"owner": owner, "repo": repo})
            sess_id = sess["id"]
        except Exception:
            pass
        scorer = HealthScorer(llm, session_id=sess_id) if sess_id else HealthScorer(llm)
        result = await scorer.score(repo_structure)
        result["owner"] = owner
        result["repo"] = repo
        if sess_id:
            try:
                from app.services.agent_context import agent_context as _ac
                from app.services.agent_bus import agent_bus as _bus
                await _ac.set_state(sess_id, "completed")
                await _bus.publish("agent.health_scored", payload={"owner": owner, "repo": repo, "score": result.get("score"), "session_id": sess_id}, source_session_id=sess_id, source_agent="health_scorer")
            except Exception:
                pass
        return result

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Health score failed for %s/%s", owner, repo)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
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
        sess_id = None
        try:
            from app.services.agent_context import agent_context
            sess = await agent_context.create_session(agent_type="pr_review", scratchpad={"owner": owner, "repo": repo, "pr_number": pr_number})
            sess_id = sess["id"]
        except Exception:
            pass
        # generate_pr_review is a function, not BaseAgent; log to session manually
        result = await generate_pr_review(llm, diff_content)
        if sess_id:
            try:
                from app.services.agent_context import agent_context as _ac
                from app.services.agent_bus import agent_bus as _bus
                await _ac.append_message(sess_id, role="assistant", content=str(result)[:4000], agent_type="pr_review")
                await _ac.set_state(sess_id, "completed")
                await _bus.publish("agent.pr_reviewed", payload={"owner": owner, "repo": repo, "pr_number": pr_number, "session_id": sess_id}, source_session_id=sess_id, source_agent="pr_review")
            except Exception:
                pass
        return result

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("PR review failed for %s/%s#%d", owner, repo, pr_number)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
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
        sess_id = None
        try:
            from app.services.agent_context import agent_context
            sess = await agent_context.create_session(agent_type="learning_path_generator", user_id=user_id, scratchpad={"role": role})
            sess_id = sess["id"]
        except Exception:
            pass
        gen = LearningPathGenerator(llm, session_id=sess_id) if sess_id else LearningPathGenerator(llm)
        path = await gen.generate(repo_structure, role=role)
        if sess_id:
            try:
                from app.services.agent_context import agent_context as _ac
                from app.services.agent_bus import agent_bus as _bus
                await _ac.set_state(sess_id, "completed")
                await _bus.publish("agent.learning_path.generated", payload={"user_id": user_id, "role": role, "session_id": sess_id}, source_session_id=sess_id, source_agent="learning_path_generator")
            except Exception:
                pass
        return {"user_id": user_id, "learning_path": path, "session_id": sess_id}

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Learning path generation failed for user %s", user_id)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
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
        repo_url = f"https://github.com/{owner}/{repo}"
        # Use existing get_issues with the standard "good first issue" label.
        issues = await gh.get_issues(repo_url, labels=["good first issue", "good-first-issue"])
        return [i.__dict__ if hasattr(i, "__dict__") else i for i in issues]

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("First PR issues fetch failed for %s/%s", owner, repo)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()


# ── Autonomous Coding Task ───────────────────────────────────────────────────

@shared_task(
    queue="agent-tasks",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
    acks_late=True,
    track_started=True,
)
def autonomous_code_change(
    self,
    repo_url: str,
    issue_description: str,
    branch_name: str = "",
    base_branch: str = "main",
) -> dict:
    """Run the autonomous coding agent to implement an issue and open a PR.

    Runs as a background Celery task so the caller gets an immediate
    task ID and can poll for the result.
    """
    import asyncio
    from app.agents.coding_agent import AutonomousCodingAgent
    from app.llm import LLMClient

    async def _run() -> dict:
        llm = LLMClient()
        github_token = os.getenv("GITHUB_TOKEN")
        sess_id = None
        try:
            from app.services.agent_context import agent_context
            from app.services.repo_context import index_id_for
            idx = index_id_for(repo_url, base_branch)
            sess = await agent_context.create_session(agent_type="coding_agent", index_id=idx, scratchpad={"repo_url": repo_url, "issue": issue_description[:500]})
            sess_id = sess["id"]
        except Exception:
            pass
        agent = AutonomousCodingAgent(llm, github_token=github_token, session_id=sess_id) if sess_id else AutonomousCodingAgent(llm, github_token=github_token)
        result = await agent.execute(
            repo_url=repo_url,
            issue_description=issue_description,
            branch_name=branch_name or f"ai/{asyncio.get_event_loop().time():.0f}",
            base_branch=base_branch,
        )
        if sess_id:
            try:
                from app.services.agent_context import agent_context as _ac
                from app.services.agent_bus import agent_bus as _bus
                await _ac.set_state(sess_id, "completed" if result.get("success") else "failed")
                await _bus.publish("agent.coding.completed", payload={"repo_url": repo_url, "success": result.get("success"), "pr_url": result.get("pr_url"), "session_id": sess_id}, source_session_id=sess_id, source_agent="coding_agent")
            except Exception:
                pass
        result["session_id"] = sess_id
        return result

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_run())
        logger.info(
            "Autonomous coding %s for %s: %s",
            "succeeded" if result.get("success") else "failed",
            repo_url,
            result.get("pr_url", "no PR created"),
        )
        return result
    except Exception as exc:
        logger.exception("Autonomous coding failed for %s", repo_url)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()



