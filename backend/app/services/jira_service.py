"""
Jira Integration Service — create and sync tasks as Jira tickets.

Supports:
  - Connection testing and project listing
  - Creating tickets from Onramp tasks
  - Updating ticket state when the Onramp task transitions
  - Incoming webhook processing for Jira → Onramp sync
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import httpx

from app.services.webhook_service import get_integration_config, save_integration_config

logger = logging.getLogger(__name__)

JIRA_BASE = "https://{site}.atlassian.net"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Helpers ────────────────────────────────────────────────────


def _build_client(base_url: str, email: str, api_token: str) -> httpx.AsyncClient:
    """Build an authenticated httpx client for Jira REST API v3."""
    return httpx.AsyncClient(
        base_url=base_url.rstrip("/"),
        auth=(email, api_token),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        timeout=15,
    )


async def get_config(user_id: str) -> Optional[dict]:
    """Get the user's Jira integration config (decrypted)."""
    cfg = await get_integration_config(user_id, "jira")
    if not cfg:
        return None
    return cfg.get("config", {})


# ── Connection & Discovery ─────────────────────────────────────


async def test_connection(config: dict) -> dict:
    """Validate Jira credentials by calling /myself."""
    base_url = config.get("base_url", "").rstrip("/")
    email = config.get("email", "")
    api_token = config.get("api_token", "")

    if not base_url or not email or not api_token:
        return {"valid": False, "error": "Missing required fields: base_url, email, api_token"}

    try:
        async with _build_client(base_url, email, api_token) as client:
            resp = await client.get("/rest/api/3/myself")
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "valid": True,
                    "display_name": data.get("displayName", ""),
                    "account_id": data.get("accountId", ""),
                }
            elif resp.status_code == 401:
                return {"valid": False, "error": "Invalid credentials — check your email and API token"}
            elif resp.status_code == 403:
                return {"valid": False, "error": "Access denied — ensure the token has appropriate permissions"}
            else:
                return {"valid": False, "error": f"Jira API returned {resp.status_code}"}
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not connect — check the base URL"}
    except Exception as e:
        return {"valid": False, "error": f"Connection error: {str(e)}"}


async def list_projects(config: dict) -> List[dict]:
    """List accessible Jira projects."""
    base_url = config.get("base_url", "").rstrip("/")
    email = config.get("email", "")
    api_token = config.get("api_token", "")

    try:
        async with _build_client(base_url, email, api_token) as client:
            resp = await client.get("/rest/api/3/project/search", params={"maxResults": 50})
            if resp.status_code == 200:
                data = resp.json()
                return [
                    {"key": p["key"], "name": p["name"], "id": p["id"]}
                    for p in data.get("values", [])
                ]
            logger.warning("Jira list_projects failed: %s", resp.status_code)
            return []
    except Exception as e:
        logger.warning("Jira list_projects error: %s", e)
        return []


async def list_issue_types(config: dict, project_key: str) -> List[dict]:
    """List available issue types for a Jira project."""
    base_url = config.get("base_url", "").rstrip("/")
    email = config.get("email", "")
    api_token = config.get("api_token", "")

    try:
        async with _build_client(base_url, email, api_token) as client:
            resp = await client.get(f"/rest/api/3/project/{project_key}")
            if resp.status_code == 200:
                data = resp.json()
                return [
                    {"id": it["id"], "name": it["name"], "subtask": it.get("subtask", False)}
                    for it in data.get("issueTypes", [])
                ]
            return []
    except Exception as e:
        logger.warning("Jira list_issue_types error: %s", e)
        return []


# ── Ticket CRUD ────────────────────────────────────────────────


ONRAMP_TO_JIRA_STATE = {
    "pending": "To Do",
    "assigned": "In Progress",
    "in_progress": "In Progress",
    "submitted": "In Review",
    "under_review": "In Review",
    "needs_changes": "To Do",
    "product_review": "In Review",
    "approved": "Done",
    "completed": "Done",
    "cancelled": "Cancelled",
}

ONRAMP_TO_JIRA_PRIORITY = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "critical": "Highest",
}


async def create_ticket(
    config: dict,
    task: dict,
    project_key: str,
    issue_type: str = "Task",
) -> Optional[dict]:
    """Create a Jira ticket from an Onramp task.

    Returns the created issue key (e.g. 'PROJ-123') on success, or None.
    """
    base_url = config.get("base_url", "").rstrip("/")
    email = config.get("email", "")
    api_token = config.get("api_token", "")

    title = task.get("title", "")
    description = task.get("description", "") or ""
    priority = ONRAMP_TO_JIRA_PRIORITY.get(task.get("priority", "medium"), "Medium")
    module = task.get("module", "") or ""

    body = (
        f"*Synced from Onramp*\n\n"
        f"{description}\n\n"
        f"---\n"
        f"Module: {module}\n"
        f"Onramp Task ID: {task.get('task_id', '')}\n"
        f"Repo: {task.get('repo_url', 'N/A')}\n"
        f"Branch: {task.get('branch', 'N/A')}"
    )

    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": title,
            "description": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": body}],
                    }
                ],
            },
            "issuetype": {"name": issue_type},
            "priority": {"name": priority},
        }
    }

    try:
        async with _build_client(base_url, email, api_token) as client:
            resp = await client.post("/rest/api/3/issue", json=payload)
            if resp.status_code == 201:
                data = resp.json()
                return {"key": data.get("key"), "id": data.get("id")}
            else:
                body_text = await resp.aread()
                logger.warning(
                    "Jira create_ticket failed (%s): %s",
                    resp.status_code,
                    body_text[:500],
                )
                return None
    except Exception as e:
        logger.warning("Jira create_ticket error: %s", e)
        return None


