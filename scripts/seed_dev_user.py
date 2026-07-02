"""Seed the dev user into PostgreSQL for local development."""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from app.services.postgres_db import get_storage
from app.services.user_service import create_user
from app.database.config import db_config

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"
DEV_EMAIL = "dev@codeflow.ai"
DEV_NAME = "Dev User"
DEV_PROVIDER = "password"


async def seed():
    await db_config.create_tables()
    storage = get_storage()
    existing = await storage.get_document("users", DEV_USER_ID)
    if existing:
        print(f"Dev user already exists: {existing}")
        return

    record = {
        "uid": DEV_USER_ID,
        "email": DEV_EMAIL,
        "name": DEV_NAME,
        "provider": DEV_PROVIDER,
    }
    result = await create_user(uid=DEV_USER_ID, email=DEV_EMAIL, name=DEV_NAME, provider=DEV_PROVIDER)
    print(f"Dev user created: {result}")


if __name__ == "__main__":
    asyncio.run(seed())
