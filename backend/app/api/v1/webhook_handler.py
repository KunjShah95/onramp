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
import re

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
    """Get the webhook secret from environment.

    Returns None when not configured; callers must treat None as verification
    failure (fail-closed) rather than falling back to a known-default string.
    """
    return os.environ.get("GITHUB_WEBHOOK_SECRET") or ""


def _extract_issue_refs(payload: dict) -> set:
    """Parse GitHub issue numbers referenced from a PR title/body.

    Recognizes GitHub's closing keywords (``closes #12``, ``fixes #12`` …) plus
    bare ``#123`` references. PRs inherit the number space of issues, so a PR
    that fixes ``#41`` can be matched straight back to the Onramp task that
    seeded issue ``#41`` in the same repository.
    """
    pr = payload.get("pull_request", {})
    body = pr.get("body") or ""
    title = pr.get("title") or ""
    refs = set()
    closing = re.findall(r"(?i)\b(?:clos(?:e|es|ed)|f(?:i)x(?:es)?ed?|resolve[sd]?)\s+#?(\d+)", body)
    refs.update(int(n) for n in closing)
    bare = re.findall(r"#(\d+)", body + " " + title)
    refs.update(int(n) for n in bare)
    return refs


def _repo_url_from_payload(payload: dict) -> str:
    repo = payload.get("repository", {})
    return (repo.get("html_url") or repo.get("clone_url") or "").strip().rstrip("/").lower()


def _pr_author_login(payload: dict) -> str:
    pr = payload.get("pull_request", {}) or {}
    return (pr.get("user") or {}).get("login", "") or (payload.get("sender") or {}).get("login", "")


async def _find_tasks_by_author(repo_url: str, login: str) -> list:
    """Return tasks assigned to the GitHub user ``login`` for ``repo_url``.

    Looks up the developer by their stored ``github_username`` (persisted during
    GitHub OAuth / account linking) and returns every task whose
    ``source_issue.repo_url`` matches, regardless of state.
    """
    if not login:
        return []
    try:
        from app.services.postgres_db import get_storage

        storage = get_storage()
        users = await storage.query_documents("users", [("github_username", "==", login)])
    except Exception:
        logger.exception("Failed to look up github identity for %s", login)
        return []

    tasks = []
    seen = set()
    for u in users:
        uid = u.get("id") or u.get("uid")
        if not uid:
            continue
        try:
            owned = await storage.query_documents("onramp_tasks", [("assigned_to", "==", uid)])
        except Exception:
            logger.exception("Failed to query tasks assigned to %s", uid)
            continue
        for t in owned:
            src = t.get("source_issue")
            if not isinstance(src, dict):
                continue
            if (src.get("repo_url") or "").strip().rstrip("/").lower() == repo_url:
                tid = t.get("task_id")
                if tid and tid not in seen:
                    seen.add(tid)
                    tasks.append(t)
    return tasks


async def _find_matching_tasks(payload: dict) -> list[dict]:
    """Associate a PR with the Onramp tasks it belongs to.

    Tier 1 — source-issue match: the PR title/body references ``#N`` and a task
    was seeded from that same issue in this repo (unambiguous).
    Tier 2 — author match: the PR author's GitHub identity maps to a user with
    exactly one candidate task in this repo (unambiguous).
    """
    repo_url = _repo_url_from_payload(payload)
    if not repo_url:
        return []

    from app.services.task_service import find_tasks_by_source_issue

    matched = []
    seen = set()
    for issue_num in _extract_issue_refs(payload):
        for t in await find_tasks_by_source_issue(repo_url, issue_num):
            tid = t.get("task_id")
            if tid and tid not in seen:
                seen.add(tid)
                matched.append(t)
    if matched:
        return matched

    author_tasks = await _find_tasks_by_author(repo_url, _pr_author_login(payload))
    return author_tasks if len(author_tasks) == 1 else []


