import pytest
from app.services.audit_service import log_event, query_events, log_code_access


@pytest.mark.asyncio(scope="session")
async def test_log_event():
    event = await log_event("task_created", "user_a", "task_1", team_id="team_x")
    assert event["event_type"] == "task_created"
    assert event["actor_id"] == "user_a"
    assert event["target_id"] == "task_1"
    assert event["team_id"] == "team_x"
    assert "event_id" in event
    assert "timestamp" in event


@pytest.mark.asyncio(scope="session")
async def test_query_events_by_actor():
    await log_event("task_submitted", "user_b", "task_2", team_id="team_x")
    await log_event("pr_viewed", "user_b", "pr_1", team_id="team_x")
    results = await query_events(actor_id="user_b")
    assert len(results) >= 2


@pytest.mark.asyncio(scope="session")
async def test_query_events_by_team():
    await log_event("module_granted", "user_c", "user_b", team_id="team_y")
    results = await query_events(team_id="team_y")
    assert all(e["team_id"] == "team_y" for e in results)


@pytest.mark.asyncio(scope="session")
async def test_query_events_by_type():
    await log_event("task_cancelled", "user_a", "task_3", team_id="team_x")
    results = await query_events(event_type="task_cancelled")
    assert all(e["event_type"] == "task_cancelled" for e in results)


@pytest.mark.asyncio(scope="session")
async def test_log_code_access():
    event = await log_code_access(
        actor_id="user_a",
        repo_url="https://github.com/org/repo",
        file_path="src/main.py",
        team_id="team_x",
        action="view",
    )
    assert event["event_type"] == "code_access"
    assert event["target_id"] == "https://github.com/org/repo"
    assert event["metadata"]["file_path"] == "src/main.py"


@pytest.mark.asyncio(scope="session")
async def test_query_events_limit():
    for i in range(5):
        await log_event("system_alert", "system", f"alert_{i}", team_id="team_z")
    results = await query_events(team_id="team_z", limit=3)
    assert len(results) <= 3


@pytest.mark.asyncio(scope="session")
async def test_events_ordered_by_timestamp_desc():
    await log_event("task_assigned", "user_a", "t1", team_id="team_q")
    await log_event("task_completed", "user_a", "t2", team_id="team_q")
    results = await query_events(team_id="team_q")
    if len(results) >= 2:
        assert results[0]["timestamp"] >= results[1]["timestamp"]
