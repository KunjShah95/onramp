"""
PostgreSQL Database Service
Provides a unified storage interface (get_storage, query_documents, etc.)
backed by PostgreSQL. The InMemoryStorage class is available for tests.
"""

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from sqlalchemy import select, update, delete, DateTime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import class_mapper, selectinload
from app.database.config import db_config
from app.database import models as db_models

logger = logging.getLogger("onramp.db")


def _is_valid_uuid(value: str) -> bool:
    """Return True if value is a valid UUID string."""
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _get_pk_names(model: type) -> list[str]:
    """Return the primary key column name(s) for a model."""
    try:
        mapper = class_mapper(model)
        return [pk.name for pk in mapper.primary_key]
    except Exception as exc:
        logger.debug("Could not get PK names for %s: %s", model.__name__, exc)
        return ["id"]


def _model_uses_uuid_pk(model: type) -> bool:
    """Return True if the model's primary key column uses a UUID type."""
    try:
        pk = class_mapper(model).primary_key[0]
        return isinstance(pk.type, PG_UUID)
    except Exception as exc:
        logger.debug("Could not check UUID PK for %s: %s", model.__name__, exc)
        return False


# ── Metadata Key Translation ────────────────────────────────────────────────
# Maps models whose "metadata" Python attribute was renamed to avoid clashing
# with sqlalchemy.orm.DeclarativeBase.metadata. Service code passes "metadata"
# as a dict key; the storage layer translates it to the ORM attribute name.

_METADATA_KEY_TRANSLATIONS: dict[type, str] = {
    db_models.Notification: "notif_metadata",
    db_models.XPRecord: "xp_metadata",
    db_models.ContributionMilestone: "milestone_metadata",
    db_models.AuditEvent: "audit_metadata",
}


def _translate_metadata_keys(model_cls: type, data: dict) -> dict:
    """Rename the 'metadata' key to the model's ORM attribute name if needed."""
    attr = _METADATA_KEY_TRANSLATIONS.get(model_cls)
    if attr and "metadata" in data and attr not in data:
        data[attr] = data.pop("metadata")
    return data


def _coerce_datetime_columns(model_cls: type, data: dict) -> dict:
    """Parse ISO-string values into datetimes for DateTime columns.

    Service code (from the DynamicDocument era) still stores timestamps as ISO
    strings, which asyncpg rejects for typed TIMESTAMP columns. Coerce them so
    those writes succeed against the real tables.
    """
    try:
        columns = class_mapper(model_cls).columns
    except Exception:
        return data
    for key, value in list(data.items()):
        if not isinstance(value, str):
            continue
        col = columns.get(key)
        if col is not None and isinstance(col.type, DateTime):
            try:
                data[key] = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                pass
    return data


# ── Model Registry ────────────────────────────────────────────────────────────
# Maps collection name -> (model_class, pk_field_name, is_team_member_like, has_members_eager_load)

_MODEL_REGISTRY: dict[str, tuple] = {
    "users":           (db_models.User, "id", False, False),  # No eager load needed
    "teams":           (db_models.Team, "id", False, True),
    "team_members":    (db_models.TeamMember, None, True, False),  # auto-increment int PK
    "api_keys":        (db_models.ApiKey, "id", False, False),
    "usage_records":   (db_models.UsageRecord, "id", False, False),
    "repositories":    (db_models.Repository, "id", False, False),
    # New models from DynamicDocument migration
    "onramp_tasks":                    (db_models.Task, "task_id", False, False),
    "onramp_notifications":           (db_models.Notification, "notification_id", False, False),
    "onramp_notification_preferences":(db_models.NotificationPreference, "user_id", False, False),
    "onramp_gamification_xp":         (db_models.XPRecord, "xp_id", False, False),
    "onramp_gamification_badges":     (db_models.Badge, "badge_id", False, False),
    "onramp_gamification_streaks":    (db_models.Streak, "streak_id", False, False),
    "onramp_subscriptions":           (db_models.Subscription, "subscription_id", False, False),
    "onramp_webhooks":                (db_models.Webhook, "webhook_id", False, False),
    "onramp_integrations":            (db_models.IntegrationConfig, "id", False, False),
    "onramp_conversations":           (db_models.ConversationTurn, "id", False, False),
    "onramp_learning_paths":          (db_models.LearningPath, "path_id", False, False),
    "onramp_quizzes":                 (db_models.Quiz, "quiz_id", False, False),
    "onramp_quiz_results":            (db_models.QuizResult, "result_id", False, False),
    "member_modules":                 (db_models.MemberModule, "id", False, False),
    "team_invites":                   (db_models.TeamInvite, "id", False, False),
    "onramp_playbooks":               (db_models.Playbook, "playbook_id", False, False),
    "onramp_milestones":              (db_models.ContributionMilestone, "id", False, False),
    "onramp_audit_log":               (db_models.AuditEvent, "event_id", False, False),
    "onramp_webhook_idempotency":     (db_models.WebhookIdempotency, "id", False, False),
    "onramp_webhook_events":          (db_models.WebhookEventLog, "event_id", False, False),
    "onramp_webhook_deliveries":      (db_models.WebhookDelivery, "id", False, False),
}


