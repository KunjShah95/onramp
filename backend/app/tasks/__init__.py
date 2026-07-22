"""
Onramp Background Tasks Package

Celery-based task queues for offloading long-running or fire-and-forget work
from the main FastAPI process:

- agent-tasks: Heavy AI agent operations (health scoring, PR reviews, learning paths)
- analytics-tasks: Data aggregation and leaderboard computation
- notification-tasks: Multi-channel notification dispatch (email, Slack, in-app)
- default: Fallback queue for misc tasks

Usage:
    from app.tasks.celery_app import celery_app
"""

from app.tasks.celery_app import celery_app

__all__ = ["celery_app"]
