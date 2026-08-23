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
from app.services.field_encryption import decrypt_field

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

    loop = None
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
        if loop is not None and not loop.is_closed():
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

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())
        logger.info("Task assigned notification sent to %s", assignee_id)
    except Exception as exc:
        logger.exception("Task assigned notification failed for %s", assignee_id)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
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

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())
        logger.info("Task submitted notification sent for %s", task.get("title", ""))
    except Exception as exc:
        logger.exception("Task submitted notification failed")
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
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

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_run())
        logger.info("Task reviewed notification sent (approved=%s)", approved)
    except Exception as exc:
        logger.exception("Task reviewed notification failed")
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
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

    loop = None
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
        if loop is not None and not loop.is_closed():
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
            name = decrypt_field(user.get("name") or user.get("display_name") or uid[:8])
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

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Bulk digest send failed for period %s", period)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()


# ── Slack Standup Reminders ────────────────────────────────────────────────


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
)
def send_standup_reminders(self) -> dict:
    """Send proactive standup reminders to all active team members with Slack configured.

    Finds all team members who have Slack integration configured and sends
    them a DM asking for today's standup. Runs daily at the configured time
    (see beat_schedule.py for schedule).

    Gracefully handles missing Slack config — never raises.
    """
    import asyncio
    from app.slack_bot import SlackBot

    async def _run() -> dict:
        if not SlackBot.is_bot_configured():
            logger.info("SLACK_BOT_TOKEN not set — skipping standup reminders")
            return {"sent": 0, "skipped": 0, "reason": "no_bot_token"}

        from app.services.postgres_db import get_storage
        from app.services.webhook_service import get_integration_config

        storage = get_storage()
        bot = SlackBot()
        sent = 0
        skipped = 0

        # Get all team members across all teams
        members = await storage.list_documents("team_members")
        seen_users = set()

        for member in members:
            uid = member.get("user_id")
            if not uid or uid in seen_users:
                continue
            seen_users.add(uid)

            team_id = member.get("team_id")

            try:
                # Check if the user has Slack integration configured
                cfg = await get_integration_config(uid, "slack")
                if not cfg:
                    skipped += 1
                    continue

                slack_config = cfg.get("config", {})
                slack_user_id = slack_config.get("slack_user_id")
                if not slack_user_id:
                    skipped += 1
                    continue

                # Look up user name
                user_doc = await storage.get_document("users", uid)
                user_name = user_doc.get("name", uid[:8]) if user_doc else uid[:8]

                # Send the proactive standup reminder
                success = await bot.send_standup_reminder(
                    slack_user_id=slack_user_id,
                    user_name=user_name,
                    team_id=team_id or "",
                )
                if success:
                    sent += 1
                    logger.info("Standup reminder sent to %s (Slack user %s)", uid, slack_user_id)
                else:
                    skipped += 1
            except Exception:
                logger.exception("Failed to send standup reminder to %s", uid)
                skipped += 1

        return {"sent": sent, "skipped": skipped}

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Standup reminder batch failed")
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()


# ── Stale Task Alerts ─────────────────────────────────────────────────────

# Thresholds (hours) for the stale-task sweep
STALE_NEEDS_CHANGES_HOURS = 48
STALE_SUBMITTED_HOURS = 24


