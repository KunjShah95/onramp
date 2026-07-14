"""
Setup script: Create team "InnovateHub" and assign roles using raw SQL.
- Kunj (kunj@shah.com) -> senior_dev
- Varad (varadvekariya6@gmail.com) -> new_dev

Run from the backend directory with:
    cd backend && .venv/Scripts/python ../scripts/setup_roles.py
"""

import asyncio
import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:HACKER_K@localhost:5432/codeflow")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("JWT_SECRET", "dev-jwt-secret-test-123")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


async def main():
    from app.database.config import db_config
    import uuid
    from datetime import datetime, timezone

    await db_config.ensure_engine()

    KUNJ_UID = "3041ce60-dc09-494f-8342-5a4eaf80e4a4"
    VARAD_UID = "99243367-c37a-4178-a8ef-1bc7469b101c"

    factory = db_config.get_session_factory()
    async with factory() as session:
        from sqlalchemy import text

        # 1. Verify users exist
        result = await session.execute(
            text("SELECT id, name FROM users WHERE id = :uid"), {"uid": KUNJ_UID}
        )
        kunj = result.fetchone()
        result = await session.execute(
            text("SELECT id, name FROM users WHERE id = :uid"), {"uid": VARAD_UID}
        )
        varad = result.fetchone()

        if not kunj:
            print("ERROR: Kunj user not found!")
            return
        if not varad:
            print("ERROR: Varad user not found!")
            return
        print(f"Found Kunj: {kunj.name} ({kunj.id})")
        print(f"Found Varad: {varad.name} ({varad.id})")

        # 2. Create team if not exists
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive datetime for DB
        team_id = str(uuid.uuid4())

        existing = await session.execute(
            text("SELECT id FROM teams WHERE name = 'InnovateHub'")
        )
        row = existing.fetchone()
        if row:
            team_id = row[0]
            print(f"Team 'InnovateHub' already exists: {team_id}")
        else:
            await session.execute(
                text("""
                    INSERT INTO teams (id, name, description, is_active, created_at, updated_at)
                    VALUES (:id, :name, :desc, :active, :now, :now)
                """),
                {"id": team_id, "name": "InnovateHub", "desc": "Main development team",
                 "active": True, "now": now},
            )
            print(f"Created team: {team_id}")

        # 3. Remove existing memberships for this team
        await session.execute(
            text("DELETE FROM team_members WHERE team_id = :tid"), {"tid": team_id}
        )

        # 4. Add Kunj as senior_dev
        await session.execute(
            text("""
                INSERT INTO team_members (user_id, team_id, role, joined_at)
                VALUES (:uid, :tid, :role, :now)
            """),
            {"uid": KUNJ_UID, "tid": team_id, "role": "senior_dev", "now": now},
        )
        print("Added Kunj as senior_dev [OK]")

        # 5. Add Varad as new_dev
        await session.execute(
            text("""
                INSERT INTO team_members (user_id, team_id, role, joined_at)
                VALUES (:uid, :tid, :role, :now)
            """),
            {"uid": VARAD_UID, "tid": team_id, "role": "new_dev", "now": now},
        )
        print("Added Varad as new_dev [OK]")

        await session.commit()

    # 6. Verify
    async with factory() as session:
        result = await session.execute(
            text("""
                SELECT tm.role, u.name, u.id
                FROM team_members tm
                JOIN users u ON u.id = tm.user_id
                WHERE tm.team_id = :tid
            """),
            {"tid": team_id},
        )
        members = result.fetchall()
        print(f"\n[OK] Team 'InnovateHub' has {len(members)} members:")
        for m in members:
            uid_str = str(m.id)
            print(f"    {m.name} ({uid_str[:12]}...) -> {m.role}")


if __name__ == "__main__":
    asyncio.run(main())
