"""Minimal JSON-RPC endpoint for the read-only MCP server."""

from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.v1.auth import get_user_or_api_key
from app.services.mcp_server import MCPError, mcp_server

router = APIRouter(prefix="/mcp", tags=["mcp"])


class MCPRequest(BaseModel):
    jsonrpc: str = Field(default="2.0", pattern="^2\\.0$")
    id: str | int | None = None
    method: str = Field(..., min_length=1, max_length=100)
    params: Dict[str, Any] = Field(default_factory=dict)


def _ok(request_id: str | int | None, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: str | int | None, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


@router.post("")
async def mcp_rpc(
    body: MCPRequest,
    user: dict = Depends(get_user_or_api_key),
):
    """Handle MCP initialization and read-only tool calls.

    This endpoint intentionally exposes no task, repository, or write tools.
    """
    if body.method == "initialize":
        return _ok(
            body.id,
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": mcp_server.server_name, "version": mcp_server.server_version},
            },
        )
    if body.method == "ping":
        return _ok(body.id, {})
    if body.method == "tools/list":
        return _ok(body.id, {"tools": mcp_server.list_tools()})
    if body.method == "tools/call":
        name = str(body.params.get("name", ""))
        arguments = body.params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return _error(body.id, -32602, "arguments must be an object")
        try:
            result = await mcp_server.call_tool(user, name, arguments)
        except MCPError as exc:
            return _error(body.id, -32602, str(exc))
        except HTTPException as exc:
            # Preserve the authorization status without exposing internals.
            return _error(body.id, -32000, exc.detail)
        except Exception:
            return _error(body.id, -32603, "Tool execution failed")
        return _ok(
            body.id,
            {
                "content": [{"type": "text", "text": __import__("json").dumps(result, default=str)}],
                "structuredContent": result,
                "isError": False,
            },
        )
    return _error(body.id, -32601, "Method not found")