async def sweep_stale_tasks() -> dict:
    """Core stale-task sweep — async, directly testable.

    Rules (from the roadmap "stale task alerts"):
      - A task sitting in ``needs_changes`` for > 48h → notify the assignee
        (nudge to resume) AND the task creator (senior visibility).
      - A task sitting in ``submitted`` for > 24h with no review → notify the
        task creator (senior) that a review is due.

    Returns ``{"alerts": [...], "notifications_sent": int}``.
    """
    from datetime import datetime, timezone
    from app.services.postgres_db import get_storage

    storage = get_storage()
    from app.services.notification_service import create_notification

    now = datetime.now(timezone.utc)
    tasks = await storage.list_documents("onramp_tasks")

    from app.services.notification_helpers import notify_stale_task

    notified = 0
    alerts = []

    for t in tasks:
        state = t.get("state")
        if state not in ("needs_changes", "submitted"):
            continue

        updated = t.get("updated_at") or t.get("created_at")
        try:
            if isinstance(updated, str):
                dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            else:
                dt = updated
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age_hours = (now - dt.astimezone(timezone.utc)).total_seconds() / 3600
        except Exception:
            continue

        task_id = t.get("task_id", "")
        title = t.get("title", "Untitled task")
        assignee = t.get("assigned_to")
        creator = t.get("created_by")
        team_id = t.get("team_id")

        if state == "needs_changes" and age_hours > STALE_NEEDS_CHANGES_HOURS:
            # In-app + Slack for the assignee (nudge to resume).
            if assignee:
                await notify_stale_task(t, age_hours / 24)
                notified += 1
            # Separate visibility alert for the creator (senior).
            if creator and creator != assignee:
                await create_notification(
                    user_id=creator,
                    type="task_stale",
                    title="Stale task needs attention",
                    message=f"\"{title}\" has been waiting on changes for >{int(age_hours)}h.",
                    metadata={"task_id": task_id, "state": state, "age_hours": round(age_hours, 1)},
                    team_id=team_id,
                )
                notified += 1
            alerts.append({"task_id": task_id, "state": state, "age_hours": round(age_hours, 1)})

        elif state == "submitted" and age_hours > STALE_SUBMITTED_HOURS:
            if creator:
                await notify_stale_task(t, age_hours / 24)
                notified += 1
            alerts.append({"task_id": task_id, "state": state, "age_hours": round(age_hours, 1)})

    logger.info("Stale task sweep: %d alerts, %d notifications sent", len(alerts), notified)
    return {"alerts": alerts, "notifications_sent": notified}


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
)
def check_stale_tasks(self) -> dict:
    """Celery wrapper for the stale-task sweep (see sweep_stale_tasks)."""
    import asyncio

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(sweep_stale_tasks())
    except Exception as exc:
        logger.exception("Stale task sweep failed")
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()


# ── Stuck-Dev Sweep (Ramp wedge) ──────────────────────────────────────────


async def sweep_stuck_devs() -> dict:
    """Detect stuck new devs across every team and fire leader alerts.

    Runs the v1.4 interception loop (see app.services.ramp_service). Alerts
    are deduped per trainee (≤1/day) by the service, so this is safe to run
    on a schedule.
    """
    from app.services.postgres_db import get_storage
    from app.services.ramp_service import fire_stuck_alerts

    storage = get_storage()
    teams = await storage.list_documents("teams")
    total_fired = 0
    total_skipped = 0
    total_stuck = 0

    for team in teams:
        team_id = team.get("id")
        if not team_id:
            continue
        try:
            result = await fire_stuck_alerts(team_id)
            total_fired += result.get("alerts_fired", 0)
            total_skipped += result.get("skipped", 0)
            total_stuck += result.get("stuck_count", 0)
        except Exception:
            logger.exception("Stuck-dev sweep failed for team %s", team_id)

    logger.info(
        "Stuck-dev sweep: %d teams, %d alerts fired, %d skipped (%d stuck devs)",
        len(teams), total_fired, total_skipped, total_stuck,
    )
    return {
        "teams_scanned": len(teams),
        "alerts_fired": total_fired,
        "skipped": total_skipped,
        "stuck_count": total_stuck,
    }


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
)
def check_stuck_devs(self) -> dict:
    """Celery wrapper for the stuck-dev sweep (see sweep_stuck_devs)."""
    import asyncio

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(sweep_stuck_devs())
    except Exception as exc:
        logger.exception("Stuck-dev sweep failed")
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()


# ── Team Digest (Slack) ────────────────────────────────────────────────────


@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
)
def send_team_digest_to_slack(self, team_id: str, team_name: str) -> dict:
    """Post a team's daily digest to the configured Slack standup channel."""
    import asyncio
    from app.slack_bot import SlackBot

    async def _run() -> dict:
        bot = SlackBot()
        success = await bot.post_daily_digest(team_id, team_name)
        return {"team_id": team_id, "sent": success}

    loop = None
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(_run())
    except Exception as exc:
        logger.exception("Team digest Slack post failed for team %s", team_id)
        raise self.retry(exc=exc)
    finally:
        if loop is not None and not loop.is_closed():
            loop.close()


# ── API Key Expiry Sweep ─────────────────────────────────────────────────────

