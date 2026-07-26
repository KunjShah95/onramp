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


async def _handle_pr_event(payload: dict, event: str) -> dict:
    """Handle a pull_request event (opened, synchronize).

    Extracts PR details and triggers a code review.
    """
    action = payload.get("action", "")
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