def _get_model(collection: str):
    """Get (model_class, pk_field, is_team_member) or None for DynamicDocument fallback."""
    entry = _MODEL_REGISTRY.get(collection)
    if entry:
        return entry
    return None


class PostgresStorage:
    """PostgreSQL storage backend with Firestore-like interface.

    Each standalone CRUD method opens a fresh session from the pool and
    commits/rolls back before returning. This avoids sharing a single session
    across concurrent requests and prevents stale/never-committed transactions.

    For atomic multi-table writes (e.g. create team + add owner), use
    ``run_in_transaction()`` which gives you a shared session and lets you
    call the ``_*_in_session`` internal methods.
    """

    # ── Session lifecycle ───────────────────────────────────────────────────

    async def _session(self) -> AsyncSession:
        """Create a fresh, independent database session bound to the current loop."""
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        return factory()

    async def _run(self, operation: Callable[[AsyncSession], Any]) -> Any:
        """Execute *operation* inside a session, then commit and close.

        Raises:
            RuntimeError: wrapped around any exception with collection/op context.
        """
        session = await self._session()
        try:
            result = await operation(session)
            await session.commit()
            return result
        except Exception as exc:
            await session.rollback()
            if not isinstance(exc, RuntimeError):
                raise RuntimeError(f"Database operation failed: {exc}") from exc
            raise
        finally:
            await session.close()

    # ── Transaction support ─────────────────────────────────────────────────

    async def run_in_transaction(self, operations: Callable[[AsyncSession], Any]) -> Any:
        """Execute *operations* atomically inside a single database session.

        Args:
            operations: An async callable ``(session) -> result``. Inside it you
                can call any ``_*_in_session`` method. If the callable raises,
                the entire transaction is rolled back.

        Returns:
            Whatever *operations* returns.

        Raises:
            RuntimeError: on any failure (all changes rolled back).

        Example:

            async def create_team_with_owner(session):
                team = await storage._create_in_session(
                    session, "teams", team_id, team_data,
                )
                member = await storage._create_in_session(
                    session, "team_members", member_id, member_data,
                )
                return {"team": team, "member": member}

            result = await storage.run_in_transaction(create_team_with_owner)
        """
        session = await self._session()
        try:
            result = await operations(session)
            await session.commit()
            return result
        except Exception as exc:
            await session.rollback()
            raise RuntimeError(f"Transaction failed: {exc}") from exc
        finally:
            await session.close()

    # ── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _get_pk_value(model, pk_field: str | None, doc_id: str) -> Any:
        """Convert doc_id to the right type for the model's PK."""
        if pk_field is None:
            return int(doc_id)  # auto-increment int PK
        return doc_id

    async def _get_model_instance(
        self, session: AsyncSession, model, pk_field: str | None, doc_id: str,
    ):
        """Fetch a single model instance by PK inside an existing session."""
        pk_val = self._get_pk_value(model, pk_field, doc_id)
        if _model_uses_uuid_pk(model) and not _is_valid_uuid(str(pk_val)):
            return None
        return await session.get(model, pk_val)

    async def _build_query(self, model, pk_field: str | None, filters: list | None, has_members: bool = False):
        """Build a select query with optional filters and eager loading."""
        if has_members:
            query = select(model).options(selectinload(db_models.Team.members))
        else:
            query = select(model)
        if filters:
            for key, op, value in filters:
                col = getattr(model, key, None)
                if col is None:
                    logger.warning("Unknown filter key '%s' on model %s — skipping", key, model.__name__)
                    continue
                if op == "==":
                    query = query.where(col == value)
                elif op == "in":
                    query = query.where(col.in_(value or []))
                else:
                    logger.warning("Unsupported filter operator '%s' for key '%s'", op, key)
        return query

    # ── Session-aware internal CRUD (usable inside run_in_transaction) ────────

    async def _create_in_session(self, session: AsyncSession, collection: str, doc_id: str, data: dict) -> dict:
        """Create a document inside an existing session (for transactions)."""
        entry = _get_model(collection)
        if entry is None:
            doc = db_models.DynamicDocument(id=doc_id, collection=collection, data=data)
            session.add(doc)
            await session.flush()
            return doc.to_dict()

        model_cls, pk_field, is_tm, has_members = entry
        data = _translate_metadata_keys(model_cls, dict(data))
        data = _coerce_datetime_columns(model_cls, data)

        if is_tm:
            obj = model_cls(**data)
        else:
            pk_val = self._get_pk_value(model_cls, pk_field, doc_id)
            # Callers (from the DynamicDocument era) often include the PK in the
            # data dict too; drop it so it isn't passed twice.
            data.pop(pk_field, None)
            obj = model_cls(**{pk_field: pk_val}, **data)

        session.add(obj)
        await session.flush()
        result = obj.to_dict()

        if collection == "teams":
            result["member_count"] = 0
        return result

    async def _get_in_session(self, session: AsyncSession, collection: str, doc_id: str) -> Optional[dict]:
        """Get a document by ID inside an existing session."""
        entry = _get_model(collection)
        if entry is None:
            result = await session.get(db_models.DynamicDocument, (doc_id, collection))
            return result.to_dict() if result else None

        model_cls, pk_field, is_tm, has_members = entry

        if has_members:
            result = await session.execute(
                select(model_cls).options(selectinload(db_models.Team.members))
                .where(getattr(model_cls, pk_field) == self._get_pk_value(model_cls, pk_field, doc_id))
            )
            obj = result.scalar_one_or_none()
        else:
            obj = await self._get_model_instance(session, model_cls, pk_field, doc_id)

        return obj.to_dict() if obj else None

    async def _update_in_session(self, session: AsyncSession, collection: str, doc_id: str, data: dict) -> Optional[dict]:
        """Update a document inside an existing session."""
        entry = _get_model(collection)
        if entry is None:
            stmt = update(db_models.DynamicDocument).where(
                db_models.DynamicDocument.id == doc_id,
                db_models.DynamicDocument.collection == collection
            ).values(data=data, updated_at=datetime.now(timezone.utc))
            await session.execute(stmt)
            result = await session.get(db_models.DynamicDocument, (doc_id, collection))
            return result.to_dict() if result else None

        model_cls, pk_field, is_tm, has_members = entry
        data = _translate_metadata_keys(model_cls, dict(data))
        data = _coerce_datetime_columns(model_cls, data)
        pk_val = self._get_pk_value(model_cls, pk_field, doc_id)

        if hasattr(model_cls, "updated_at"):
            data["updated_at"] = datetime.now(timezone.utc)

        stmt = update(model_cls).where(getattr(model_cls, pk_field) == pk_val).values(**data)
        await session.execute(stmt)

        if has_members:
            query = select(model_cls).options(selectinload(db_models.Team.members)).where(
                getattr(model_cls, pk_field) == pk_val
            )
            result = await session.execute(query)
            obj = result.scalar_one_or_none()
        else:
            obj = await self._get_model_instance(session, model_cls, pk_field, doc_id)

        return obj.to_dict() if obj else None

    async def _delete_in_session(self, session: AsyncSession, collection: str, doc_id: str) -> None:
        """Delete a document inside an existing session."""
        entry = _get_model(collection)
        if entry is None:
            await session.execute(delete(db_models.DynamicDocument).where(
                db_models.DynamicDocument.id == doc_id,
                db_models.DynamicDocument.collection == collection
            ))
            return

        model_cls, pk_field, is_tm, _ = entry
        pk_val = self._get_pk_value(model_cls, pk_field, doc_id)
        await session.execute(delete(model_cls).where(getattr(model_cls, pk_field) == pk_val))

    async def _list_in_session(self, session: AsyncSession, collection: str) -> List[dict]:
        """List all documents in a collection inside an existing session."""
        entry = _get_model(collection)
        if entry is None:
            result = await session.execute(
                select(db_models.DynamicDocument).where(db_models.DynamicDocument.collection == collection)
            )
            return [doc.to_dict() for doc in result.scalars().all()]

        model_cls, pk_field, is_tm, has_members = entry
        query = await self._build_query(model_cls, pk_field, None, has_members=has_members)
        result = await session.execute(query)
        return [obj.to_dict() for obj in result.scalars().all()]

    async def _query_in_session(
        self, session: AsyncSession, collection: str,
        filters: List[Tuple[str, str, Any]] = None,
    ) -> List[dict]:
        """Query documents with filters inside an existing session."""
        entry = _get_model(collection)
        if entry is None:
            query = select(db_models.DynamicDocument).where(
                db_models.DynamicDocument.collection == collection
            )
            if filters:
                for key, op, value in filters:
                    if op == "==":
                        if isinstance(value, bool):
                            val_str = "true" if value else "false"
                            query = query.where(db_models.DynamicDocument.data[key].astext == val_str)
                        else:
                            query = query.where(db_models.DynamicDocument.data[key].astext == str(value))
                    elif op == "in":
                        query = query.where(db_models.DynamicDocument.data[key].astext.in_([str(v) for v in (value or [])]))
            result = await session.execute(query)
            return [doc.to_dict() for doc in result.scalars().all()]

        model_cls, pk_field, is_tm, has_members = entry
        query = await self._build_query(model_cls, pk_field, filters, has_members=has_members)
        result = await session.execute(query)
        return [obj.to_dict() for obj in result.scalars().all()]

    # ── Batch Operations (atomic) ──────────────────────────────────────────

    async def create_documents(self, collection: str, items: list[tuple[str, dict]]) -> list[dict]:
        """Create multiple documents atomically within a single transaction.

        Args:
            collection: The target collection name.
            items: List of (doc_id, data) tuples.

        Returns:
            List of created document dicts.
        """
        async def _create_batch(session: AsyncSession) -> list[dict]:
            return [await self._create_in_session(session, collection, doc_id, data)
                    for doc_id, data in items]

        return await self._run(_create_batch)

    async def update_documents(self, collection: str, items: list[tuple[str, dict]]) -> list[Optional[dict]]:
        """Update multiple documents atomically within a single transaction.

        Args:
            collection: The target collection name.
            items: List of (doc_id, data) tuples.

        Returns:
            List of updated document dicts (None for missing documents).
        """
        async def _update_batch(session: AsyncSession) -> list[Optional[dict]]:
            return [await self._update_in_session(session, collection, doc_id, data)
                    for doc_id, data in items]

        return await self._run(_update_batch)

    async def delete_documents(self, collection: str, doc_ids: list[str]) -> int:
        """Delete multiple documents atomically within a single transaction.

        Args:
            collection: The target collection name.
            doc_ids: List of document IDs to delete.

        Returns:
            Number of documents deleted.
        """
        async def _delete_batch(session: AsyncSession) -> int:
            for doc_id in doc_ids:
                await self._delete_in_session(session, collection, doc_id)
            return len(doc_ids)

        return await self._run(_delete_batch)

    # ── Single-document CRUD (thin wrappers that delegate to * _in_session) ─

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        """Create a document in the specified collection."""
        return await self._run(
            lambda s: self._create_in_session(s, collection, doc_id, data)
        )

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        """Get a document by ID."""
        return await self._run(
            lambda s: self._get_in_session(s, collection, doc_id)
        )

    async def update_document(self, collection: str, doc_id: str, data: dict) -> Optional[dict]:
        """Update a document."""
        return await self._run(
            lambda s: self._update_in_session(s, collection, doc_id, data)
        )

    async def delete_document(self, collection: str, doc_id: str) -> None:
        """Delete a document."""
        return await self._run(
            lambda s: self._delete_in_session(s, collection, doc_id)
        )

    async def list_documents(self, collection: str) -> List[dict]:
        """List all documents in a collection."""
        return await self._run(
            lambda s: self._list_in_session(s, collection)
        )

    async def query_documents(
        self, collection: str, filters: List[Tuple[str, str, Any]] = None
    ) -> List[dict]:
        """Query documents with filters."""
        return await self._run(
            lambda s: self._query_in_session(s, collection, filters)
        )


