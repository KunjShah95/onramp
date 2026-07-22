"""
Notification Tasks — Multi-channel notification delivery.

Routed to the 'notification-tasks' queue. Each task is fire-and-forget:
failures are logged but never propagated, matching the existing pattern
in notification_helpers.py.

Channels:
- In-app notifications (stored in DB, fetched via API)
- Slack messages (via webhooks)
- Email (via SendGrid)
- Digest emails (periodic aggregation)
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from celery import shared_task

logger = logging.getLogger("onramp.tasks.notification")


# ── Single-Notification Dispatch ─────────────────────────────────────────────

@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    acks_late=True,
)
def send_email(
    self,
    to: str,
    subject: str,
    html_body: str,
    from_email: Optional[str] = None,
) -> bool:
    """Send a transactional email asynchronously via SendGrid."""
    import asyncio
    from app.services.email_service import send_email as _send

    async def _run() -> bool:
        return await _send(to, subject, html_body, from_email)

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_run())
        logger.info("Email task completed for %s: %s", to, subject)
        return result
    except Exception as exc:
        logger.exception("Email task failed for %s", to)
        raise self.retry(exc=exc)
    finally:
        loop.close()


# ── Task Event Notifications (All Channels) ──────────────────────────────────

@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
)
def notify_task_assigned(
    self,
    task: dict,
    assignee_id: str,
    assigned_by_name: str,
) -> None:
    """Send task_assigned notifications across all channels."""
    import asyncio
    import traceback

    async def _run():
        from app.services.notification_service import notify_task_assigned as _notify
        from app.services.slack_service import send_slack_task_notification
        from app.services.email_service import send_task_assigned_email

        errors = []

        # 1. In-app notification
        try:
            await _notify(task, assignee_id, assigned_by_name=assigned_by_name)
        except Exception:
            errors.append(f"in-app: {traceback.format_exc()}")

        # 2. Slack
        try:
            await send_slack_task_notification(assignee_id, "task_assigned", task, actor_name=assigned_by_name)
        except Exception:
            errors.append(f"slack: {traceback.format_exc()}")

        # 3. Email
        try:
            assignee_email = await _get_user_email(assignee_id)
            if assignee_email:
                team_name = task.get("team_name", "")
                await send_task_assigned_email(assignee_email, task.get("title", ""), team_name, assigned_by_name)
        except Exception:
            errors.append(f"email: {traceback.format_exc()}")

        if errors:
            logger.warning("Task assigned notification had partial failures: %s", "; ".join(errors))

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())
        logger.info("Task assigned notification sent to %s", assignee_id)
    except Exception as exc:
        logger.exception("Task assigned notification failed for %s", assignee_id)
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
)
def notify_task_submitted(
    self,
    task: dict,
    submitter_id: str,
    submitter_name: str,
) -> None:
    """Send task_submitted notifications to the task creator."""
    import asyncio
    import traceback

    async def _run():
        from app.services.notification_service import notify_task_submitted as _notify
        from app.services.slack_service import send_slack_task_notification
        from app.services.email_service import send_task_submitted_email

        created_by = task.get("created_by")
        errors = []

        if created_by and created_by != submitter_id:
            try:
                await _notify(task, created_by, submitter_name=submitter_name)
            except Exception:
                errors.append(f"in-app: {traceback.format_exc()}")

            try:
                senior_email = await _get_user_email(created_by)
                if senior_email:
                    team_name = task.get("team_name", "")
                    await send_task_submitted_email(senior_email, task.get("title", ""), team_name, submitter_name)
            except Exception:
                errors.append(f"email: {traceback.format_exc()}")

        try:
            await send_slack_task_notification(submitter_id, "task_submitted", task, actor_name=submitter_name)
        except Exception:
            errors.append(f"slack: {traceback.format_exc()}")

        if errors:
            logger.warning("Task submitted notification had partial failures: %s", "; ".join(errors))

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())
        logger.info("Task submitted notification sent for %s", task.get("title", ""))
    except Exception as exc:
        logger.exception("Task submitted notification failed")
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
)
def notify_task_reviewed(
    self,
    task: dict,
    reviewer_name: str,
    approved: bool,
) -> None:
    """Send task review result notifications across all channels."""
    import asyncio
    import traceback

    async def _run():
        from app.services.notification_service import notify_task_reviewed as _notify
        from app.services.slack_service import send_slack_task_notification
        from app.services.email_service import send_task_reviewed_email

        assignee_id = task.get("assigned_to")
        if not assignee_id:
            return

        notif_type = "task_approved" if approved else "task_needs_changes"
        action = "approved" if approved else "requested changes"
        errors = []

        try:
            await _notify(task, reviewer_name=reviewer_name, approved=approved)
        except Exception:
            errors.append(f"in-app: {traceback.format_exc()}")

        try:
            await send_slack_task_notification(assignee_id, notif_type, task, actor_name=reviewer_name)
        except Exception:
            errors.append(f"slack: {traceback.format_exc()}")

        try:
            assignee_email = await _get_user_email(assignee_id)
            if assignee_email:
                team_name = task.get("team_name", "")
                await send_task_reviewed_email(assignee_email, task.get("title", ""), team_name, reviewer_name, action=action)
        except Exception:
            errors.append(f"email: {traceback.format_exc()}")

        if errors:
            logger.warning("Task reviewed notification had partial failures: %s", "; ".join(errors))

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())
        logger.info("Task reviewed notification sent (approved=%s)", approved)
    except Exception as exc:
        logger.exception("Task reviewed notification failed")
        raise self.retry(exc=exc)
    finally:
        loop.close()


# ── Digest ───────────────────────────────────────────────────────────────────

@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
)
def send_user_digest(
    self,
    user_id: str,
    user_email: str,
    user_name: str,
    period: str = "daily",
    team_id: Optional[str] = None,
) -> dict:
    """Generate and send a digest email for a single user."""
    import asyncio
    from app.services.digest_service import generate_and_send_digest

    async def _run() -> dict:
        return await generate_and_send_digest(
            user_id=user_id,
            user_email=user_email,
            user_name=user_name,
            period=period,
            team_id=team_id,
        )

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_run())
        logger.info(
            "Digest %s for %s: sent=%s, items=%s",
            period, user_id,
            result.get("sent"), result.get("total_items", 0),
        )
        return result
    except Exception as exc:
        logger.exception("Digest generation failed for user %s", user_id)
        raise self.retry(exc=exc)
    finally:
        loop.close()


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
)
def send_all_digests(self, period: str = "daily") -> dict:
    """Send digests to all users who have them enabled for this period."""
    import asyncio
    from app.services.postgres_db import get_storage

    async def _run() -> dict:
        storage = get_storage()
        users = await storage.list_documents("users")
        preference_key = "onramp_notification_preferences"

        sent_count = 0
        skipped_count = 0

        for user in users:
            uid = user.get("id")
            email = user.get("email")
            name = user.get("name") or user.get("display_name") or uid[:8]
            if not uid or not email:
                continue

            # Check user's digest preference
            prefs = await storage.get_document(preference_key, uid)
            if not prefs:
                continue

            user_period = prefs.get("digest_period", "disabled")
            if user_period != period:
                continue

            # Send digest via celery chain — fire and forget to avoid long loop
            send_user_digest.delay(uid, email, name, period=period)
            sent_count += 1

        return {
            "period": period,
            "digests_sent": sent_count,
            "users_skipped": skipped_count,
        }

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Bulk digest send failed for period %s", period)
        raise self.retry(exc=exc)
    finally:
        loop.close()


# ── Helpers ──────────────────────────────────────────────────────────────────

# Reuse the synchronous email lookup from notification_helpers to avoid duplication.
from app.services.notification_helpers import _get_user_email  # noqa: E402,F401
