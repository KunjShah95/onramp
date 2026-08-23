"""
WebSocket router — real-time push for notifications and task updates.

Clients connect at ``/api/v1/ws?token=<jwt>``. The server authenticates
via the JWT and registers the connection with the ConnectionManager.
"""

import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.middleware.auth import verify_session_token
from app.services.ws_manager import manager
from app import metrics

logger = logging.getLogger(__name__)


def _record_ws_open() -> None:
    try:
        metrics.record_ws_open()
    except Exception:
        pass


def _record_ws_close() -> None:
    try:
        metrics.record_ws_close()
    except Exception:
        pass

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(None),
):
    """Authenticate and register the WebSocket connection.

    Token may be supplied via ``Sec-WebSocket-Protocol`` header (preferred,
    avoids logging in URLs), query param fallback, or first JSON message
    ``{type:"auth", token:"..."}``. Query param is deprecated due to log leakage.
    """
    # Prefer header to avoid logging token in access logs
    if not token:
        proto = websocket.headers.get("sec-websocket-protocol", "")
        # Header may be "bearer, <token>" or just "<token>"
        if proto:
            parts = [p.strip() for p in proto.split(",")]
            for p in parts:
                if p.lower().startswith("bearer "):
                    token = p[7:].strip()
                    break
            if not token:
                # Fall back to last part if no bearer prefix
                token = parts[-1] if parts[-1] != "bearer" else None
    if not token:
        await websocket.accept()
        # Allow first-message auth within 5s
        try:
            import asyncio
            data = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            msg = json.loads(data)
            if msg.get("type") == "auth":
                token = msg.get("token")
        except Exception:
            pass
        if not token:
            try:
                await websocket.close(code=4001, reason="Missing authentication token")
            except Exception:
                pass
            return
        # If we accepted already, user will be authenticated below without re-accepting
        # manager.connect will handle already-accepted socket
        user = await verify_session_token(token)
        if user is None:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
        # Continue to registration with already-accepted socket
        user_id = user.get("uid", "")
        if not user_id:
            await websocket.close(code=4001, reason="Missing user ID in token")
            return
        await manager.connect(websocket, user_id)
        _record_ws_open()
        try:
            await websocket.send_text(json.dumps({"type": "connected", "user_id": user_id[:8]}))
            while True:
                data = await websocket.receive_text()
                if len(data) > 64 * 1024:
                    continue  # drop oversized messages
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except json.JSONDecodeError:
                    pass
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.exception("WebSocket error for user %s: %s", user_id[:8], e)
        finally:
            manager.disconnect(websocket, user_id)
            _record_ws_close()
        return
    # Query-param path (legacy)
    user = await verify_session_token(token)
    if user is None:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    user_id = user.get("uid", "")
    if not user_id:
        await websocket.close(code=4001, reason="Missing user ID in token")
        return

    # Register the connection
    await manager.connect(websocket, user_id)
    _record_ws_open()

    try:
        # Send a confirmation message
        await websocket.send_text(json.dumps({
            "type": "connected",
            "user_id": user_id[:8],
        }))

        # Keep the connection alive and handle incoming pings (size-limited)
        while True:
            data = await websocket.receive_text()
            if len(data) > 64 * 1024:
                continue
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass  # Ignore malformed messages; other exceptions propagate

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("WebSocket error for user %s: %s", user_id[:8], e)
    finally:
        manager.disconnect(websocket, user_id)
        _record_ws_close()
