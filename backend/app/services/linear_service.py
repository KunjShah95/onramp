"""
Linear Integration Service — create and sync tasks as Linear issues.

Supports:
  - Connection testing and team listing
  - Creating issues from Onramp tasks
  - Updating issue state when the Onramp task transitions
  - Incoming webhook processing for Linear → Onramp sync
"""

import hashlib
import hmac
import json
import logging
from typing import Optional, List, Dict, Any

import httpx

from app.services.webhook_service import get_integration_config

logger = logging.getLogger(__name__)

LINEAR_API_URL = "https://api.linear.app/graphql"


def _build_client(api_key: str) -> httpx.AsyncClient:
    """Build an authenticated httpx client for the Linear GraphQL API."""
    return httpx.AsyncClient(
        base_url=LINEAR_API_URL,
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
        },
        timeout=15,
    )


async def get_config(user_id: str) -> Optional[dict]:
    """Get the user's Linear integration config."""
    cfg = await get_integration_config(user_id, "linear")
    if not cfg:
        return None
    return cfg.get("config", {})


# ── Connection & Discovery ─────────────────────────────────────


async def test_connection(api_key: str) -> dict:
    """Validate Linear API key by fetching the viewer (current user)."""
    if not api_key:
        return {"valid": False, "error": "Missing API key"}

    query = """
    query {
      viewer {
        id
        name
        email
      }
    }
    """

    try:
        async with _build_client(api_key) as client:
            resp = await client.post("", json={"query": query})
            if resp.status_code == 200:
                data = resp.json()
                if data.get("data", {}).get("viewer"):
                    viewer = data["data"]["viewer"]
                    return {
                        "valid": True,
                        "name": viewer.get("name", ""),
                        "email": viewer.get("email", ""),
                        "id": viewer.get("id", ""),
                    }
                errors = data.get("errors", [])
                if errors:
                    msg = errors[0].get("message", "Unknown error")
                    if "403" in msg or "forbidden" in msg.lower():
                        return {"valid": False, "error": "API key lacks permissions"}
                    return {"valid": False, "error": msg}
                return {"valid": False, "error": "Could not authenticate"}
            elif resp.status_code == 401:
                return {"valid": False, "error": "Invalid API key"}
            else:
                return {"valid": False, "error": f"Linear API returned {resp.status_code}"}
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not connect to Linear API"}
    except Exception as e:
        return {"valid": False, "error": f"Connection error: {str(e)}"}


async def list_teams(api_key: str) -> List[dict]:
    """List accessible Linear teams."""
    query = """
    query {
      teams {
        nodes {
          id
          name
          key
          issueCount
        }
      }
    }
    """

    try:
        async with _build_client(api_key) as client:
            resp = await client.post("", json={"query": query})
            if resp.status_code == 200:
                data = resp.json()
                nodes = data.get("data", {}).get("teams", {}).get("nodes", [])
                return [
                    {"id": t["id"], "name": t["name"], "key": t["key"]}
                    for t in nodes
                ]
            return []
    except Exception as e:
        logger.warning("Linear list_teams error: %s", e)
        return []


async def list_workflow_states(api_key: str, team_id: str) -> List[dict]:
    """List available workflow states for a Linear team."""
    query = """
    query($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
          type
        }
      }
    }
    """

    try:
        async with _build_client(api_key) as client:
            resp = await client.post(
                "",
                json={"query": query, "variables": {"teamId": team_id}},
            )
            if resp.status_code == 200:
                data = resp.json()
                nodes = data.get("data", {}).get("workflowStates", {}).get("nodes", [])
                return [{"id": n["id"], "name": n["name"], "type": n.get("type")} for n in nodes]
            return []
    except Exception as e:
        logger.warning("Linear list_workflow_states error: %s", e)
        return []


# ── Issue CRUD ────────────────────────────────────────────────


ONRAMP_TO_LINEAR_STATE = {
    "pending": "backlog",
    "assigned": "in_progress",
    "in_progress": "in_progress",
    "submitted": "in_review",
    "under_review": "in_review",
    "needs_changes": "todo",
    "product_review": "in_review",
    "approved": "done",
    "completed": "done",
    "cancelled": "canceled",
}

ONRAMP_TO_LINEAR_PRIORITY = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


