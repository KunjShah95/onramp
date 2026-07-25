import logging
import os
from typing import Optional, Dict, List
import httpx

from app.services.webhook_service import get_integration_config
from app.services.notification_service import get_preferences

logger = logging.getLogger("onramp.slack")

# ── Event type mapping: notification type → webhook event name ───

NOTIF_TYPE_TO_SLACK_EVENT = {
    "task_assigned": "Task Assigned",
    "task_started": "Task Started",
    "task_submitted": "Task Submitted",
    "task_reviewed": "Task Reviewed",
    "task_approved": "Task Approved",
    "task_needs_changes": "Changes Requested",
    "task_completed": "Task Completed",
    "task_cancelled": "Task Cancelled",
    "module_granted": "Module Access Granted",
    "team_invite": "Team Invite",
    "system_alert": "System Alert",
    "pr_merged": "PR Merged",
    "milestone_reached": "Milestone Reached",
}


def _format_task_message(task: dict, event: str, actor_name: str = "") -> str:
    """Format a Slack message for a task event."""
    title = task.get("title", "Untitled")
    module = task.get("module", "")
    state = task.get("state", "")
    task_id = task.get("task_id", "")
    pr_url = task.get("pr_url", "")

    header = f":memo: *{event}*"
    lines = [header, ""]

    lines.append(f"*Task:* {title}")
    if module:
        lines.append(f"*Module:* `{module}`")
    if task_id:
        lines.append(f"*ID:* `{task_id}`")
    if state:
        lines.append(f"*Status:* `{state}`")
    if actor_name:
        lines.append(f"*By:* {actor_name}")
    if pr_url:
        lines.append(f"*PR:* <{pr_url}|View Pull Request>")

    lines.append("")
    lines.append(":arrow_right: <https://onramp.app/tasks/" + task_id + "|View in Onramp>")

    return "\n".join(lines)


def _format_module_message(module: str, source: str) -> str:
    """Format a Slack message for a module grant event."""
    return (
        f":unlock: *Module Access Granted*\n\n"
        f"You now have access to module: `{module}`\n"
        f"*Source:* {source}\n\n"
        f":arrow_right: <https://onramp.app/tasks|View your tasks>"
    )


class SlackService:
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url

    async def post_message(self, text: str, channel: str = "#general") -> bool:
        if not self.webhook_url:
            return False
        payload = {"channel": channel, "text": text, "mrkdwn": True}
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.webhook_url, json=payload)
            return resp.is_success

    def format_good_first_issues(self, issues: list) -> str:
        if not issues:
            return "No good first issues found today :tada:"

        lines = [f"*Good First Issues for Juniors ({len(issues)} found)*\n"]
        for i, issue in enumerate(issues[:10], 1):
            title = issue.get("title", "Untitled")
            hours = issue.get("estimated_hours", "?")
            url = issue.get("url", "")
            score = issue.get("complexity_score", "?")
            lines.append(f"{i}. <{url}|{title}> ({hours}h, complexity: {score})")

        return "\n".join(lines)

    def format_health_report(self, repo: str, health: dict) -> str:
        score = health.get("overall_score", 0)
        lines = [
            f"*Onramp Health Report: {repo}*\n",
            f"Overall Score: {score}/100",
            f"Test Coverage: {health.get('test_coverage', 0)}%",
            f"Maintainability: {health.get('maintainability', 0)}/10",
            f"Complexity: {health.get('complexity', 'unknown')}\n",
        ]
        recs = health.get("recommendations", [])
        if recs:
            lines.append("*Recommendations:*")
            for r in recs:
                lines.append(f"• {r}")

        return "\n".join(lines)


# ── Slack Notification Dispatch ────────────────────────────────


async def _get_slack_config(user_id: str) -> Optional[Dict[str, str]]:
    """Get the user's configured Slack webhook URL and channel."""
    try:
        config = await get_integration_config(user_id, "slack")
        if config:
            cfg = config.get("config", {})
            webhook_url = cfg.get("webhook_url")
            if webhook_url:
                return {
                    "webhook_url": webhook_url,
                    "channel": cfg.get("channel", "#general"),
                }
    except Exception:
        logger.exception("Failed to fetch Slack integration config for %s", user_id)
    return None


async def _is_slack_event_enabled(user_id: str, notif_type: str) -> bool:
    """Check if a user has Slack notifications enabled for this event type."""
    try:
        prefs = await get_preferences(user_id)
        channels = prefs.get("channels", {})
        slack_prefs = channels.get("slack", {})
        return slack_prefs.get(notif_type, False)
    except Exception:
        logger.exception("Failed to check Slack notification preferences for %s", user_id)
    return False


def _get_slack_event_name(notif_type: str) -> str:
    """Map internal notification type to human-readable Slack event name."""
    return NOTIF_TYPE_TO_SLACK_EVENT.get(notif_type, notif_type.replace("_", " ").title())


