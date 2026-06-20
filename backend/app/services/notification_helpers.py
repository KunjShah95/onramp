"""
Notification Helpers — centralized dispatch for task events across all channels.

Consolidates the logic for sending in-app notifications, Slack messages, and
emails for each task event type. Each function is fire-and-forget: failures
are logged but never propagated to the caller.

Channels dispatched per event:
  - task_assigned:   in-app + Slack + email
  - task_submitted:  in-app + Slack
  - task_reviewed:   in-app + Slack + email (approved or needs_changes)
  - task_approved:   in-app + Slack + email
  - task_completed:  in-app + Slack + email
"""

import logging

logger = logging.getLogger("codeflow.notification_helpers")


async def notify_task_assigned_all_channels(
    task: dict,
    assignee_id: str,
    assigned_by_name: str,
) -> None:
    """Send task assigned notifications via in-app, Slack, and email."""
    from app.services.notification_service import notify_task_assigned
    from app.services.slack_service import send_slack_task_notification
    from app.services.email_service import send_task_assigned_email

    try:
        await notify_task_assigned(task, assignee_id, assigned_by_name=assigned_by_name)
    except Exception:
        logger.exception("Failed to send in-app notification for task_assigned")

    try:
        await send_slack_task_notification(assignee_id, "task_assigned", task, actor_name=assigned_by_name)
    except Exception:
        logger.exception("Failed to send Slack notification for task_assigned")

    try:
        assignee_email = await _get_user_email(assignee_id)
        if assignee_email:
            team_name = task.get("team_name", "")
            await send_task_assigned_email(assignee_email, task.get("title", ""), team_name, assigned_by_name)
    except Exception:
        logger.exception("Failed to send email notification for task_assigned")


async def notify_task_submitted_all_channels(
    task: dict,
    submitter_id: str,
    submitter_name: str,
) -> None:
    """Notify seniors/team leads that a task was submitted for review.

    Sends to the task creator (the senior who assigned the task) via in-app
    and email, and to the submitter via Slack if configured.
    """
    from app.services.notification_service import notify_task_submitted
    from app.services.slack_service import send_slack_task_notification
    from app.services.email_service import send_task_submitted_email

    created_by = task.get("created_by")

    # Notify task creator (senior) via in-app + email
    if created_by and created_by != submitter_id:
        try:
            await notify_task_submitted(task, created_by, submitter_name=submitter_name)
        except Exception:
            logger.exception("Failed to send in-app notification for task_submitted")

        try:
            senior_email = await _get_user_email(created_by)
            if senior_email:
                team_name = task.get("team_name", "")
                await send_task_submitted_email(senior_email, task.get("title", ""), team_name, submitter_name)
        except Exception:
            logger.exception("Failed to send email notification for task_submitted")

    # Notify submitter via Slack (so they know it's in review)
    try:
        await send_slack_task_notification(submitter_id, "task_submitted", task, actor_name=submitter_name)
    except Exception:
        logger.exception("Failed to send Slack notification for task_submitted")


async def notify_task_reviewed_all_channels(
    task: dict,
    reviewer_name: str,
    approved: bool,
) -> None:
    """Send task review result notifications via in-app, Slack, and email.

    Uses the dedicated send_task_reviewed_email template which distinguishes
    between "approved" (route to product) and "requested changes" outcomes.
    """
    from app.services.notification_service import notify_task_reviewed
    from app.services.slack_service import send_slack_task_notification
    from app.services.email_service import send_task_reviewed_email

    assignee_id = task.get("assigned_to")
    if not assignee_id:
        return

    notif_type = "task_approved" if approved else "task_needs_changes"
    action = "approved" if approved else "requested changes"

    try:
        await notify_task_reviewed(task, reviewer_name=reviewer_name, approved=approved)
    except Exception:
        logger.exception("Failed to send in-app notification for task_reviewed")

    try:
        await send_slack_task_notification(assignee_id, notif_type, task, actor_name=reviewer_name)
    except Exception:
        logger.exception("Failed to send Slack notification for task_reviewed")

    try:
        assignee_email = await _get_user_email(assignee_id)
        if assignee_email:
            team_name = task.get("team_name", "")
            await send_task_reviewed_email(assignee_email, task.get("title", ""), team_name, reviewer_name, action=action)
    except Exception:
        logger.exception("Failed to send email notification for task_reviewed")


async def notify_task_approved_all_channels(
    task: dict,
    approver_name: str,
) -> None:
    """Send task approved notifications via in-app, Slack, and email.

    Uses the dedicated send_task_approved_email template for the final
    sign-off event (distinct from the initial review).
    """
    from app.services.notification_service import notify_task_reviewed
    from app.services.slack_service import send_slack_task_notification
    from app.services.email_service import send_task_approved_email

    assignee_id = task.get("assigned_to")
    if not assignee_id:
        return

    try:
        await notify_task_reviewed(task, reviewer_name=approver_name, approved=True)
    except Exception:
        logger.exception("Failed to send in-app notification for task_approved")

    try:
        await send_slack_task_notification(assignee_id, "task_approved", task, actor_name=approver_name)
    except Exception:
        logger.exception("Failed to send Slack notification for task_approved")

    try:
        assignee_email = await _get_user_email(assignee_id)
        if assignee_email:
            team_name = task.get("team_name", "")
            await send_task_approved_email(assignee_email, task.get("title", ""), team_name, approver_name)
    except Exception:
        logger.exception("Failed to send email notification for task_approved")


async def notify_task_completed_all_channels(
    task: dict,
) -> None:
    """Send task completed notifications via in-app, Slack, and email."""
    from app.services.notification_service import notify_task_completed
    from app.services.slack_service import send_slack_task_notification
    from app.services.email_service import send_task_completed_email

    assignee_id = task.get("assigned_to")
    if not assignee_id:
        return

    try:
        await notify_task_completed(task)
    except Exception:
        logger.exception("Failed to send in-app notification for task_completed")

    try:
        await send_slack_task_notification(assignee_id, "task_completed", task)
    except Exception:
        logger.exception("Failed to send Slack notification for task_completed")

    try:
        assignee_email = await _get_user_email(assignee_id)
        if assignee_email:
            team_name = task.get("team_name", "")
            await send_task_completed_email(assignee_email, task.get("title", ""), team_name)
    except Exception:
        logger.exception("Failed to send email notification for task_completed")


async def _get_user_email(user_id: str) -> str | None:
    """Look up a user's email from the database.

    Returns None if the user is not found or has no email set.
    """
    try:
        from app.services.postgres_db import get_storage
        users = await get_storage().query_documents("users", [("id", "==", user_id)])
        if users:
            return users[0].get("email")
    except Exception:
        logger.exception("Failed to look up email for user %s", user_id)
    return None
