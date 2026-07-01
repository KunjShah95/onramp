"""Alembic migrations configuration"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.config import Base
from app.database.models import User, Team, TeamMember, ApiKey, UsageRecord

from dotenv import load_dotenv
load_dotenv()

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    """Get database URL from environment or config"""
    env = os.getenv("ENV", os.getenv("ENVIRONMENT", "production")).lower()
    is_production = env == "production"

    url = os.getenv("DATABASE_URL")
    
    # Secure logging of env configuration to help debug deployment issues
    print(f"DEBUG: env={env}, is_production={is_production}, DATABASE_URL is {'set' if url else 'NOT set'}", flush=True)
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
            print(f"DEBUG: resolved DATABASE_URL={masked}", flush=True)
        except Exception as e:
            print(f"DEBUG: resolved DATABASE_URL could not be parsed safely: {e}", flush=True)

    if not url:
        if is_production:
            raise RuntimeError(
                "DATABASE_URL environment variable is required in production. "
                "Refusing to start with insecure default credentials "
                "(postgres:postgres@localhost). Set DATABASE_URL explicitly."
            )
        url = "postgresql+asyncpg://postgres:postgres@localhost:5432/codeflow"

    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

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

    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()

    connectable = create_async_engine(
        configuration["sqlalchemy.url"],
        poolclass=pool.NullPool,
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