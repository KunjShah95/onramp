"""
GitHub webhook handler.

Accepts incoming GitHub webhook payloads, verifies HMAC-SHA256 signatures,
and processes PR events (opened, synchronize) by triggering automated code
reviews.
"""

import hashlib
import hmac
import json
import logging
import os

from fastapi import APIRouter, Header, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter()


def _verify_signature(payload_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify the HMAC-SHA256 signature from GitHub."""
    if not signature_header:
        return False
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _get_webhook_secret() -> str:
    """Get the webhook secret from environment."""
    return os.environ.get("GITHUB_WEBHOOK_SECRET", "dev-secret")


async def _handle_pr_merged(payload: dict) -> dict:
    """Handle a merged pull_request (action=closed + merged=true).

    Finds the linked Onramp task by its PR URL and auto-completes it so the
    assignee's task reflects the merge (XP already fires via complete_task).
    This is best-effort: no linked task is not an error.
    """
    pr = payload.get("pull_request", {})
    pr_url = pr.get("html_url", "")
    pr_number = pr.get("number")
    merged_by = (pr.get("merged_by") or {}).get("login", "") or (payload.get("sender") or {}).get("login", "")

    if not pr_url:
        return {"handled": False, "reason": "No PR URL in payload"}

    from app.services.task_service import get_task_by_pr_url, complete_task

    task = await get_task_by_pr_url(pr_url)
    if not task:
        return {
            "handled": True,
            "pr_number": pr_number,
            "pr_url": pr_url,
            "task_completed": False,
            "reason": "No linked Onramp task found for this PR URL",
        }

    # Only complete if the task is still in a pre-completion state.
    if task.get("state") == "completed":
        return {"handled": True, "pr_number": pr_number, "task_completed": False, "reason": "Already completed"}

    actor = task.get("assigned_to") or task.get("created_by") or ""
    try:
        # A merged PR is an implicit approval. The state machine only allows
        # ``completed`` from ``approved``, so route review-stage tasks through
        # ``approved`` first (submitted → approved → completed).
        from app.services.task_service import transition_task

        state = task.get("state")
        if state in ("submitted", "under_review", "peer_review", "product_review", "approved"):
            # ``approved`` is the only pre-completion state that may already be
            # reached — everything else routes through ``approved`` first.
            if state != "approved":
                await transition_task(
                    task["task_id"],
                    "approved",
                    actor,
                    feedback={"message": "Auto-approved — PR merged on GitHub", "source": "pr_merged_webhook"},
                )
            await complete_task(task["task_id"], actor)
        else:
            return {"handled": True, "pr_number": pr_number, "task_completed": False, "reason": f"Task in {state} state — not auto-completed"}

        logger.info(
            "PR #%d merged → auto-completed task %s (%s)",
            pr_number, task["task_id"], task.get("title", ""),
        )
        return {
            "handled": True,
            "pr_number": pr_number,
            "task_id": task["task_id"],
            "task_completed": True,
            "merged_by": merged_by,
        }
    except Exception:
        logger.exception("Failed to auto-complete task %s on PR merge", task.get("task_id"))
        return {"handled": True, "pr_number": pr_number, "task_completed": False, "reason": "Completion failed"}


async def _handle_pr_event(payload: dict, event: str) -> dict:
    """Handle a pull_request event (opened, synchronize, closed/merged).

    ``opened``/``synchronize`` trigger a code review; ``closed`` with
    ``merged=true`` auto-completes the linked Onramp task.
    """
    action = payload.get("action", "")
    if action == "closed":
        pr = payload.get("pull_request", {})
        if pr.get("merged"):
            return await _handle_pr_merged(payload)
        return {"handled": False, "reason": "PR closed without merge"}
    if action not in ("opened", "synchronize"):
        return {"handled": False, "reason": f"Unsupported action: {action}"}

    pr = payload.get("pull_request", {})
    repo = payload.get("repository", {})

    pr_data = {
        "pr_number": pr.get("number"),
        "pr_title": pr.get("title", ""),
        "pr_url": pr.get("html_url", ""),
        "repo_full_name": repo.get("full_name", ""),
        "action": action,
        "sender": payload.get("sender", {}).get("login", ""),
        "base_branch": (pr.get("base") or {}).get("ref", ""),
        "head_branch": (pr.get("head") or {}).get("ref", ""),
    }

    # In production, this would trigger an async celery task for AI review
    logger.info(
        "PR %s #%d in %s (%s → %s) by %s",
        action, pr_data["pr_number"], pr_data["repo_full_name"],
        pr_data["head_branch"], pr_data["base_branch"],
        pr_data["sender"],
    )

    return {
        "handled": True,
        "action": action,
        "pr_data": pr_data,
        "review_triggered": True,
    }


async def _handle_push_event(payload: dict) -> dict:
    """Handle a push event (basic logging for now)."""
    repo = payload.get("repository", {})
    ref = payload.get("ref", "")
    commits = payload.get("commits", [])

    logger.info(
        "Push to %s ref %s with %d commits",
        repo.get("full_name", ""), ref, len(commits),
    )

    return {
        "handled": True,
        "ref": ref,
        "commit_count": len(commits),
    }


async def _handle_issue_comment_event(payload: dict) -> dict:
    """Handle an issue_comment event on a PR."""
    action = payload.get("action", "")
    issue = payload.get("issue", {})
    comment = payload.get("comment", {})

    if "pull_request" not in issue:
        return {"handled": False, "reason": "Comment is not on a PR"}

    logger.info(
        "Issue comment %s on PR #%d by %s",
        action, issue.get("number"), comment.get("user", {}).get("login", ""),
    )

    return {
        "handled": True,
        "action": action,
        "pr_number": issue.get("number"),
        "comment_body": comment.get("body", "")[:200],
    }


@router.post("/webhooks/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(""),
    x_hub_signature_256: str = Header(""),
):
    """Receive and process GitHub webhook events.

    Verifies the HMAC-SHA256 signature before processing.
    """
    # Read raw body
    body = await request.body()

    # Verify signature
    secret = _get_webhook_secret()
    if not _verify_signature(body, x_hub_signature_256, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Route by event type
    if x_github_event == "pull_request":
        result = await _handle_pr_event(payload, x_github_event)
    elif x_github_event == "push":
        result = await _handle_push_event(payload)
    elif x_github_event == "issue_comment":
        result = await _handle_issue_comment_event(payload)
    else:
        result = {"handled": False, "event": x_github_event, "reason": "Unsupported event type"}

    return {"success": True, "event": x_github_event, "result": result}
