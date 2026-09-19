"""Tests for _coerce_uuid_columns (postgres_db backstop).

Blank strings must never reach asyncpg for typed UUID columns — the driver
rejects them (``invalid UUID ''``), which previously turned ``log_event``
(and any similar writer) into a 500 on Postgres. Valid values pass through
untouched.
"""

from app.database import models as db_models
from app.services.postgres_db import _coerce_uuid_columns


class TestCoerceUuidColumns:
    def test_blank_uuid_becomes_none(self):
        data = _coerce_uuid_columns(
            db_models.AuditEvent, {"team_id": "", "actor_id": "x"}
        )
        assert data["team_id"] is None
        assert data["actor_id"] == "x"  # non-blank untouched

    def test_whitespace_only_becomes_none(self):
        data = _coerce_uuid_columns(db_models.AuditEvent, {"team_id": "   "})
        assert data["team_id"] is None

    def test_valid_uuid_preserved(self):
        team_id = "1f7e47fe-591e-4183-bf81-4aac27bf5e2f"
        data = _coerce_uuid_columns(db_models.AuditEvent, {"team_id": team_id})
        assert data["team_id"] == team_id

    def test_non_uuid_blank_string_preserved(self):
        # "" is legitimate for String columns (e.g. AuditEvent.target_id).
        data = _coerce_uuid_columns(
            db_models.AuditEvent, {"target_id": "", "event_type": "x"}
        )
        assert data["target_id"] == ""
        assert data["event_type"] == "x"

    def test_none_and_missing_keys_untouched(self):
        data = _coerce_uuid_columns(db_models.AuditEvent, {"team_id": None})
        assert data["team_id"] is None
        assert _coerce_uuid_columns(db_models.AuditEvent, {}) == {}
