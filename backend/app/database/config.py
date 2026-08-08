"""
PostgreSQL Database Configuration
Secure connection pooling with asyncpg and SQLAlchemy
"""

import asyncio
import os
from typing import Optional
from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker, AsyncEngine
from sqlalchemy.orm import DeclarativeBase
import logging

logger = logging.getLogger(__name__)


def _register_vector_codec(dbapi_connection, connection_record):
    """Decode pgvector columns for asyncpg (required by pgvector.sqlalchemy)."""
    try:
        import asyncpg
        import pgvector.asyncpg

        if isinstance(dbapi_connection, asyncpg.Connection):
            pgvector.asyncpg.register_vector(dbapi_connection)
    except Exception:  # pragma: no cover - non-Postgres backends (memory) have no dbapi connection
        pass


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models"""
    pass


class DatabaseConfig:
    """Database configuration with secure defaults"""
    
    def __init__(self):
        self.env = os.getenv("ENV", os.getenv("ENVIRONMENT", "production")).lower()
        self.is_production = self.env == "production"

        # Do NOT silently fall back to insecure default credentials in production.
        # In production the DATABASE_URL must be explicitly provided. The localhost
        # postgres:postgres fallback is only acceptable for local/dev environments.
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url and not self.is_production:
            self.database_url = (
                "postgresql+asyncpg://postgres:postgres@localhost:5432/onramp"
            )

        # SQLAlchemy async engine requires an async driver. Rewrite plain
        # postgresql:// URLs to use asyncpg so the app doesn't fail at runtime.
        if self.database_url and self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )

        self.pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
        self.max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "20"))
        self.pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))
        self.pool_recycle = int(os.getenv("DB_POOL_RECYCLE", "1800"))
        # Default to `require` in production, `prefer` otherwise.
        self.ssl_mode = os.getenv(
            "DB_SSL_MODE", "require" if self.is_production else "prefer"
        )

        # Remove sslmode and channel_binding from query parameters since asyncpg
        # doesn't support them as query params and throws TypeError. We handle SSL
        # via connect_args instead, and channel_binding is not needed in-app.
        if self.database_url and "?" in self.database_url:
            base_url, query = self.database_url.split("?", 1)
            from urllib.parse import parse_qs, urlencode
            params = parse_qs(query)
            if "sslmode" in params:
                # If sslmode was set in URL, we respect it and override ssl_mode config
                url_ssl_mode = params["sslmode"][0]
                self.ssl_mode = url_ssl_mode
                del params["sslmode"]
            if "channel_binding" in params:
                # asyncpg doesn't support channel_binding as a URL query param
                del params["channel_binding"]
            if params:
                self.database_url = f"{base_url}?{urlencode(params, doseq=True)}"
            else:
                self.database_url = base_url


        self._engine: Optional[AsyncEngine] = None
        self._session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        self._engine_loop: Optional[asyncio.AbstractEventLoop] = None

    async def ensure_engine(self) -> AsyncEngine:
        """Get or recreate the engine bound to the current running event loop.

        asyncpg connections are tied to the event loop that created them.  When
        tests run in different loops (e.g. TestClient's loop vs pytest-asyncio's
        loop) we must dispose the old engine and create a new one bound to the
        current loop to avoid 'attached to a different loop' errors.
        """
        current_loop = asyncio.get_running_loop()
        if self._engine is not None and self._engine_loop is current_loop:
            return self._engine

        if self._engine is not None:
            try:
                await self._engine.dispose()
            except Exception as exc:  # pragma: no cover - best-effort cleanup
                logger.warning(f"Error disposing old engine: {exc}")
            finally:
                self._engine = None
                self._session_factory = None

        engine = self.get_engine()
        self._engine_loop = current_loop
        return engine

    def get_engine(self) -> AsyncEngine:
        """Get or create the async engine with connection pooling"""
        if self._engine is None:
            if not self.database_url:
                # Reached only when ENV=production and DATABASE_URL is unset.
                raise RuntimeError(
                    "DATABASE_URL environment variable is required in production. "
                    "Refusing to start with insecure default credentials "
                    "(postgres:postgres@localhost). Set DATABASE_URL explicitly."
                )

            # asyncpg does not read the libpq `sslmode` URL query param; SSL must
            # be passed via connect_args. Map our ssl_mode to an asyncpg `ssl` arg.
            engine_params = {
                "echo": os.getenv("DB_ECHO", "false").lower() == "true",
                "pool_size": self.pool_size,
                "max_overflow": self.max_overflow,
                "pool_timeout": self.pool_timeout,
                "pool_recycle": self.pool_recycle,
                "pool_pre_ping": True,
            }

            connect_args = self._build_connect_args()
            if connect_args:
                engine_params["connect_args"] = connect_args

            self._engine = create_async_engine(
                self.database_url,
                **engine_params
            )
            event.listen(self._engine.sync_engine, "connect", _register_vector_codec)
            logger.info(
                f"Database engine created with pool_size={self.pool_size}, "
                f"max_overflow={self.max_overflow}"
            )
        
        return self._engine

    def _build_connect_args(self) -> dict:
        """Translate ssl_mode into asyncpg connect_args.

        Only applies to asyncpg URLs. Maps libpq-style modes to asyncpg's `ssl`:
          - disable / allow / prefer -> no enforced TLS (None)
          - require / verify-ca / verify-full -> an SSL context (enforced TLS)
        """
        if "asyncpg" not in (self.database_url or ""):
            return {}
        mode = (self.ssl_mode or "prefer").lower()
        if mode == "prefer" and self.env == "production":
            mode = "verify-full"
        if mode in ("disable", "allow", "prefer"):
            return {}
        import ssl as _ssl
        ctx = _ssl.create_default_context()
        if mode == "require":
            # Encrypt but don't verify the server cert/hostname.
            ctx.check_hostname = False
            ctx.verify_mode = _ssl.CERT_NONE
        # verify-ca / verify-full keep full verification (default context).
        return {"ssl": ctx}

    def get_session_factory(self) -> async_sessionmaker[AsyncSession]:
        """Get or create the session factory"""
        if self._session_factory is None:
            engine = self.get_engine()
            self._session_factory = async_sessionmaker(
                engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autocommit=False,
                autoflush=False,
            )
        
        return self._session_factory
    
    async def create_tables(self, retries: int = 5, base_delay: float = 1.0):
        """Create all tables (for development only - use migrations in production).

        Retries with exponential backoff so a transient DNS/network blip on
        startup (e.g. Neon cold-start, flaky DNS) does not crash the app.
        """
        from app.database.models import Base
        engine = await self.ensure_engine()
        last_exc: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
                logger.info("Database tables created")
                return
            except (OSError, ConnectionError, asyncio.TimeoutError, SQLAlchemyError) as exc:
                last_exc = exc
                if attempt == retries:
                    break
                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    "DB connect failed (attempt %d/%d): %s. Retrying in %.1fs",
                    attempt, retries, exc, delay,
                )
                await asyncio.sleep(delay)
        logger.error("DB connect failed after %d attempts", retries)
        raise last_exc
    
    async def drop_tables(self):
        """Drop all tables (for development only)"""
        from app.database.models import Base
        engine = await self.ensure_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        logger.info("Database tables dropped")
    
    async def close(self):
        """Close the database engine"""
        if self._engine:
            await self._engine.dispose()
            logger.info("Database engine closed")


db_config = DatabaseConfig()


async def get_db() -> AsyncSession:
    """Dependency for FastAPI routes - provides database session"""
    factory = db_config.get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()