"""
PostgreSQL Database Service
Replaces Firestore with PostgreSQL while maintaining the same interface
"""

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import class_mapper, selectinload
from app.database.config import db_config, get_db
from app.database.models import User, Team, TeamMember, ApiKey, UsageRecord, DynamicDocument

logger = logging.getLogger("codeflow.db")


def _is_valid_uuid(value: str) -> bool:
    """Return True if value is a valid UUID string."""
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _model_uses_uuid_pk(model: type) -> bool:
    """Return True if the model's primary key column uses a UUID type."""
    try:
        pk = class_mapper(model).primary_key[0]
        return isinstance(pk.type, PG_UUID)
    except Exception:
        return False


class PostgresStorage:
    """PostgreSQL storage backend with Firestore-like interface.

    Each operation opens a fresh session from the pool and commits/rolls back
    before returning. This avoids sharing a single session across concurrent
    requests and prevents stale/never-committed transactions.
    """

    async def _session(self) -> AsyncSession:
        """Create a fresh, independent database session bound to the current loop."""
        await db_config.ensure_engine()
        factory = db_config.get_session_factory()
        return factory()

    async def _run(self, operation):
        """Run a callable inside a session and commit/rollback/close."""
        session = await self._session()
        try:
            result = await operation(session)
            await session.commit()
            return result
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        """Create a document in the specified collection"""
        async def _create(session: AsyncSession) -> dict:
            if collection == "users":
                user = User(id=doc_id, **data)
                session.add(user)
                await session.flush()
                return user.to_dict()

            elif collection == "teams":
                team = Team(id=doc_id, **data)
                session.add(team)
                await session.flush()
                team_dict = team.to_dict()
                team_dict["member_count"] = 0  # Brand new team has 0 members
                return team_dict

            elif collection == "team_members":
                # handle auto-increment id correctly by ignoring doc_id or using it for lookup
                # team_members doesn't strictly use UUID string primary keys in models.py (uses autoincrement ID)
                # But to maintain Firestore compatibility, we can just use the provided doc_id if we added a string id.
                # Actually, TeamMember has id as integer! We can't insert string doc_id. 
                # Let's see what TeamMember has: `id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)`
                member = TeamMember(**data)
                session.add(member)
                await session.flush()
                return {
                    "id": str(member.id),
                    "user_id": member.user_id,
                    "team_id": member.team_id,
                    "role": member.role,
                    "joined_at": member.joined_at.isoformat()
                }

            elif collection == "api_keys":
                api_key = ApiKey(id=doc_id, **data)
                session.add(api_key)
                await session.flush()
                return api_key.to_dict()

            elif collection == "usage_records":
                record = UsageRecord(id=doc_id, **data)
                session.add(record)
                await session.flush()
                return record.to_dict()

            else:
                doc = DynamicDocument(id=doc_id, collection=collection, data=data)
                session.add(doc)
                await session.flush()
                return doc.to_dict()

        return await self._run(_create)

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        """Get a document by ID"""
        model_map = {
            "users": User,
            "teams": Team,
            "team_members": TeamMember,
            "api_keys": ApiKey,
            "usage_records": UsageRecord,
        }
        model = model_map.get(collection)
        if model is not None and _model_uses_uuid_pk(model) and not _is_valid_uuid(doc_id):
            return None

        async def _get(session: AsyncSession) -> Optional[dict]:
            if collection == "users":
                result = await session.get(User, doc_id)
                return result.to_dict() if result else None

            elif collection == "teams":
                result = await session.execute(
                    select(Team).options(selectinload(Team.members)).where(Team.id == doc_id)
                )
                team = result.scalar_one_or_none()
                return team.to_dict() if team else None

            elif collection == "team_members":
                result = await session.get(TeamMember, int(doc_id))
                return {
                    "id": str(result.id),
                    "user_id": result.user_id,
                    "team_id": result.team_id,
                    "role": result.role,
                    "joined_at": result.joined_at.isoformat()
                } if result else None

            elif collection == "api_keys":
                result = await session.get(ApiKey, doc_id)
                return result.to_dict() if result else None

            elif collection == "usage_records":
                result = await session.get(UsageRecord, doc_id)
                return result.to_dict() if result else None

            else:
                result = await session.get(DynamicDocument, (doc_id, collection))
                return result.to_dict() if result else None

        return await self._run(_get)

    async def update_document(self, collection: str, doc_id: str, data: dict) -> dict:
        """Update a document"""
        async def _update(session: AsyncSession) -> dict:
            if collection == "users":
                stmt = update(User).where(User.id == doc_id).values(**data, updated_at=datetime.now(timezone.utc))
                await session.execute(stmt)
                result = await session.get(User, doc_id)
                return result.to_dict() if result else None

            elif collection == "teams":
                stmt = update(Team).where(Team.id == doc_id).values(**data, updated_at=datetime.now(timezone.utc))
                await session.execute(stmt)
                result = await session.execute(
                    select(Team).options(selectinload(Team.members)).where(Team.id == doc_id)
                )
                team = result.scalar_one_or_none()
                return team.to_dict() if team else None

            elif collection == "team_members":
                stmt = update(TeamMember).where(TeamMember.id == int(doc_id)).values(**data)
                await session.execute(stmt)
                result = await session.get(TeamMember, int(doc_id))
                return {
                    "id": str(result.id),
                    "user_id": result.user_id,
                    "team_id": result.team_id,
                    "role": result.role,
                    "joined_at": result.joined_at.isoformat()
                } if result else None

            elif collection == "api_keys":
                stmt = update(ApiKey).where(ApiKey.id == doc_id).values(**data)
                await session.execute(stmt)
                result = await session.get(ApiKey, doc_id)
                return result.to_dict() if result else None

            elif collection == "usage_records":
                stmt = update(UsageRecord).where(UsageRecord.id == doc_id).values(**data)
                await session.execute(stmt)
                result = await session.get(UsageRecord, doc_id)
                return result.to_dict() if result else None

            else:
                stmt = update(DynamicDocument).where(
                    DynamicDocument.id == doc_id, 
                    DynamicDocument.collection == collection
                ).values(data=data, updated_at=datetime.now(timezone.utc))
                await session.execute(stmt)
                result = await session.get(DynamicDocument, (doc_id, collection))
                return result.to_dict() if result else None

        return await self._run(_update)

    async def delete_document(self, collection: str, doc_id: str) -> None:
        """Delete a document"""
        async def _delete(session: AsyncSession) -> None:
            if collection == "users":
                await session.execute(delete(User).where(User.id == doc_id))

            elif collection == "teams":
                await session.execute(delete(Team).where(Team.id == doc_id))

            elif collection == "team_members":
                await session.execute(delete(TeamMember).where(TeamMember.id == int(doc_id)))

            elif collection == "api_keys":
                await session.execute(delete(ApiKey).where(ApiKey.id == doc_id))

            elif collection == "usage_records":
                await session.execute(delete(UsageRecord).where(UsageRecord.id == doc_id))

            else:
                await session.execute(delete(DynamicDocument).where(
                    DynamicDocument.id == doc_id,
                    DynamicDocument.collection == collection
                ))

        await self._run(_delete)

    async def list_documents(self, collection: str) -> List[dict]:
        """List all documents in a collection"""
        async def _list(session: AsyncSession) -> List[dict]:
            if collection == "users":
                result = await session.execute(select(User))
                return [user.to_dict() for user in result.scalars().all()]

            elif collection == "teams":
                result = await session.execute(select(Team).options(selectinload(Team.members)))
                return [team.to_dict() for team in result.scalars().all()]

            elif collection == "team_members":
                result = await session.execute(select(TeamMember))
                return [{
                    "id": str(member.id),
                    "user_id": member.user_id,
                    "team_id": member.team_id,
                    "role": member.role,
                    "joined_at": member.joined_at.isoformat()
                } for member in result.scalars().all()]

            elif collection == "api_keys":
                result = await session.execute(select(ApiKey))
                return [key.to_dict() for key in result.scalars().all()]

            elif collection == "usage_records":
                result = await session.execute(select(UsageRecord))
                return [record.to_dict() for record in result.scalars().all()]

            else:
                result = await session.execute(select(DynamicDocument).where(DynamicDocument.collection == collection))
                return [doc.to_dict() for doc in result.scalars().all()]

        return await self._run(_list)

    async def query_documents(
        self, collection: str, filters: List[Tuple[str, str, Any]] = None
    ) -> List[dict]:
        """Query documents with filters"""
        async def _query(session: AsyncSession) -> List[dict]:
            if collection == "users":
                query = select(User)
                if filters:
                    for key, op, value in filters:
                        if op == "==":
                            query = query.where(getattr(User, key) == value)
                        elif op == "in":
                            query = query.where(getattr(User, key).in_(value or []))
                result = await session.execute(query)
                return [user.to_dict() for user in result.scalars().all()]

            elif collection == "teams":
                query = select(Team).options(selectinload(Team.members))
                if filters:
                    for key, op, value in filters:
                        if op == "==":
                            query = query.where(getattr(Team, key) == value)
                        elif op == "in":
                            query = query.where(getattr(Team, key).in_(value or []))
                result = await session.execute(query)
                return [team.to_dict() for team in result.scalars().all()]

            elif collection == "team_members":
                query = select(TeamMember)
                if filters:
                    for key, op, value in filters:
                        if op == "==":
                            query = query.where(getattr(TeamMember, key) == value)
                        elif op == "in":
                            query = query.where(getattr(TeamMember, key).in_(value or []))
                result = await session.execute(query)
                return [{
                    "id": str(member.id),
                    "user_id": member.user_id,
                    "team_id": member.team_id,
                    "role": member.role,
                    "joined_at": member.joined_at.isoformat()
                } for member in result.scalars().all()]

            elif collection == "api_keys":
                query = select(ApiKey)
                if filters:
                    for key, op, value in filters:
                        if op == "==":
                            query = query.where(getattr(ApiKey, key) == value)
                        elif op == "in":
                            query = query.where(getattr(ApiKey, key).in_(value or []))
                result = await session.execute(query)
                return [key.to_dict() for key in result.scalars().all()]

            elif collection == "usage_records":
                query = select(UsageRecord)
                if filters:
                    for key, op, value in filters:
                        if op == "==":
                            query = query.where(getattr(UsageRecord, key) == value)
                        elif op == "in":
                            query = query.where(getattr(UsageRecord, key).in_(value or []))
                result = await session.execute(query)
                return [record.to_dict() for record in result.scalars().all()]

            else:
                query = select(DynamicDocument).where(DynamicDocument.collection == collection)
                # Cannot easily filter deeply nested JSONB without raw SQL/operators, but implement basic key matching
                if filters:
                    for key, op, value in filters:
                        if op == "==":
                            if isinstance(value, bool):
                                val_str = "true" if value else "false"
                                query = query.where(DynamicDocument.data[key].astext == val_str)
                            else:
                                query = query.where(DynamicDocument.data[key].astext == str(value))
                        elif op == "in":
                            # Simplistic fallback for IN
                            pass
                result = await session.execute(query)
                return [doc.to_dict() for doc in result.scalars().all()]

        return await self._run(_query)


