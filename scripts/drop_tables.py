from dotenv import load_dotenv
load_dotenv()

from app.database.config import db_config
import asyncio

async def main():
    await db_config.drop_tables()

asyncio.run(main())
