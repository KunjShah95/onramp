"""Migrate data from dynamic_documents JSONB table to real SQL tables.

After migration 008 created dedicated tables for 21 previously-DynamicDocument
collections (onramp_tasks, onramp_notifications, onramp_gamification_xp, etc.),
any existing rows still sit as JSONB blobs in the dynamic_documents table.

This script reads those rows, extracts the data, and re-inserts them into the
proper typed columns via the PostgresStorage layer — which handles datetime
coercion, metadata key translation, UUID validation, and FK constraint safety.

Usage:
    cd backend
    python ../scripts/migrate_dynamic_to_tables.py                       # Full migrate
    python ../scripts/migrate_dynamic_to_tables.py --dry-run              # Preview only
    python ../scripts/migrate_dynamic_to_tables.py --collection onramp_tasks  # Single collection
    python ../scripts/migrate_dynamic_to_tables.py --skip-existing        # Don't overwrite
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
os.environ.setdefault("ENV", "development")
os.environ.setdefault(
    "PII_ENCRYPTION_KEY",
    "Yk9yLVlpN1RaMkVTSnRiV3hBZ01GdWpGS2U0dUdnMkU=",
)

from app.database.config import db_config
from app.database import models as db_models
from app.services.postgres_db import get_storage, _get_model
from sqlalchemy import select, text
from sqlalchemy.orm import class_mapper

logger = logging.getLogger("migrate")
logging.basicConfig(level=logging.INFO, format="%(message)s")

# ── Known collections that have real tables now ─────────────────────────────

MIGRATABLE_COLLECTIONS = [
    "onramp_tasks",
    "onramp_notifications",
    "onramp_notification_preferences",
    "onramp_gamification_xp",
    "onramp_gamification_badges",
    "onramp_gamification_streaks",
    "onramp_subscriptions",
    "onramp_webhooks",
    "onramp_integrations",
    "onramp_conversations",
    "onramp_learning_paths",
    "onramp_quizzes",
    "onramp_quiz_results",
    "member_modules",
    "team_invites",
    "onramp_playbooks",
    "onramp_milestones",
    "onramp_audit_log",
    "onramp_webhook_idempotency",
    "onramp_webhook_events",
    "onramp_webhook_deliveries",
]

# Metadata key translation table — mirrors postgres_db._METADATA_KEY_TRANSLATIONS
_METADATA_TRANSLATIONS = {
    db_models.Notification: "notif_metadata",
    db_models.XPRecord: "xp_metadata",
    db_models.ContributionMilestone: "milestone_metadata",
    db_models.AuditEvent: "audit_metadata",
}

# ── Column helpers ──────────────────────────────────────────────────────────


def _get_column_info(model_cls: type) -> tuple[set[str], set[str]]:
    """
    Return (datetime_column_names, nullable_column_names) for the model.
    """
    try:
        mapper = class_mapper(model_cls)
        dt_cols = {
            col.name for col in mapper.columns
            if isinstance(col.type, db_models.DateTime)
        }
        nullable_cols = {col.name for col in mapper.columns if col.nullable}
        return dt_cols, nullable_cols
    except Exception:
        return set(), set()


def _coerce_row(model_cls: type, row: dict) -> dict:
    """Convert ISO-string datetime values to proper datetime objects,
    and convert empty-string values to None ONLY for nullable columns.

    DynamicDocument stores timestamps as ISO strings and may use ""
    for nullable FK columns. PostgreSQL rejects "" for UUID columns.
    """
    dt_cols, nullable_cols = _get_column_info(model_cls)
    for key, value in list(row.items()):
        # Empty string to None ONLY for nullable columns
        if value == "" and key in nullable_cols:
            row[key] = None
            continue
        # ISO string to datetime
        if key in dt_cols and isinstance(value, str):
            try:
                row[key] = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
    return row


def _translate_metadata(model_cls: type, row: dict) -> dict:
    """Rename 'metadata' key to model-specific attribute name if needed."""
    attr = _METADATA_TRANSLATIONS.get(model_cls)
    if attr and "metadata" in row and attr not in row:
        row[attr] = row.pop("metadata")
    return row


# ── Migration logic ─────────────────────────────────────────────────────────


async def migrate_collection(
    collection: str,
    dry_run: bool = False,
    skip_existing: bool = True,
) -> int:
    """Migrate all rows for a single collection from dynamic_documents to its real table.

    Returns the number of rows migrated.
    """
    entry = _get_model(collection)
    if entry is None:
        logger.warning("  [SKIP] No real table registered for collection '%s'", collection)
        return 0

    model_cls, pk_field, is_tm, has_members = entry
    table_name = model_cls.__tablename__

    logger.info(    "  -- %s --> %s (PK: %s)", collection, table_name, pk_field)

    # Fetch all dynamic_document rows for this collection
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()

    async with factory() as session:
        result = await session.execute(
            select(db_models.DynamicDocument).where(
                db_models.DynamicDocument.collection == collection
            )
        )
        docs = result.scalars().all()

    if not docs:
        logger.info("     No rows found in dynamic_documents for '%s'.", collection)
        return 0

    logger.info("     Found %d row(s) in dynamic_documents.", len(docs))

    migrated = 0
    skipped = 0
    errors = 0

    for doc in docs:
        doc_id = doc.id
        data = dict(doc.data) if doc.data else {}

        # Merge dynamic document's own timestamps (they're not in the data blob).
        # Only include updated_at if the target model has that column.
        if doc.created_at:
            data.setdefault("created_at", doc.created_at)
        _has_updated_at = hasattr(model_cls, "updated_at")
        if doc.updated_at and _has_updated_at:
            data.setdefault("updated_at", doc.updated_at)

        # Apply metadata key translation (metadata → notif_metadata, etc.)
        data = _translate_metadata(model_cls, data)

        # Coerce ISO strings to datetime objects
        data = _coerce_row(model_cls, data)

        # The DynamicDocument's id is usually the same as the target PK.
        # For team_members (auto-increment int PK), pk_field is None.
        pk_value = doc_id
        if is_tm:
            pk_value = doc_id  # auto-increment, but we use the string id

        if dry_run:
            logger.info("     [DRY] Would migrate %s (id=%s)", collection, str(doc_id)[:16])
            migrated += 1
            continue

        # Skip if record already exists in the target table
        if skip_existing:
            storage = get_storage()
            existing = await storage.get_document(collection, pk_value)
            if existing is not None:
                logger.info("     [SKIP] %s already exists in %s", str(doc_id)[:16], table_name)
                skipped += 1
                continue

        try:
            storage = get_storage()
            await storage.create_document(collection, pk_value, data)
            migrated += 1
            logger.info("     [OK]   Migrated %s (id=%s)", collection, str(doc_id)[:16])
        except Exception as exc:
            errors += 1
            logger.warning("     [ERR]  %s (id=%s): %s", collection, str(doc_id)[:16], str(exc)[:120])

    skipped = len(docs) - migrated - errors
    logger.info(
        "     Result: %d migrated, %d skipped, %d errors / %d total",
        migrated, skipped, errors, len(docs),
    )
    return migrated


async def main():
    parser = argparse.ArgumentParser(description="Migrate dynamic_documents to real tables")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--collection", type=str, default=None,
                        help="Migrate only this collection (default: all)")
    parser.add_argument("--skip-existing", action="store_true", default=True,
                        help="Skip records that already exist in the target table")
    parser.add_argument("--no-skip-existing", action="store_false", dest="skip_existing",
                        help="Overwrite existing records")
    args = parser.parse_args()

    collections = [args.collection] if args.collection else MIGRATABLE_COLLECTIONS

    print()
    print("+------------------------------------------------------------+")
    print("|  DynamicDocument → Real Table Migration                    |")
    print("+------------------------------------------------------------+")
    print()
    if args.dry_run:
        print("  [DRY RUN] - no data will be written\n")

    total = 0
    for coll in collections:
        count = await migrate_collection(
            coll,
            dry_run=args.dry_run,
            skip_existing=args.skip_existing,
        )
        total += count
        print()

    if args.dry_run:
        print(f"  Dry run complete. Would migrate ~{total} records across {len(collections)} collections.\n")
    else:
        print(f"  Migration complete. {total} records migrated across {len(collections)} collections.\n")


if __name__ == "__main__":
    asyncio.run(main())
