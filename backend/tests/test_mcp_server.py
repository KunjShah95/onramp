"""Tests for the tenant-scoped read-only MCP surface."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.mcp_server import MCPError, mcp_server


def _app():
    from app.api.v1 import mcp
    from app.middleware.response_wrapper import ResponseWrapperMiddleware

    application = FastAPI()
    application.add_middleware(ResponseWrapperMiddleware)

    @application.middleware("http")
    async def _auth(request, call_next):
        request.state.user = {"uid": "user-a", "email": "a@example.com"}
        return await call_next(request)

    application.include_router(mcp.router, prefix="/api/v1")
    return application


def test_mcp_lists_only_read_only_repository_tools():
    tools = mcp_server.list_tools()
    assert {tool["name"] for tool in tools} == {"repo_context", "repo_search"}
    assert all("write" not in tool["description"].lower() for tool in tools)


def test_mcp_initialize_and_tools_list():
    client = TestClient(_app())
    init = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert init.status_code == 200
    assert init.json()["result"]["serverInfo"]["name"] == "onramp-readonly"

    listed = client.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    assert listed.status_code == 200
    assert len(listed.json()["result"]["tools"]) == 2


def test_mcp_unknown_method_returns_jsonrpc_error():
    response = TestClient(_app()).post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 3, "method": "resources/list", "params": {}},
    )
    assert response.status_code == 200
    assert response.json()["error"]["code"] == -32601


@pytest.mark.asyncio
async def test_mcp_tool_errors_are_redacted(monkeypatch):
    from app.api.v1 import mcp

    async def fail(*_args, **_kwargs):
        raise MCPError("bad tool input")

    monkeypatch.setattr(mcp.mcp_server, "call_tool", fail)
    response = TestClient(_app()).post(
        "/api/v1/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "repo_context", "arguments": {}},
        },
    )
    assert response.status_code == 200
    assert response.json()["error"]["message"] == "bad tool input"