class InMemoryStorage:
    """Dict-backed storage with the same async interface as PostgresStorage.

    Used for tests and local runs without a database (STORAGE_BACKEND=memory).
    Handles arbitrary collections generically.

    Also supports ``run_in_transaction()`` and batch methods for API parity
    with ``PostgresStorage``.  In the in-memory backend these are *not*
    truly atomic — they simply execute the operations callable against the
    shared dict.  The interface is identical so code written against the
    memory backend works unchanged against PostgreSQL.

    ``datetime`` objects passed in record values are automatically
    serialized to ISO-8601 strings so that the returned dicts are
    consistent with what ``PostgresStorage`` returns (model ``to_dict()``
    also produces ISO strings).  This prevents comparison code in
    services like ``digest_service`` from breaking when running on
    the memory backend.
    """

    def __init__(self):
        self._data: Dict[str, Dict[str, dict]] = {}

    @staticmethod
    def _serialize(record: dict) -> dict:
        """Convert any datetime values to ISO strings for consistency with PostgresStorage."""
        return {
            k: v.isoformat() if isinstance(v, datetime) else v
            for k, v in record.items()
        }

    def _coll(self, collection: str) -> Dict[str, dict]:
        return self._data.setdefault(collection, {})

    # ── Transaction support ─────────────────────────────────────────────────

    async def run_in_transaction(self, operations: Callable[[Any], Any]) -> Any:
        """In-memory analogue of PostgresStorage.run_in_transaction.

        Executes *operations* (which receives ``None`` instead of a real
        session) against the shared in-memory dict.  If an exception is
        raised, the partial writes **are visible** — this is a documented
        limitation of the memory backend.  Use PostgreSQL for true atomicity.
        """
        try:
            result = await operations(None)
            return result
        except Exception as exc:
            raise RuntimeError(f"Transaction failed (memory backend): {exc}") from exc

    # ── Batch operations ────────────────────────────────────────────────────

    async def create_documents(self, collection: str, items: list[tuple[str, dict]]) -> list[dict]:
        """Create multiple documents."""
        return [await self.create_document(collection, doc_id, data) for doc_id, data in items]

    async def update_documents(self, collection: str, items: list[tuple[str, dict]]) -> list[Optional[dict]]:
        """Update multiple documents."""
        return [await self.update_document(collection, doc_id, data) for doc_id, data in items]

    async def delete_documents(self, collection: str, doc_ids: list[str]) -> int:
        """Delete multiple documents."""
        for doc_id in doc_ids:
            await self.delete_document(collection, doc_id)
        return len(doc_ids)

    # ── Single-document CRUD ────────────────────────────────────────────────

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        record = {**data, "id": doc_id}
        record.setdefault("created_at", now)
        record.setdefault("updated_at", now)
        if collection == "team_members":
            record.setdefault("joined_at", now)
        record = self._serialize(record)
        self._coll(collection)[doc_id] = record
        return dict(record)

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        rec = self._coll(collection).get(doc_id)
        return self._serialize(dict(rec)) if rec else None

    async def update_document(self, collection: str, doc_id: str, data: dict) -> Optional[dict]:
        rec = self._coll(collection).get(doc_id)
        if rec is None:
            return None
        rec.update(data)
        rec["updated_at"] = datetime.now(timezone.utc).isoformat()
        rec = self._serialize(rec)
        return dict(rec)

    async def delete_document(self, collection: str, doc_id: str) -> None:
        self._coll(collection).pop(doc_id, None)

    async def list_documents(self, collection: str) -> List[dict]:
        return [self._serialize(dict(r)) for r in self._coll(collection).values()]

    @staticmethod
    def _matches(record: dict, key: str, op: str, value: Any) -> bool:
        actual = record.get(key)
        if op == "==":
            return actual == value
        if op == "in":
            return actual in (value or [])
        if op == ">=":
            return actual is not None and actual >= value
        if op == "<=":
            return actual is not None and actual <= value
        return False

    async def query_documents(
        self, collection: str, filters: List[Tuple[str, str, Any]] = None
    ) -> List[dict]:
        results = []
        for rec in self._coll(collection).values():
            if filters and not all(self._matches(rec, k, op, v) for k, op, v in filters):
                continue
            results.append(dict(rec))
        return results


_storage = None


def _use_memory_backend() -> bool:
    return os.getenv("STORAGE_BACKEND", "").lower() == "memory"


def get_storage():
    """Get the storage instance (PostgreSQL, or in-memory when STORAGE_BACKEND=memory)."""
    global _storage
    if _storage is None:
        _storage = InMemoryStorage() if _use_memory_backend() else PostgresStorage()
    return _storage


def generate_id() -> str:
    """Generate a UUID"""
    return str(uuid.uuid4())


async def initialize_db() -> None:
    """Initialize storage on startup.

    - Memory backend: nothing to do.
    - Production: schema is managed by Alembic migrations, not auto-create.
    - Dev/local Postgres: auto-create tables for convenience.
    """
    if _use_memory_backend():
        return
    if os.getenv("ENV", os.getenv("ENVIRONMENT", "production")).lower() == "production":
        logger.info("Production: skipping auto-create; run Alembic migrations.")
        return
    await db_config.create_tables()