async def _link_pr_to_tasks(payload: dict) -> dict:
    """Auto-link an opened/synchronized PR to matching tasks.

    Stores the PR URL (plus author + PR number) on every matching non-terminal
    task, so the developer never needs to paste a PR link — the merge webhook
    later resolves the task by ``pr_url``.
    """
    pr = payload.get("pull_request", {})
    pr_url = pr.get("html_url", "")
    pr_number = pr.get("number")
    author = _pr_author_login(payload)

    if not pr_url:
        return {"linked": 0}

    from app.services.task_service import update_task

    tasks = await _find_matching_tasks(payload)
    linked = 0
    linked_ids = []
    for t in tasks:
        if t.get("state") in ("completed", "cancelled"):
            continue
        tid = t.get("task_id")
        if not tid:
            continue
        updates = {"pr_url": pr_url, "github_pr_author": author}
        if pr_number is not None:
            updates["github_pr_number"] = pr_number
        try:
            await update_task(tid, updates)
            linked += 1
            linked_ids.append(tid)
        except Exception:
            logger.exception("Failed to auto-link PR %s to task %s", pr_url, tid)
    return {"linked": linked, "task_ids": linked_ids}


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

    # No pasted/auto-linked PR URL yet — fall back to issue/author matching so
    # tasks from the first-PR flow can still auto-complete on merge.
    if not task:
        matches = await _find_matching_tasks(payload)
        uncompleted = [t for t in matches if t.get("state") not in ("completed", "cancelled")]
        if len(uncompleted) == 1:
            task = uncompleted[0]

    if not task:
        return {
            "handled": True,
            "pr_number": pr_number,
            "pr_url": pr_url,
            "task_completed": False,
            "reason": "No linked Onramp task found for this PR URL",
        }

    # Stamp the merge on the task (best-effort, never blocks completion). This
    # is the attribution that lets the ramp summary compute time-to-first-
    # merged-PR for teams WITHOUT linked GitHub accounts: the task's assignee
    # is the trainee, so no login→user mapping is required. Annotation-only —
    # writes even when the task is already completed.
    try:
        from app.services.task_service import stamp_pr_merged

        await stamp_pr_merged(task["task_id"])
    except Exception:
        logger.exception("Failed to stamp pr_merged_at on task %s", task.get("task_id"))

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

        # Auto-close the originating GitHub issue — the task is now approved
        # (auto-approved on merge) and the PR has merged. Only tasks seeded
        # from a real GitHub issue carry a source_issue with a number.
        closed = False
        src = task.get("source_issue") or {}
        src_number = src.get("number")
        src_repo = src.get("repo_url")
        if src_number and src_repo:
            try:
                from app.services.github_service import GitHubService

                gh = GitHubService(os.getenv("GITHUB_TOKEN"))
                closed = await gh.close_issue(
                    src_repo,
                    int(src_number),
                    comment=(
                        f"Closed automatically — fixed by PR #{pr_number} "
                        f"({pr_url}) which has been merged and approved."
                    ),
                )
                if closed:
                    logger.info("Auto-closed source issue #%s (%s)", src_number, src_repo)
            except Exception:
                logger.exception("Failed to auto-close source issue #%s", src_number)

        return {
            "handled": True,
            "pr_number": pr_number,
            "task_id": task["task_id"],
            "task_completed": True,
            "source_issue_closed": closed,
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

    # Auto-link the PR to any Onramp task seeded from a matching issue, so the
    # developer never needs to paste their PR URL (merge webhook uses it later).
    link_result = await _link_pr_to_tasks(payload)

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
        "auto_linked_tasks": link_result.get("task_ids", []),
    }


async def _handle_push_event(payload: dict) -> dict:
    """Handle a push event — the evolution feedback loop.

    For pushes to a *registered* repository's default branch, this:

    1. evicts the repo's LLM cache scope (``evict_scope``) so stale cached
       answers about the old code are dropped immediately, and
    2. dispatches ``build_repo_index`` (Celery, async) so the index is
       rebuilt with the new HEAD and fresh git-evolution data — the next
       request hits a warm, up-to-date index instead of stale context.

    Pushes to unknown repos / other branches are acknowledged but ignored
    (the nightly sweep covers unregistered repos).
    """
    repo = payload.get("repository", {})
    ref = payload.get("ref", "")
    commits = payload.get("commits", [])
    branch = ref.rsplit("/", 1)[-1] if ref else "main"
    repo_url = repo.get("html_url") or repo.get("clone_url") or ""
    full_name = repo.get("full_name", "")

    logger.info(
        "Push to %s ref %s with %d commits", full_name, ref, len(commits),
    )

    # Only registered repos get the rebuild + invalidation treatment.
    registered = False
    try:
        from app.services.postgres_db import get_storage

        rows = await get_storage().list_documents("repositories") or []
        if repo_url:
            registered = any((r.get("url") or "").strip() == repo_url for r in rows)
        if not registered:
            for r in rows:
                if (
                    f"{r.get('owner') or ''}/{r.get('name') or ''}".strip("/")
                    == full_name.lower()
                ):
                    registered = True
                    break
    except Exception:
        logger.exception("Failed to check repositories registry for %s", full_name)

    if not registered:
        return {
            "handled": True,
            "ref": ref,
            "commit_count": len(commits),
            "rebuild_triggered": False,
            "reason": "Repository is not registered for indexing",
        }

    from app.services.repo_context import index_id_for

    _branch = branch or "main"
    scope = index_id_for(repo_url, _branch) if repo_url else f"repo:{full_name}"

    # 1) Drop stale cached LLM answers for this repo (exact + semantic tiers).
    evicted = 0
    try:
        from app.services import llm_cache

        evicted = await llm_cache.evict_scope(scope)
    except Exception:
        logger.exception("Failed to evict LLM cache scope %s", scope)

    # 2) Rebuild the index async (Celery agent-tasks queue).
    dispatched = False
    task_id = ""
    if repo_url:
        try:
            import app.tasks.repo_index_tasks as _repo_index_tasks

            result = _repo_index_tasks.build_repo_index.delay(
                repo_url, branch=_branch, force=True, scope=scope
            )
            task_id = getattr(result, "id", "")
            dispatched = True
        except Exception:
            logger.exception("Failed to dispatch index rebuild for %s", repo_url)

    return {
        "handled": True,
        "ref": ref,
        "branch": _branch,
        "commit_count": len(commits),
        "repo_url": repo_url,
        "rebuild_triggered": dispatched,
        "task_id": task_id,
        "cache_entries_evicted": evicted,
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
    if not secret:
        logger.error("GITHUB_WEBHOOK_SECRET is not configured — rejecting all webhook requests")
        raise HTTPException(status_code=401, detail="Webhook secret not configured")
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
