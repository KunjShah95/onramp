"""Tenant-boundary regression tests for agent sessions and events."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.agent_bus import AgentBus


class _FakeSession:
    def __init__(self):
        self.added = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        return None


@pytest.fixture
def isolated_agent_bus(monkeypatch):
    """Remove Redis/DB/WS side effects from AgentBus.publish."""
    from app.database.config import db_config
    import app.services.agent_bus as bus_module

    sessions: list[_FakeSession] = []

    def get_session_factory():
        def open_session():
            session = _FakeSession()
            sessions.append(session)
            return session

        return open_session

    async def no_redis():
        return None

    class _Manager:
        def __init__(self):
            self.team_broadcasts = []

        async def broadcast_to_team(self, team_id, payload, user_ids):
            self.team_broadcasts.append((team_id, payload, tuple(user_ids)))

    manager = _Manager()

    async def members(_team_id):
        return [{"user_id": "user-a"}, {"id": "user-b"}]

    monkeypatch.setattr(bus_module, "_redis", no_redis)
    monkeypatch.setattr(db_config, "get_session_factory", get_session_factory)
    monkeypatch.setattr("app.services.team_service.get_team_members", members)
    monkeypatch.setattr("app.services.ws_manager.manager", manager)

    bus_module._LOCAL_SUBSCRIBERS.clear()
    bus_module._LOCAL_HISTORY.clear()
    yield bus_module.AgentBus(), manager, sessions
    bus_module._LOCAL_SUBSCRIBERS.clear()
    bus_module._LOCAL_HISTORY.clear()


@pytest.mark.asyncio
async def test_agent_bus_scopes_subscribers_and_websocket_delivery(isolated_agent_bus):
    bus, manager, sessions = isolated_agent_bus
    team_a_queue = bus.subscribe("agent.test", team_id="team-a")
    team_b_queue = bus.subscribe("agent.test", team_id="team-b")
    internal_queue = bus.subscribe("agent.test")

    await bus.publish("agent.test", payload={"value": 1}, team_id="team-a")

    assert (await team_a_queue.get())["team_id"] == "team-a"
    assert team_b_queue.empty()
    assert (await internal_queue.get())["team_id"] == "team-a"
    assert len(manager.team_broadcasts) == 1
    assert manager.team_broadcasts[0][0] == "team-a"
    assert sessions[0].added[0].team_id == "team-a"

    # An unscoped internal event must not reach tenant subscribers or a
    # WebSocket, even though it remains available to internal diagnostics.
    await bus.publish("agent.test", payload={"value": 2})
    assert team_a_queue.empty()
    assert team_b_queue.empty()
    assert (await internal_queue.get())["team_id"] is None
    assert len(manager.team_broadcasts) == 1


@pytest.mark.asyncio
async def test_explicit_team_scope_wins_over_payload_scope(isolated_agent_bus):
    bus, _manager, sessions = isolated_agent_bus
    record = await bus.publish(
        "agent.test",
        payload={"team_id": "team-b", "value": 1},
        team_id="team-a",
    )

    assert record["team_id"] == "team-a"
    assert record["payload"]["team_id"] == "team-a"
    assert sessions[0].added[0].team_id == "team-a"


def _session_app(monkeypatch, user):
    from app.api.v1 import agent_sessions as module

    application = FastAPI()

    class _SetUser(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user = user
            return await call_next(request)

    application.add_middleware(_SetUser)
    application.include_router(module.router)
    return application, module


@pytest.mark.asyncio
async def test_list_sessions_uses_explicit_access_scope(monkeypatch):
    list_sessions = AsyncMock(return_value=[])
    monkeypatch.setattr("app.services.agent_context.agent_context.list_sessions", list_sessions)
    monkeypatch.setattr(
        "app.api.v1.agent_sessions._user_team_ids",
        AsyncMock(return_value={"team-a", "team-b"}),
    )
    application, _module = _session_app(
        monkeypatch,
        {"uid": "user-a", "email": "a@example.com"},
    )
    client = TestClient(application)

    response = client.get("/agent-sessions")

    assert response.status_code == 200
    list_sessions.assert_awaited_once()
    kwargs = list_sessions.await_args.kwargs
    assert kwargs["user_id"] == "user-a"
    assert kwargs["team_ids"] == ["team-a", "team-b"]
    assert "team_id" not in kwargs or kwargs["team_id"] is None


@pytest.mark.asyncio
async def test_publish_event_rejects_cross_team_source_session(monkeypatch):
    from app.api.v1 import agent_sessions as module

    monkeypatch.setattr(module, "_require_team_member", AsyncMock())
    monkeypatch.setattr(
        module.agent_context,
        "get_session",
        AsyncMock(return_value={"id": "session-a", "team_id": "team-a", "user_id": "user-a"}),
    )

    with pytest.raises(module.HTTPException) as exc:
        await module.publish_event(
            module.PublishEventRequest(
                event_type="agent.test",
                team_id="team-b",
                source_session_id="session-a",
            ),
            {"uid": "user-a"},
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_publish_event_does_not_mutate_caller_payload(monkeypatch):
    from app.api.v1 import agent_sessions as module

    monkeypatch.setattr(module, "_require_team_member", AsyncMock())
    publish = AsyncMock(return_value={"id": "event-a"})
    monkeypatch.setattr(module.agent_bus, "publish", publish)
    payload = {"team_id": "team-a", "value": 1}

    await module.publish_event(
        module.PublishEventRequest(event_type="agent.test", payload=payload),
        {"uid": "user-a"},
    )

    assert payload == {"team_id": "team-a", "value": 1}
    assert publish.await_args.kwargs["team_id"] == "team-a"
    assert publish.await_args.kwargs["payload"] == {"value": 1}