async def send_slack_task_notification(
    user_id: str,
    notif_type: str,
    task: dict,
    actor_name: str = "",
) -> bool:
    """Send a Slack notification for a task event if the user has Slack enabled.

    Checks the user's Slack integration config and notification preferences
    before sending. Returns True if the message was sent successfully.
    """
    # 1. Check if the user has Slack notifications enabled for this event type
    if not await _is_slack_event_enabled(user_id, notif_type):
        return False

    # 2. Get the user's Slack webhook URL and channel
    slack_cfg = await _get_slack_config(user_id)
    if not slack_cfg:
        return False

    # 3. Format and send the message
    event_name = _get_slack_event_name(notif_type)
    message = _format_task_message(task, event_name, actor_name)

    slack = SlackService(slack_cfg["webhook_url"])
    try:
        success = await slack.post_message(message, channel=slack_cfg["channel"])
        if success:
            logger.info("Slack notification sent to %s for event %s", user_id, notif_type)
        else:
            logger.warning("Slack notification failed for %s (event: %s)", user_id, notif_type)
        return success
    except Exception:
        logger.exception("Slack notification error for %s (event: %s)", user_id, notif_type)
        return False


async def send_slack_module_granted(
    user_id: str,
    module: str,
    source: str = "manual",
) -> bool:
    """Send a Slack notification for a module grant."""
    if not await _is_slack_event_enabled(user_id, "module_granted"):
        return False

    slack_cfg = await _get_slack_config(user_id)
    if not slack_cfg:
        return False

    message = _format_module_message(module, source)
    slack = SlackService(slack_cfg["webhook_url"])
    try:
        success = await slack.post_message(message, channel=slack_cfg["channel"])
        if success:
            logger.info("Slack module grant notification sent to %s for module %s", user_id, module)
        return success
    except Exception:
        logger.exception("Slack module grant notification error for %s", user_id)
        return False


# ── Daily Standup → Slack Block Kit ─────────────────────────────
# Replaces the CLI daily-update flow (scripts/daily_update.py) with a
# Slack-native workflow. `format_daily_update` renders a standup note plus
# the auto-digest sections as Block Kit blocks; `post_to_slack` ships them to
# the incoming-webhook URL (SLACK_WEBHOOK_URL). Both are dependency-light and
# importable without a webhook configured.

_SECTION_EMOJI = {
    "Unread Notifications": ":bell:",
    "Task Activity": ":clipboard:",
    "Modules Unlocked": ":unlock:",
    "Quiz Results": ":memo:",
    "Pending Reviews": ":eyes:",
}


def format_daily_update(
    user_name: str,
    date: str,
    message: str,
    sections: Optional[List[dict]] = None,
) -> List[dict]:
    """Render a daily standup note + digest sections as Slack Block Kit blocks.

    Args:
        user_name: Display name of the junior submitting the standup.
        date: ISO date string (YYYY-MM-DD) for the standup.
        message: Free-text standup note (may be empty).
        sections: Digest sections from digest_service.build_digest_sections(),
            each shaped {title, items: [{emoji, text, subtitle}], cta?}.

    Returns:
        A list of Block Kit block dicts suitable for an incoming webhook or a
        slash-command response ("blocks": [...]).
    """
    sections = sections or []
    blocks: List[dict] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f":sunrise: Daily standup — {user_name}",
                "emoji": True,
            },
        },
        {
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"*Date:* {date}"},
            ],
        },
    ]

    note = (message or "").strip()
    if note:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f":speech_balloon: *Note to senior:*\n>{note}"},
        })
    else:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": "_No free-text note — digest only._"},
        })

    blocks.append({"type": "divider"})

    if not sections:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": ":zzz: _No tracked activity in the last 24h._"},
        })
        return blocks

    for s in sections:
        title = s.get("title", "Activity")
        header_emoji = _SECTION_EMOJI.get(title, ":small_blue_diamond:")
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"{header_emoji} *{title}*"},
        })

        lines: List[str] = []
        for item in s.get("items", []):
            emoji = item.get("emoji", "•")
            text = item.get("text", "")
            subtitle = item.get("subtitle")
            line = f"{emoji} {text}"
            if subtitle:
                line += f"  _{subtitle}_"
            lines.append(line)

        if lines:
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": "\n".join(lines)},
            })

        cta = s.get("cta")
        if cta and cta.get("text") and cta.get("url"):
            blocks.append({
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"<{cta['url']}|{cta['text']} →>"},
                ],
            })

    return blocks


async def post_to_slack(blocks: List[dict]) -> bool:
    """POST Block Kit blocks to the SLACK_WEBHOOK_URL incoming webhook.

    Graceful no-op if SLACK_WEBHOOK_URL is unset: logs and returns False,
    never raises. Any transport error is caught and logged, returning False.
    """
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        logger.info("SLACK_WEBHOOK_URL not configured — skipping Slack post (no-op).")
        return False

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json={"blocks": blocks})
            if resp.is_success:
                return True
            logger.warning("Slack webhook POST failed: HTTP %s", resp.status_code)
            return False
    except Exception:
        logger.exception("Slack webhook POST raised — treating as failed.")
        return False