class InMemoryStorage:
    """Dict-backed storage with the same async interface as PostgresStorage.

    Used for tests and local runs without a database (STORAGE_BACKEND=memory).
    Handles arbitrary collections generically.
    """

    def __init__(self):
        self._data: Dict[str, Dict[str, dict]] = {}

    def _coll(self, collection: str) -> Dict[str, dict]:
        return self._data.setdefault(collection, {})

    async def create_document(self, collection: str, doc_id: str, data: dict) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        record = {**data, "id": doc_id}
        record.setdefault("created_at", now)
        record.setdefault("updated_at", now)
        if collection == "team_members":
            record.setdefault("joined_at", now)
        self._coll(collection)[doc_id] = record
        return dict(record)

    async def get_document(self, collection: str, doc_id: str) -> Optional[dict]:
        rec = self._coll(collection).get(doc_id)
        return dict(rec) if rec else None

    async def update_document(self, collection: str, doc_id: str, data: dict) -> Optional[dict]:
        rec = self._coll(collection).get(doc_id)
        if rec is None:
            return None
        rec.update(data)
        rec["updated_at"] = datetime.now(timezone.utc).isoformat()
        return dict(rec)

    async def delete_document(self, collection: str, doc_id: str) -> None:
        self._coll(collection).pop(doc_id, None)

    async def list_documents(self, collection: str) -> List[dict]:
        return [dict(r) for r in self._coll(collection).values()]

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
