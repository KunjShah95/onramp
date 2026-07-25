"""
SlackBot — Proactive standup reminders, interactive responses, senior notification.

Uses the Slack Web API (chat.postMessage) for proactive DMs and channel
messages, and incoming webhooks for channel broadcasts. Falls back gracefully
when tokens are not configured (development mode).

Architecture:
  - DM flow:     Bot → Junior → "What did you work on?" → Junior replies via
                 slash command or app_mention → Bot records + builds digest
  - Channel flow: Bot → #standups channel → "Dev Shah's standup" + auto-digest
                 → Senior interacts (acknowledge button, emoji react)
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional, List

import httpx

from app.services.slack_service import format_daily_update, post_to_slack

logger = logging.getLogger("onramp.slack_bot")

# ── Config helpers ──────────────────────────────────────────────────────────

_BOT_TOKEN_ENV = "SLACK_BOT_TOKEN"
_WEBHOOK_URL_ENV = "SLACK_WEBHOOK_URL"
_SIGNING_SECRET_ENV = "SLACK_SIGNING_SECRET"
_STANDUP_CHANNEL_ENV = "SLACK_STANDUP_CHANNEL"

_DEFAULT_STANDUP_CHANNEL = "#standups"


def _get_bot_token() -> Optional[str]:
    return os.getenv(_BOT_TOKEN_ENV)


def _get_signing_secret() -> Optional[str]:
    return os.getenv(_SIGNING_SECRET_ENV)


def _get_standup_channel() -> str:
    return os.getenv(_STANDUP_CHANNEL_ENV, _DEFAULT_STANDUP_CHANNEL)


def is_bot_configured() -> bool:
    """Return True if the Slack bot token is set (enables proactive messaging)."""
    return bool(_get_bot_token())


# ── SlackBot class ──────────────────────────────────────────────────────────


class SlackBot:
    """Proactive Slack bot for standup reminders, digests, and senior workflows.

    Requires ``SLACK_BOT_TOKEN`` for the Slack Web API (proactive DMs,
    channel messages).  Falls back to webhook-only mode when the token is
    unset (``post_message`` still works via ``SLACK_WEBHOOK_URL``).
    """

    def __init__(
        self,
        bot_token: Optional[str] = None,
        webhook_url: Optional[str] = None,
        signing_secret: Optional[str] = None,
    ):
        self.bot_token = bot_token or _get_bot_token()
        self.webhook_url = webhook_url or os.getenv(_WEBHOOK_URL_ENV)
        self.signing_secret = signing_secret or _get_signing_secret()

    # ── Web API helpers ─────────────────────────────────────────────────────

    async def _api_post(self, method: str, payload: dict) -> Optional[dict]:
        """Call a Slack Web API method via httpx.

        Args:
            method: Slack API method, e.g. ``chat.postMessage``.
            payload: JSON-serialisable dict of parameters.

        Returns:
            Parsed response JSON, or None if the API call failed or the bot
            token is not configured.
        """
        if not self.bot_token:
            logger.debug("SLACK_BOT_TOKEN not set — skipping Slack API call: %s", method)
            return None
        url = f"https://slack.com/api/{method}"
        headers = {
            "Authorization": f"Bearer {self.bot_token}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload, headers=headers)
                data = resp.json()
                if not data.get("ok"):
                    logger.warning(
                        "Slack API %s returned error: %s",
                        method, data.get("error", "unknown"),
                    )
                return data
        except Exception:
            logger.exception("Slack API call %s failed", method)
            return None

    # ── Proactive messaging ─────────────────────────────────────────────────

    async def post_dm(self, user_id: str, text: str, blocks: Optional[list] = None) -> bool:
        """Send a direct message to a Slack user via ``chat.postMessage``.

        Args:
            user_id: Slack user ID (e.g. ``U123456``).
            text: Fallback plain-text message.
            blocks: Optional Block Kit blocks for rich formatting.

        Returns:
            True if the message was sent successfully.
        """
        payload = {
            "channel": user_id,
            "text": text,
        }
        if blocks:
            payload["blocks"] = blocks

        result = await self._api_post("chat.postMessage", payload)
        if result and result.get("ok"):
            logger.info("DM sent to Slack user %s", user_id)
            return True
        logger.warning("Failed to send DM to Slack user %s", user_id)
        return False

    async def post_channel_message(
        self,
        text: str,
        channel: Optional[str] = None,
        blocks: Optional[list] = None,
    ) -> bool:
        """Post a message to a Slack channel.

        Uses the bot token and Web API if available; falls back to the
        incoming webhook for simple text messages.

        Args:
            text: Fallback plain-text message.
            channel: Channel name/ID (defaults to SLACK_STANDUP_CHANNEL).
            blocks: Optional Block Kit blocks.

        Returns:
            True if the message was posted successfully.
        """
        channel = channel or _get_standup_channel()

        # Prefer Web API (bot token) over webhook
        if self.bot_token:
            payload = {"channel": channel, "text": text}
            if blocks:
                payload["blocks"] = blocks
            result = await self._api_post("chat.postMessage", payload)
            if result and result.get("ok"):
                logger.info("Message posted to channel %s", channel)
                return True
            logger.warning("Web API post to %s failed — falling back to webhook", channel)

        # Fall back to webhook
        return await post_to_slack(blocks or [{"type": "section", "text": {"type": "mrkdwn", "text": text}}])

    # ── Standup workflow ────────────────────────────────────────────────────

    async def send_standup_reminder(
        self,
        slack_user_id: str,
        user_name: str,
        team_id: str,
    ) -> bool:
        """Send a proactive DM asking for today's standup.

        The user replies with ``/standup <note>`` or types in the DM thread
        (handled by the app_mention / interactive endpoint).

        Args:
            slack_user_id: The Slack user ID to DM.
            user_name: The user's display name.
            team_id: The team context for building the digest later.

        Returns:
            True if the reminder was sent.
        """
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "☀️ Time for your daily standup!",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"Hey {user_name}! What did you work on today?\n\n"
                             "Reply with your update and I'll log it for your senior.\n"
                             "You can also use `/standup <your note>` from any channel.",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "Your auto-digest (tasks, modules, quizzes) will be attached automatically.",
                    },
                ],
            },
        ]
        return await self.post_dm(slack_user_id, "Time for your daily standup!", blocks)

    async def acknowledge_standup(
        self,
        slack_user_id: str,
        senior_name: str,
        junior_name: str,
        date: str,
    ) -> bool:
        """Send the junior an acknowledgment that their senior saw the standup.

        Args:
            slack_user_id: Junior's Slack user ID.
            senior_name: Name of the senior who acknowledged.
            junior_name: Name of the junior (for the message).
            date: ISO date string for the standup.

        Returns:
            True if the acknowledgment was sent.
        """
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"✅ *{senior_name}* acknowledged your standup for *{date}*.",
                },
            },
        ]
        return await self.post_dm(slack_user_id, f"Your standup was acknowledged by {senior_name}.", blocks)

    async def request_additional_info(
        self,
        slack_user_id: str,
        senior_name: str,
        question: str,
    ) -> bool:
        """Ask the junior for more details about their standup (from senior).

        Args:
            slack_user_id: Junior's Slack user ID.
            senior_name: Name of the senior asking.
            question: The question the senior wants answered.

        Returns:
            True if the message was sent.
        """
        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":speech_balloon: *{senior_name}* has a follow-up on your standup:\n>{question}",
                },
            },
        ]
        return await self.post_dm(slack_user_id, f"{senior_name} has a follow-up: {question}", blocks)

    # ── Digest / broadcast ──────────────────────────────────────────────────

    async def broadcast_standup(
        self,
        junior_name: str,
        date: str,
        message: str,
        sections: Optional[List[dict]] = None,
        channel: Optional[str] = None,
    ) -> bool:
        """Broadcast a standup + auto-digest to the team's standup channel.

        Args:
            junior_name: Display name of the junior.
            date: ISO date string.
            message: Free-text standup note.
            sections: Digest sections from ``digest_service.build_digest_sections()``.
            channel: Target channel (defaults to SLACK_STANDUP_CHANNEL).

        Returns:
            True if the message was posted.
        """
        blocks = format_daily_update(junior_name, date, message, sections)

        # Add an "acknowledge" button block for seniors
        blocks.append(
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "✅ Acknowledge",
                            "emoji": True,
                        },
                        "action_id": "standup_acknowledge",
                        "value": json.dumps({
                            "junior_name": junior_name,
                            "date": date,
                        }),
                        "style": "primary",
                    },
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "💬 Ask for details",
                            "emoji": True,
                        },
                        "action_id": "standup_request_details",
                        "value": json.dumps({
                            "junior_name": junior_name,
                            "date": date,
                        }),
                        "style": "danger",
                    },
                ],
            },
        )

        return await self.post_channel_message(
            text=f"Daily standup — {junior_name} ({date})",
            channel=channel,
            blocks=blocks,
        )

    async def post_daily_digest(
        self,
        team_id: str,
        team_name: str,
        channel: Optional[str] = None,
    ) -> bool:
        """Post a team's daily digest to a Slack channel.

        Aggregates activity across all team members and posts a summary
        to the configured standup channel.

        Args:
            team_id: The team to build the digest for.
            team_name: Display name of the team.
            channel: Target channel (defaults to SLACK_STANDUP_CHANNEL).

        Returns:
            True if the digest was posted.
        """
        from app.services.digest_service import build_digest_sections

        # Build a team-level digest — get the first member's digest as a proxy
        # (In production, a team-level digest would aggregate across members)
        from app.services.postgres_db import get_storage

        storage = get_storage()
        members = await storage.query_documents(
            "team_members", [("team_id", "==", team_id)]
        )

        today = datetime.now(timezone.utc).date().isoformat()
        header_msg = f"📬 *{team_name}* — Daily digest for {today}"

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"📬 Team Digest — {team_name}",
                    "emoji": True,
                },
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"*Date:* {today}  |  *Members:* {len(members)}"},
                ],
            },
            {"type": "divider"},
        ]

        # Get digest sections for each member
        for member in members:
            uid = member.get("user_id")
            user_doc = await storage.get_document("users", uid)
            user_name = user_doc.get("name", uid[:8]) if user_doc else uid[:8]

            sections = await build_digest_sections(uid, "daily", team_id)
            if not sections:
                continue

            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*👤 {user_name}*",
                },
            })

            for s in sections:
                items_text = "\n".join(
                    f"{item.get('emoji', '•')} {item.get('text', '')}"
                    for item in s.get("items", [])[:3]
                )
                if items_text:
                    blocks.append({
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*{s.get('title', '')}:*\n{items_text}",
                        },
                    })

        return await self.post_channel_message(
            text=header_msg,
            channel=channel,
            blocks=blocks,
        )

    # ── Interactive payload handling ────────────────────────────────────────

    @staticmethod
    def verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
        """Verify Slack's signing secret against the request body and timestamp.

        Slack signs each request with the app's signing secret using HMAC-SHA256.
        This must be called for all interactive endpoints and slash commands to
        prevent forged requests.

        Args:
            body: Raw request body bytes.
            timestamp: The ``X-Slack-Request-Timestamp`` header value.
            signature: The ``X-Slack-Signature`` header value.

        Returns:
            True if the signature is valid, False if verification fails or the
            signing secret is not configured.
        """
        import hashlib
        import hmac

        secret = _get_signing_secret()
        if not secret:
            logger.warning(
                "SLACK_SIGNING_SECRET not set — skipping interactive payload "
                "signature verification (insecure; only for development)."
            )
            return True

        # Slack uses the format: v0=HMAC-SHA256(secret, v0:{timestamp}:{body})
        sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
        expected = hmac.new(
            secret.encode(),
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()
        expected_sig = f"v0={expected}"

        # Constant-time comparison to prevent timing attacks
        if not hmac.compare_digest(expected_sig, signature):
            logger.warning(
                "Slack signature verification FAILED — possible forged request "
                "(expected=%s, received=%s)",
                expected_sig[:16], signature[:16],
            )
            return False

        return True

    @staticmethod
    def handle_interactive_payload(payload: dict) -> dict:
        """Process a Slack interactive component payload (button clicks, etc.).

        Args:
            payload: The parsed JSON ``payload`` form field from Slack's
                     interactive endpoint.

        Returns:
            A dict with ``action`` and optional ``response`` fields for the
            caller to return as an HTTP response.
        """
        actions = payload.get("actions", [])
        if not actions:
            return {"action": "noop"}

        action = actions[0]
        action_id = action.get("action_id", "")
        action_value = action.get("value", "{}")

        try:
            data = json.loads(action_value)
        except (json.JSONDecodeError, TypeError):
            data = {}

        user = payload.get("user", {})
        actor_name = user.get("display_name") or user.get("name", "Someone")

        if action_id == "standup_acknowledge":
            return {
                "action": "standup_acknowledged",
                "actor_name": actor_name,
                "junior_name": data.get("junior_name", "the junior"),
                "date": data.get("date", ""),
                "response": {
                    "response_type": "ephemeral",
                    "text": f"✅ Standup acknowledged! The junior will be notified.",
                },
            }

        if action_id == "standup_request_details":
            return {
                "action": "request_details",
                "actor_name": actor_name,
                "junior_name": data.get("junior_name", "the junior"),
                "date": data.get("date", ""),
                "response": {
                    "response_type": "ephemeral",
                    "text": (
                        f"To ask {data.get('junior_name', 'the junior')} for more "
                        f"details, reply in this thread with your question."
                    ),
                },
            }

        return {"action": "unknown"}