async def create_issue(
    api_key: str,
    task: dict,
    team_id: str,
    project_id: Optional[str] = None,
) -> Optional[dict]:
    """Create a Linear issue from an Onramp task.

    Returns the created issue id and identifier (e.g. 'TEAM-123') on success.
    """
    title = task.get("title", "")
    description = task.get("description", "") or ""
    priority = ONRAMP_TO_LINEAR_PRIORITY.get(task.get("priority", "medium"), 2)

    body = (
        f"*Synced from Onramp*\n\n"
        f"{description}\n\n"
        f"---\n"
        f"Module: {task.get('module', '')}\n"
        f"Onramp Task ID: {task.get('task_id', '')}\n"
        f"Repo: {task.get('repo_url', 'N/A')}\n"
        f"Branch: {task.get('branch', 'N/A')}"
    )

    mutation = """
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
    """

    variables = {
        "input": {
            "title": title,
            "description": body,
            "teamId": team_id,
            "priority": priority,
        }
    }

    if project_id:
        variables["input"]["projectId"] = project_id

    try:
        async with _build_client(api_key) as client:
            resp = await client.post(
                "",
                json={"query": mutation, "variables": variables},
            )
            if resp.status_code == 200:
                data = resp.json()
                result = data.get("data", {}).get("issueCreate", {})
                if result.get("success") and result.get("issue"):
                    issue = result["issue"]
                    return {
                        "id": issue["id"],
                        "identifier": issue["identifier"],
                        "title": issue["title"],
                        "url": issue["url"],
                    }
                errors = data.get("errors", [])
                if errors:
                    logger.warning("Linear create_issue error: %s", errors[0].get("message"))
                return None
            else:
                body_text = await resp.aread()
                logger.warning("Linear create_issue failed (%s): %s", resp.status_code, body_text[:500])
                return None
    except Exception as e:
        logger.warning("Linear create_issue error: %s", e)
        return None


async def update_issue_state(
    api_key: str,
    issue_id: str,
    task: dict,
    team_id: str,
) -> bool:
    """Transition a Linear issue to match the Onramp task state."""
    target_state_type = ONRAMP_TO_LINEAR_STATE.get(task.get("state", "pending"))
    if not target_state_type:
        logger.warning("No Linear state mapping for task state '%s'", task.get("state"))
        return False

    # 1. Look up the workflow state ID by type
    states = await list_workflow_states(api_key, team_id)
    target_state = None
    for s in states:
        if s.get("type", "").lower() == target_state_type.lower():
            target_state = s
            break

    if not target_state:
        logger.warning(
            "No Linear workflow state found with type '%s'. Available: %s",
            target_state_type,
            [s.get("type", s.get("name")) for s in states],
        )
        return False

    # 2. Perform the update
    mutation = """
    mutation($input: IssueUpdateInput!, $id: String!) {
      issueUpdate(input: $input, id: $id) {
        success
        issue {
          id
          identifier
          state {
            name
            type
          }
        }
      }
    }
    """

    variables = {
        "id": issue_id,
        "input": {
            "stateId": target_state["id"],
        },
    }

    try:
        async with _build_client(api_key) as client:
            resp = await client.post(
                "",
                json={"query": mutation, "variables": variables},
            )
            if resp.status_code == 200:
                data = resp.json()
                result = data.get("data", {}).get("issueUpdate", {})
                if result.get("success"):
                    logger.info("Linear issue %s → %s", issue_id, target_state["name"])
                    return True
                errors = data.get("errors", [])
                if errors:
                    logger.warning("Linear update_issue_state error: %s", errors[0].get("message"))
                return False
            logger.warning("Linear update_issue_state failed: %s", resp.status_code)
            return False
    except Exception as e:
        logger.warning("Linear update_issue_state error: %s", e)
        return False


async def add_comment(api_key: str, issue_id: str, body: str) -> bool:
    """Add a comment to a Linear issue."""
    mutation = """
    mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
      }
    }
    """

    variables = {
        "input": {
            "issueId": issue_id,
            "body": body,
        }
    }

    try:
        async with _build_client(api_key) as client:
            resp = await client.post(
                "",
                json={"query": mutation, "variables": variables},
            )
            return resp.status_code == 200 and resp.json().get("data", {}).get("commentCreate", {}).get("success", False)
    except Exception as e:
        logger.warning("Linear add_comment error: %s", e)
        return False


# ── Webhook handling ───────────────────────────────────────────


def verify_webhook_signature(
    payload_body: bytes,
    secret: str,
    signature_header: str,
) -> bool:
    """Verify Linear webhook signature."""
    expected = hmac.new(
        secret.encode(),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature_header)


def extract_issue_update(webhook_payload: dict) -> Optional[dict]:
    """Extract issue update info from a Linear webhook payload."""
    data = webhook_payload.get("data", {})
    issue = data.get("issue", {}) or data.get("updatedIssue", {}) or data.get("createdIssue", {})

    if not issue:
        return None

    return {
        "id": issue.get("id"),
        "identifier": issue.get("identifier"),
        "title": issue.get("title"),
        "state": issue.get("state", {}).get("name", ""),
        "state_type": issue.get("state", {}).get("type", ""),
        "assignee": issue.get("assignee", {}).get("name", "") if issue.get("assignee") else "",
        "url": issue.get("url", ""),
    }
