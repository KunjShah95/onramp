"""Tests for provider-key to typed-UUID idempotency mapping."""

import uuid

from app.services.postgres_db import idempotency_document_id


def test_idempotency_document_id_is_stable_uuid():
    value = idempotency_document_id("n8n-nightly-2026-09-24")
    assert str(uuid.UUID(value)) == value
    assert idempotency_document_id("n8n-nightly-2026-09-24") == value
    assert idempotency_document_id("n8n-nightly-2026-09-25") != value


def test_idempotency_document_id_rejects_blank_key():
    try:
        idempotency_document_id("  ")
    except ValueError as exc:
        assert "required" in str(exc)
    else:
        raise AssertionError("blank idempotency key should be rejected")
