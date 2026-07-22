"""
Celery Application — Central task broker configuration.

Routes tasks to dedicated queues so separate worker processes can scale
independently per workload type:

    docker compose --profile worker up
    # starts a single worker listening on all queues

    celery -A app.tasks.celery_app worker -Q agent-tasks -l info
    # dedicated worker for AI agent tasks only

Configuration
-------------
BROKER:    Redis (required)
BACKEND:   Redis (result store, optional)
BEAT_SCHEDULE: Defined in app.tasks.beat_schedule
"""

import os
import logging

from celery import Celery
from celery.signals import after_setup_logger, worker_ready, worker_shutdown

logger = logging.getLogger("onramp.celery")

# ── Broker URL ───────────────────────────────────────────────────────────────
# Use REDIS_URL if set (production), otherwise compose a default for dev Docker.
_redis_host = os.getenv("REDIS_HOST", "localhost")
_redis_port = os.getenv("REDIS_PORT", "6379")
_redis_password = os.getenv("REDIS_PASSWORD", "")
_pw_part = f":{_redis_password}@" if _redis_password else ""
_broker_url = os.getenv(
    "CELERY_BROKER_URL",
    os.getenv("REDIS_URL", f"redis://{_pw_part}{_redis_host}:{_redis_port}/0"),
)
_result_backend = os.getenv(
    "CELERY_RESULT_BACKEND",
    os.getenv("REDIS_URL", f"redis://{_pw_part}{_redis_host}:{_redis_port}/1"),
)

# ── App Instance ─────────────────────────────────────────────────────────────

celery_app = Celery(
    "onramp",
    broker=_broker_url,
    backend=_result_backend,
    include=[
        "app.tasks.agent_tasks",
        "app.tasks.analytics_tasks",
        "app.tasks.notification_tasks",
    ],
)

# ── Default Config ───────────────────────────────────────────────────────────

celery_app.conf.update(
    # Queue routing — each task module declares its own queue
    task_default_queue="default",
    task_queues=None,  # Let tasks declare their own via @app.task(queue=...)
    # Task execution
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Retry & reliability
    task_acks_late=True,  # Re-deliver if worker crashes mid-task
    task_reject_on_worker_lost=True,
    task_track_started=True,
    task_soft_time_limit=300,   # 5 min soft limit per task
    task_time_limit=360,        # 6 min hard limit
    # Rate limiting — don't hammer external APIs
    task_annotations={
        "app.tasks.agent_tasks.*": {"rate_limit": "10/m"},
        "app.tasks.notification_tasks.*": {"rate_limit": "100/m"},
    },
    # Redis broker visibility timeout (needs to be > task_time_limit)
    broker_transport_options={
        "visibility_timeout": 420,  # 7 min
    },
)

# ── Beat Schedule (loaded lazily to avoid circular imports during worker init) ─

def _load_beat_schedule() -> dict:
    """Import and return the beat schedule dict.

    Imported lazily so the beat_schedule module can import our task functions
    without triggering circular imports during worker startup.
    """
    try:
        from app.tasks.beat_schedule import BEAT_SCHEDULE
        return BEAT_SCHEDULE
    except ImportError:
        logger.warning("beat_schedule module not found — no periodic tasks configured")
        return {}

celery_app.conf.beat_schedule = _load_beat_schedule()


# ── Signals ──────────────────────────────────────────────────────────────────

@worker_ready.connect
def on_worker_ready(sender=None, **kwargs):
    """Log worker startup with queue info."""
    queues = getattr(sender, "queues", None)
    queue_names = list(queues.supported) if queues else []
    logger.info(
        "Celery worker ready — listening on queues: %s",
        ", ".join(queue_names) if queue_names else "default",
    )


@worker_shutdown.connect
def on_worker_shutdown(sender=None, **kwargs):
    logger.info("Celery worker shutting down")


@after_setup_logger.connect
def setup_logging(logger=None, **kwargs):
    """Ensure our logger respects Celery's log level."""
    if logger:
        logger.setLevel(logging.INFO)
