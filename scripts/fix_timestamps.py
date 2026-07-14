"""Fix timestamp columns: alter any timestamp without time zone to timestamptz"""
import asyncio, os, sys

os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:HACKER_K@localhost:5432/codeflow"
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
            "AND udt_name = 'timestamp' "
            "AND (column_name LIKE '%_at' OR column_name = 'last_login_at')"
        ))
        rows = result.fetchall()

        if not rows:
            print("All timestamp columns are already timestamptz. No changes needed.")
        else:
            print(f"Found {len(rows)} column(s) still using timestamp:")
            for row in rows:
                print(f"  {row.table_name}.{row.column_name}: {row.udt_name}")

            for row in rows:
                tbl = row.table_name
                col = row.column_name
                print(f"  Altering {tbl}.{col}...")
                await session.execute(text(
                    f"ALTER TABLE {tbl} ALTER COLUMN {col} TYPE timestamptz "
                    f"USING {col} AT TIME ZONE 'UTC'"
                ))

            await session.commit()
            print("All columns altered successfully!")

        # Final verification
        result2 = await session.execute(text(
            "SELECT table_name, column_name, udt_name "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND (column_name LIKE '%_at' OR column_name = 'last_login_at') "
            "ORDER BY table_name, column_name"
        ))
        print("\nFinal column types:")
        for row in result2:
            print(f"  {row.table_name}.{row.column_name}: {row.udt_name}")

if __name__ == "__main__":
    asyncio.run(main())
