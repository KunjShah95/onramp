import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.services.slack_service import SlackService, format_daily_update, post_to_slack
from app.slack_bot import SlackBot
from app.agents import FirstPRAccelerator

logger = logging.getLogger("onramp.slack_api")
router = APIRouter(prefix="/slack", tags=["integration"])

# ── Daily standup (Slack slash command) ─────────────────────────
# Seeded demo identities (see scripts/daily_update.py). The Slack user is
# mapped to the junior "Dev Shah" for the demo.
_JUNIOR_ID = "00000000-0000-4000-c000-000000000002"
_JUNIOR_NAME = "Dev Shah"
_SENIOR_ID = "00000000-0000-4000-c000-000000000001"
_TEAM_ID = "00000000-0000-4000-d000-000000000001"
_DAILY_UPDATES_COLLECTION = "daily_updates"


class SlackDigestRequest(BaseModel):
    repo_url: str
    webhook_url: str
    channel: str = "#general"
    user_level: str = "junior"


class SlackCommandRequest(BaseModel):
    text: str
    user_name: str = "anonymous"
    channel_name: str = "general"


@router.post("/digest")
async def send_digest(request: SlackDigestRequest, req: Request):
    llm = getattr(req.app.state, "llm", None)
    slack = SlackService(request.webhook_url)

    try:
        accelerator = FirstPRAccelerator(llm)
        issues = await accelerator.find_issues(
            repo_url=request.repo_url,
            user_level=request.user_level,
        )

        message = slack.format_good_first_issues(issues)
        success = await slack.post_message(message, request.channel)
        return {"sent": success, "issue_count": len(issues)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/command")
async def handle_slash_command(request: SlackCommandRequest):
    return {
        "response_type": "in_channel",
        "text": f"Onramp analysis for: {request.text}",
        "attachments": [
            {
                "text": "Use the Onramp API to analyze this repository.\n"
                f"POST /api/v1/explore/analyze with repo_url: {request.text}",
                "color": "#4361ee",
            }
        ],
    }



# ── Interactive components (button clicks, modals) ──────────────


@router.post("/interactive")
async def slack_interactive(request: Request):
    """Handle Slack interactive component payloads (button clicks, etc.).

    Slack sends interactive payloads as ``application/x-www-form-urlencoded``
    with a ``payload`` field containing URL-encoded JSON. This endpoint
    parses the payload, processes the action, and returns an HTTP response
    that Slack renders as an ephemeral message to the clicking user.

    Security: Verifies Slack's HMAC-SHA256 signing secret before processing
    any payload. Unverified requests are rejected with 401.
    """
    # Verify Slack signature before parsing the body
    signature = request.headers.get("X-Slack-Signature", "")
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")

    body_bytes = await request.body()
    if not SlackBot.verify_slack_signature(body_bytes, timestamp, signature):
        raise HTTPException(
            status_code=401,
            detail="Invalid Slack signature — request may be forged.",
        )

    # Re-parse the form data from the raw body
    import urllib.parse
    try:
        form_data = urllib.parse.parse_qs(body_bytes.decode("utf-8"))
        raw = form_data.get("payload", [""])[0]
        if not raw:
            raise HTTPException(status_code=400, detail="Missing payload")
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or missing payload")

    bot = SlackBot()
    result = bot.handle_interactive_payload(payload)
    action = result.get("action", "unknown")

    # Handle acknowledgment action (fire-and-forget the DM to the junior)
    if action == "standup_acknowledged":
        try:
            # In a real setup we'd look up the junior's Slack user ID from
            # their integration config. For the demo, we send to the seeded IDs.
            from app.services.postgres_db import get_storage
            storage = get_storage()
            members = await storage.query_documents(
                "team_members",
                [("team_id", "==", _TEAM_ID), ("role", "==", "new_dev")],
            )
            for m in members:
                # Best effort — the junior may not have Slack linked
                slack_cfg = None
                try:
                    from app.services.webhook_service import get_integration_config
                    cfg = await get_integration_config(m["user_id"], "slack")
                    if cfg:
                        slack_cfg = cfg.get("config", {})
                except Exception:
                    pass
                if slack_cfg and slack_cfg.get("webhook_url"):
                    # Send acknowledgment via the junior's webhook (DM-like)
                    await bot.acknowledge_standup(
                        slack_user_id=slack_cfg.get("channel", ""),
                        senior_name=result.get("actor_name", "Your senior"),
                        junior_name=result.get("junior_name", ""),
                        date=result.get("date", ""),
                    )
        except Exception:
            logger.exception("Failed to send standup acknowledgment")

    response = result.get("response", {"text": f"Action '{action}' processed."})
    return response


@router.post("/standup")
async def slack_standup(request: Request):
    """Slack slash-command endpoint for a daily standup.

    Models a Slack `/standup <note>` slash command. Slack posts
    `application/x-www-form-urlencoded` with fields `user_id` and `text`; we
    parse the form directly (also accepting a JSON body) so no extra
    multipart dependency is required. Records a `daily_updates` doc (one per
    day, overwriting today's note), notifies the senior, builds the
    auto-digest, and returns a Slack-style ephemeral response with Block Kit
    blocks.

    The Slack `user_id` is mapped to the seeded junior (Dev Shah) for the demo.

    Security: Verifies Slack's HMAC-SHA256 signing secret before processing
    any slash command. Unverified requests are rejected with 401.
    """
    from app.services.postgres_db import get_storage, generate_id
    from app.services import notification_service, digest_service

    # Verify Slack signature before parsing
    signature = request.headers.get("X-Slack-Signature", "")
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    body_bytes = await request.body()
    if not SlackBot.verify_slack_signature(body_bytes, timestamp, signature):
        raise HTTPException(
            status_code=401,
            detail="Invalid Slack signature — request may be forged.",
        )

    # Parse Slack's form-encoded payload from raw body
    import urllib.parse
    try:
        form_data = urllib.parse.parse_qs(body_bytes.decode("utf-8"))
        slack_user_id = form_data.get("user_id", [""])[0]
        text = form_data.get("text", [""])[0]
    except Exception:
        slack_user_id, text = "", ""
    _ = slack_user_id  # mapped to the seeded junior below (demo)

    storage = get_storage()
    today = datetime.now(timezone.utc).date().isoformat()
    message = (text or "").strip()

    try:
        # One update per day: overwrite today's note if it already exists.
        prior = await storage.query_documents(
            _DAILY_UPDATES_COLLECTION,
            [("user_id", "==", _JUNIOR_ID), ("date", "==", today)],
        )
        update_id = prior[0]["id"] if prior else generate_id()
        record = {
            "update_id": update_id,
            "user_id": _JUNIOR_ID,
            "team_id": _TEAM_ID,
            "submitted_to": _SENIOR_ID,
            "date": today,
            "message": message,
            "created_at": datetime.now(timezone.utc),
        }
        if prior:
            await storage.update_document(_DAILY_UPDATES_COLLECTION, update_id, record)
        else:
            await storage.create_document(_DAILY_UPDATES_COLLECTION, update_id, record)

        # Notify the senior (only meaningful when there is a note).
        if message:
            await notification_service.create_notification(
                user_id=_SENIOR_ID,
                type="system_alert",
                title=f"Daily update from {_JUNIOR_NAME} ({today})",
                message=message,
                team_id=_TEAM_ID,
                metadata={"update_id": update_id, "from": _JUNIOR_ID, "source": "slack"},
            )

        sections = await digest_service.build_digest_sections(_JUNIOR_ID, "daily", _TEAM_ID)
        blocks = format_daily_update(_JUNIOR_NAME, today, message, sections)

        # Best-effort broadcast to a configured channel webhook (graceful no-op
        # if SLACK_WEBHOOK_URL is unset — never raises).
        # Also broadcast to the standup channel via the Slack bot if configured.
        bot = SlackBot()
        await bot.broadcast_standup(
            junior_name=_JUNIOR_NAME,
            date=today,
            message=message,
            sections=sections,
        )
        # Also post via legacy webhook for backward compatibility
        await post_to_slack(blocks)

        return {"response_type": "ephemeral", "blocks": blocks}
    except Exception as e:  # noqa: BLE001
        logger.exception("Slack standup handler failed")
        raise HTTPException(status_code=500, detail=str(e))
