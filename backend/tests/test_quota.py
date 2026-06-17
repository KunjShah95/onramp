import uuid
import pytest
from fastapi import HTTPException
from app.services.quota import check_and_record


# free tier = 500 credits/mo; "explore" costs 10 → 50 calls fit exactly.
_FREE_EXPLORE_CALLS = 50


@pytest.mark.asyncio
async def test_quota_allows_within_limit():
    scope = str(uuid.uuid4())
    for _ in range(_FREE_EXPLORE_CALLS):
        result = await check_and_record(scope, "explore")
        assert result["charged"] == 10
        assert result["tier"] == "free"


@pytest.mark.asyncio
async def test_quota_blocks_when_exceeded():
    scope = str(uuid.uuid4())
    for _ in range(_FREE_EXPLORE_CALLS):
        await check_and_record(scope, "explore")  # 500 used
    with pytest.raises(HTTPException) as exc:
        await check_and_record(scope, "explore")  # would exceed 500
    assert exc.value.status_code == 429
