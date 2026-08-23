"""Alembic migrations configuration"""

from logging.config import fileConfig

from sqlalchemy import pool

from alembic import context

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.config import Base
from app.database.models import User, Team, TeamMember, ApiKey, UsageRecord, Repository

from dotenv import load_dotenv
import logging

load_dotenv()

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

_migrate_logger = logging.getLogger("alembic.env")


def get_url():
    """Get database URL from environment or config"""
    from app.database.config import DatabaseConfig
    db_config = DatabaseConfig()
    
    url = db_config.database_url
    _migrate_logger.info(
        "env=%s is_production=%s DATABASE_URL is %s",
        db_config.env,
        db_config.is_production,
        "set" if url else "NOT set",
    )
    if url:
        from urllib.parse import urlparse
        try:
            parsed = urlparse(url)
            # Mask password in log output
            netloc = parsed.netloc
            if "@" in netloc:
                credentials, host = netloc.split("@", 1)
                if ":" in credentials:
                    user, _ = credentials.split(":", 1)
                    netloc = f"{user}:***@{host}"
                else:
                    netloc = f"{credentials}:***@{host}"
            masked = f"{parsed.scheme}://{netloc}{parsed.path}"
            _migrate_logger.info("resolved DATABASE_URL=%s", masked)
        except Exception as e:
            _migrate_logger.warning("resolved DATABASE_URL could not be parsed safely: %s", e)

    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


import asyncio


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    from app.database.config import DatabaseConfig

    db_config = DatabaseConfig()
    configuration = config.get_section(config.config_ini_section) or {}
    url = get_url()
    if not url:
        raise RuntimeError("DATABASE_URL is required for migrations — set it in backend/.env or env")
    configuration["sqlalchemy.url"] = url

    connect_args = db_config._build_connect_args()

    connectable = create_async_engine(
        configuration["sqlalchemy.url"],
        poolclass=pool.NullPool,
        connect_args=connect_args if connect_args else {},
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()



def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()