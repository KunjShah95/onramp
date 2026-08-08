"""
Celery Beat Schedule — Periodic task configuration.

Each entry defines a task that runs on a schedule. Schedules use the UTC
timezone (configured in celery_app.conf.timezone).

To test a schedule without waiting:
    celery -A app.tasks.celery_app beat --loglevel=info --test

Available schedules (all times UTC):
    - Daily digest:       every day at 08:00
    - Weekly digest:      every Monday at 08:00
    - Usage aggregation:  every night at 02:00
    - Leaderboard refresh: every hour
    - Repo index refresh: every night at 03:00 (pre-builds / auto-refreshes
      repository context indexes so first requests hit the cache)
"""

from celery.schedules import crontab

BEAT_SCHEDULE = {
    # ── Daily Digest ─────────────────────────────────────────────────────────
    "send-daily-digests": {
        "task": "app.tasks.notification_tasks.send_all_digests",
        "schedule": crontab(hour=8, minute=0),
        "kwargs": {"period": "daily"},
        "options": {"queue": "notification-tasks"},
    },

    # ── Weekly Digest ────────────────────────────────────────────────────────
    "send-weekly-digests": {
        "task": "app.tasks.notification_tasks.send_all_digests",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # Monday
        "kwargs": {"period": "weekly"},
        "options": {"queue": "notification-tasks"},
    },

    # ── Usage Aggregation ────────────────────────────────────────────────────
    "aggregate-daily-usage": {
        "task": "app.tasks.analytics_tasks.aggregate_daily_usage",
        "schedule": crontab(hour=2, minute=0),  # Nightly at 02:00 UTC
        "options": {"queue": "analytics-tasks"},
    },

    # ── Leaderboard Refresh (hourly) ─────────────────────────────────────────
    "refresh-all-leaderboards": {
        "task": "app.tasks.analytics_tasks.refresh_all_leaderboards",
        "schedule": crontab(minute=0),  # Every hour at :00
        "options": {"queue": "analytics-tasks"},
    },

    # ── Slack Standup Reminders ────────────────────────────────────────────────
    # Sends proactive "What did you work on?" DMs to all team members with
    # Slack configured. Runs at 10:00 AM UTC by default. Override via
    # SLACK_STANDUP_TIME env var (format: HH:MM, e.g. "09:30").
    "send-standup-reminders": {
        "task": "app.tasks.notification_tasks.send_standup_reminders",
        "schedule": crontab(hour=10, minute=0),
        "options": {"queue": "notification-tasks"},
    },

    # ── Stale Task Alerts ──────────────────────────────────────────────────────
    # Sweep for tasks stuck in needs_changes (>48h) or submitted-but-unreviewed
    # (>24h) and notify the affected dev + senior. Runs every 6 hours.
    "check-stale-tasks": {
        "task": "app.tasks.notification_tasks.check_stale_tasks",
        "schedule": crontab(hour="*/6", minute=0),
        "options": {"queue": "notification-tasks"},
    },

    # ── Repo Index Refresh ─────────────────────────────────────────────────────
    # Pre-build / auto-refresh repository context indexes (parse-once stage).
    # Runs nightly at 03:00 UTC so indexes are warm before the 24h Redis TTL
    # expires — the first user request hits the cache instead of building.
    # Enqueue a single repo build on demand via POST /repos/index?async_build=true.
    "refresh-repo-indexes": {
        "task": "app.tasks.repo_index_tasks.refresh_repo_indexes",
        "schedule": crontab(hour=3, minute=0),
        "options": {"queue": "agent-tasks"},
    },

}
