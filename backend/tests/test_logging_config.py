"""Tests for the structured JSON logging formatter."""

import json
import logging

from app.logging_config import JsonFormatter, KeyValueFormatter


def test_json_formatter_emits_valid_json():
    record = logging.LogRecord(
        name="onramp.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    out = JsonFormatter().format(record)
    payload = json.loads(out)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "onramp.test"
    assert payload["message"] == "hello world"
    assert "ts" in payload


def test_json_formatter_includes_extra_fields():
    record = logging.LogRecord(
        name="onramp", level=logging.INFO, pathname=__file__,
        lineno=10, msg="request", args=(), exc_info=None,
    )
    record.request_id = "abc123"
    record.user_id = "u1"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["request_id"] == "abc123"
    assert payload["user_id"] == "u1"


def test_json_formatter_exc_info_serialized():
    import sys

    try:
        raise ValueError("boom")
    except ValueError:
        # Capture the exception tuple while it is still active (this is what
        # logging does at creation time when exc_info=True is passed).
        exc_info = sys.exc_info()
    record = logging.LogRecord(
        name="onramp", level=logging.ERROR, pathname=__file__,
        lineno=10, msg="failed", args=(), exc_info=exc_info,
    )
    payload = json.loads(JsonFormatter().format(record))
    assert "exc_info" in payload
    assert "ValueError: boom" in payload["exc_info"]


def test_key_value_formatter_works():
    record = logging.LogRecord(
        name="onramp", level=logging.INFO, pathname=__file__,
        lineno=10, msg="method=%s path=%s", args=("GET", "/health"), exc_info=None,
    )
    out = KeyValueFormatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    ).format(record)
    assert "[INFO] onramp: method=GET path=/health" in out
