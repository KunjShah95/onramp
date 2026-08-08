"""
Structured logging configuration.

Switches the root logger between:
  - human-friendly text (default / local dev)::
        2026-08-08 12:00:01 [INFO] onramp: method=GET path=/health status=200
  - production JSON lines (LOG_FORMAT=json), one object per line — parseable
    by Datadog, Loki, CloudWatch, ELK, etc.::
        {"ts":"2026-08-08T12:00:01Z","level":"INFO","logger":"onramp",
         "request_id":"ab12...","method":"GET","path":"/health","status":200,
         "duration_ms":2.1}

Enable with ``LOG_FORMAT=json``; optionally set ``LOG_LEVEL`` (INFO default)
and ``LOG_TIMESTAMP_FORMAT`` for the text formatter.
"""

from __future__ import annotations

import json
import logging
import os
import time


class JsonFormatter(logging.Formatter):
    """Logging formatter that emits one JSON object per line."""

    def __init__(self, include_extra: bool = True) -> None:
        super().__init__()
        self.include_extra = include_extra

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # exc_info may be a tuple (exc_type, exc, tb) or simply ``True``
        # (in which case the current exception is implied) — handle both.
        exc = record.exc_info
        if exc is True:
            import sys

            exc = sys.exc_info()
        if exc and exc[0] is not None:
            payload["exc_info"] = self.formatException(exc)
        if self.include_extra:
            for key, value in record.__dict__.items():
                if key in payload or key in (
                    "name", "msg", "args", "levelname", "levelno", "pathname",
                    "filename", "module", "exc_info", "exc_text", "stack_info",
                    "lineno", "funcName", "created", "msecs", "relativeCreated",
                    "thread", "threadName", "processName", "process", "taskName",
                    "message",
                ):
                    continue
                if isinstance(value, (str, int, float, bool)) or value is None:
                    payload[key] = value
        return json.dumps(payload, default=str)


class KeyValueFormatter(logging.Formatter):
    """Classic ``key=value`` text formatter (the pre-existing style)."""

    def __init__(self, fmt: str | None = None, datefmt: str | None = None) -> None:
        super().__init__(fmt, datefmt)

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        return base


def configure_logging() -> None:
    """Configure the root logger based on env vars. Idempotent-ish (call once)."""
    log_format = os.getenv("LOG_FORMAT", "text").lower()
    log_level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

    root = logging.getLogger()
    # Clear any pre-existing handlers so configure_logging() is idempotent.
    for handler in list(root.handlers):
        root.removeHandler(handler)
        handler.close()

    handler = logging.StreamHandler()
    if log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
            )
        )
    root.addHandler(handler)
    root.setLevel(log_level)
    # Keep uvicorn access logs but quiet noisy third-party loggers.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