@shared_task(
    queue="notification-tasks",
    bind=True,
    max_retries=1,
    default_retry_delay=30,
    acks_late=True,
)
def sweep_api_key_expiry(self):
    """Sweep all active API keys for expiry status.

    - Keys that have expired: auto-revoke + notify owner.
    - Keys approaching expiry (within API_KEY_EXPIRY_WARNING_DAYS): send a
      warning notification so the team can rotate before disruption.
    - Deduplicates: each key only gets one approaching-expiry notification
      per window (tracked via permissions.expiry_notified_at).
    """
    import os
    from datetime import timedelta
    from app.services.api_key_service import APIKeyService, _coerce_aware_datetime
    from app.services.postgres_db import get_storage
    from app.services.notification_service import create_notification

    key_service = APIKeyService()
    storage = get_storage()
    now = datetime.now(timezone.utc)
    warning_days = int(os.getenv("API_KEY_EXPIRY_WARNING_DAYS", "30"))
    warning_cutoff = now + timedelta(days=warning_days)
    auto_revoke = os.getenv("API_KEY_AUTO_REVOKE_EXPIRED", "true").lower() in ("1", "true", "yes")

    logger.info("API key expiry sweep started")

    try:
        all_keys = storage.list_documents("api_keys")
    except Exception as exc:
        logger.error("Failed to list API keys for expiry sweep: %s", exc)
        raise self.retry(exc=exc)

    expired_count = 0
    warned_count = 0

    for key in all_keys:
        if not key.get("is_active"):
            continue

        expires_at = _coerce_aware_datetime(key.get("expires_at"))
        if not expires_at:
            continue

        key_id = key["id"]
        perms = key.get("permissions") or {}
        owner_id = key.get("user_id") or key.get("created_by") or perms.get("created_by")
        org_name = key.get("team_id") or perms.get("org_name") or key.get("name", "")
        key_name = key.get("name", key_id[:8])

        if expires_at < now:
            # ── Expired: auto-revoke ──
            if auto_revoke:
                try:
                    await_or_sync = getattr(key_service, 'revoke_key', None)
                    # revoke_key is async — call via sync wrapper
                    import asyncio
                    loop = asyncio.new_event_loop()
                    try:
                        loop.run_until_complete(key_service.revoke_key(key_id))
                    finally:
                        loop.close()
                    expired_count += 1
                    logger.info("Auto-revoked expired API key %s (%s)", key_id, key_name)

                    if owner_id:
                        try:
                            import asyncio
                            loop = asyncio.new_event_loop()
                            try:
                                loop.run_until_complete(create_notification(
                                    user_id=owner_id,
                                    type="security",
                                    title="API Key Expired & Revoked",
                                    message=f"The API key '{key_name}' for {org_name} has expired and was automatically revoked. Create a new key if you need continued access.",
                                    metadata={"key_id": key_id, "org_name": org_name, "event": "key_expired"},
                                    team_id=org_name,
                                ))
                            finally:
                                loop.close()
                        except Exception as notif_exc:
                            logger.warning("Could not notify about expired key %s: %s", key_id, notif_exc)
                except Exception as revoke_exc:
                    logger.error("Failed to auto-revoke expired key %s: %s", key_id, revoke_exc)

        elif expires_at < warning_cutoff:
            # ── Approaching expiry: send warning (once per window) ──
            notified_at = perms.get("expiry_notified_at")
            if notified_at:
                notified_dt = _coerce_aware_datetime(notified_at)
                if notified_dt and (now - notified_dt) < timedelta(days=max(1, warning_days // 2)):
                    continue  # already warned recently

            days_left = (expires_at - now).days
            if owner_id:
                try:
                    import asyncio
                    loop = asyncio.new_event_loop()
                    try:
                        loop.run_until_complete(create_notification(
                            user_id=owner_id,
                            type="security",
                            title="API Key Expiring Soon",
                            message=f"The API key '{key_name}' for {org_name} expires in {days_left} day{'s' if days_left != 1 else ''}. Rotate it to avoid service disruption.",
                            metadata={"key_id": key_id, "org_name": org_name, "days_until_expiry": days_left, "event": "key_expiring"},
                            team_id=org_name,
                        ))
                    finally:
                        loop.close()
                    warned_count += 1

                    # Mark as notified to avoid duplicate alerts
                    perms["expiry_notified_at"] = now.isoformat()
                    storage.update_document("api_keys", key_id, {"permissions": perms})
                    logger.info("Sent expiry warning for key %s (%s, %d days left)", key_id, key_name, days_left)
                except Exception as notif_exc:
                    logger.warning("Could not send expiry warning for key %s: %s", key_id, notif_exc)

    logger.info(
        "API key expiry sweep complete: %d expired (auto-revoked), %d warned",
        expired_count, warned_count,
    )
    return {"expired": expired_count, "warned": warned_count}


# ── Helpers ──────────────────────────────────────────────────────────────────

# Reuse the synchronous email lookup from notification_helpers to avoid duplication.
from app.services.notification_helpers import _get_user_email  # noqa: E402,F401
