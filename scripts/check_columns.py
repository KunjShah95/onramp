"""Check current DB timestamp column types"""
import asyncio, os, sys

os.environ.setdefault("DATABASE_URL", os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/onramp"))
os.environ["ENV"] = "development"
os.environ["JWT_SECRET"] = "dev-jwt-secret-test-123"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

async def main():
    from app.database.config import db_config
    await db_config.ensure_engine()
    factory = db_config.get_session_factory()
    async with factory() as session:
        from sqlalchemy import text
        result = await session.execute(text(
            "SELECT table_name, column_name, udt_name "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND (column_name LIKE '%_at' OR column_name = 'last_login_at') "
            "ORDER BY table_name, column_name"
        ))
        for row in result:
            print(f"{row.table_name}.{row.column_name}: {row.udt_name}")

if __name__ == "__main__":
    asyncio.run(main())