async def update_ticket_state(
    config: dict,
    issue_key: str,
    task: dict,
) -> bool:
    """Transition a Jira ticket to match the Onramp task state."""
    base_url = config.get("base_url", "").rstrip("/")
    email = config.get("email", "")
    api_token = config.get("api_token", "")

    target_state = ONRAMP_TO_JIRA_STATE.get(task.get("state", "pending"))
    if not target_state:
        logger.warning("No Jira state mapping for task state '%s'", task.get("state"))
        return False

    try:
        async with _build_client(base_url, email, api_token) as client:
            # 1. Fetch available transitions for this issue
            resp = await client.get(f"/rest/api/3/issue/{issue_key}/transitions")
            if resp.status_code != 200:
                logger.warning("Jira get_transitions failed: %s", resp.status_code)
                return False

            transitions = resp.json().get("transitions", [])

            # 2. Find the transition that matches our target state name
            target_id = None
            for t in transitions:
                if t.get("to", {}).get("name", "").lower() == target_state.lower():
                    target_id = t["id"]
                    break

            if not target_id:
                logger.info(
                    "No Jira transition found for state '%s' on %s. "
                    "Available: %s",
                    target_state,
                    issue_key,
                    [t.get("to", {}).get("name") for t in transitions],
                )
                return False

            # 3. Perform the transition
            transition_resp = await client.post(
                f"/rest/api/3/issue/{issue_key}/transitions",
                json={"transition": {"id": target_id}},
            )

            if transition_resp.status_code == 204:
                logger.info("Jira ticket %s → %s", issue_key, target_state)
                return True
            else:
                logger.warning(
                    "Jira transition failed for %s: %s",
                    issue_key,
                    transition_resp.status_code,
                )
                return False

    except Exception as e:
        logger.warning("Jira update_ticket_state error: %s", e)
        return False


async def add_comment(config: dict, issue_key: str, comment: str) -> bool:
    """Add a comment to a Jira issue."""
    base_url = config.get("base_url", "").rstrip("/")
    email = config.get("email", "")
    api_token = config.get("api_token", "")

    payload = {
        "body": {
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": comment}],
                }
            ],
        }
    }

    try:
        async with _build_client(base_url, email, api_token) as client:
            resp = await client.post(f"/rest/api/3/issue/{issue_key}/comment", json=payload)
            return resp.status_code == 201
    except Exception as e:
        logger.warning("Jira add_comment error: %s", e)
        return False


# ── Webhook handling ───────────────────────────────────────────


def verify_webhook_signature(
    payload_body: bytes,
    secret: str,
    signature_header: str,
) -> bool:
    """Verify Jira webhook signature."""
    expected = hmac.new(
        secret.encode(),
        payload_body,
        hashlib.sha256,
    ).hexdigest()

    # Jira sends the signature as a SHA256 digest
    return hmac.compare_digest(signature_header, expected)


def extract_issue_key(webhook_payload: dict) -> Optional[str]:
    """Extract the issue key from a Jira webhook payload."""
    issue = webhook_payload.get("issue", {})
    return issue.get("key")


def extract_issue_update(webhook_payload: dict) -> dict:
    """Extract a summary of what changed from a Jira webhook payload."""
    issue = webhook_payload.get("issue", {})
    fields = issue.get("fields", {})
    changelog = webhook_payload.get("changelog", {})

    status = fields.get("status", {}).get("name", "")
    summary = fields.get("summary", "")
    assignee = fields.get("assignee", {})
    assignee_name = assignee.get("displayName", "") if assignee else ""

    # Get the transition name from changelog
    transition_from = ""
    transition_to = ""
    for item in changelog.get("items", []):
        if item.get("field") == "status":
            transition_from = item.get("fromString", "")
            transition_to = item.get("toString", "")

    return {
        "key": issue.get("key"),
        "status": status,
        "summary": summary,
        "assignee": assignee_name,
        "transition_from": transition_from,
        "transition_to": transition_to,
    }


JIRA_TO_ONRAMP_STATE = {
    "to do": "assigned",
    "in progress": "in_progress",
    "in review": "submitted",
    "done": "approved",
    "cancelled": "cancelled",
    "closed": "completed",
}
