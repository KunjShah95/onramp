"""Regression test: PostgresStorage._build_query coerces ISO-8601 string
values to real datetimes for comparison filters on DateTime columns.

Previously the `>=` / `<=` filters bound the raw ISO string as VARCHAR, which
Postgres rejects for timestamptz columns ("operator does not exist:
timestamp with time zone >= character varying") — breaking every endpoint
that runs the quota/usage check (e.g. /explore/analyze).
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.database import models as db_models
from app.services.postgres_db import PostgresStorage, _get_model


async def test_comparison_filter_coerces_iso_string_to_datetime():
    storage = PostgresStorage()
    model = _get_model("usage_records")[0]

    query = await storage._build_query(
        model,
        None,
        [("created_at", ">=", "2026-08-01T00:00:00+00:00")],
    )

    # Extract the bound literal value used on the right side of created_at >= ...
    compared = query.whereclause.right
    coerced = compared.effective_value if hasattr(compared, "effective_value") else None

    assert isinstance(coerced, datetime)
    assert coerced.tzinfo is not None
    assert coerced == datetime(2026, 8, 1, tzinfo=timezone.utc)


async def test_comparison_filter_handles_invalid_string_gracefully():
    storage = PostgresStorage()
    model = _get_model("usage_records")[0]

    query = await storage._build_query(
        model,
        None,
        [("created_at", ">=", "not-a-date")],
    )

    compared = query.whereclause.right
    value = compared.effective_value if hasattr(compared, "effective_value") else None
    # Unparseable strings pass through unchanged rather than crashing the build.
    assert value == "not-a-date"


async def test_comparison_filter_preserves_datetime_values():
    storage = PostgresStorage()
    model = _get_model("usage_records")[0]
    dt = datetime(2026, 8, 1, tzinfo=timezone.utc)

    query = await storage._build_query(
        model,
        None,
        [("created_at", ">=", dt)],
    )

    compared = query.whereclause.right
    value = compared.effective_value if hasattr(compared, "effective_value") else None
    assert value == dt