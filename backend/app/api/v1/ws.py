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

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    """Authenticate and register the WebSocket connection.

    The client must provide a valid JWT as a query parameter.
    On success, the connection is kept open for real-time push events.
    """
    # Authenticate the token
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

    try:
        # Send a confirmation message
        await websocket.send_text(json.dumps({
            "type": "connected",
            "user_id": user_id[:8],
        }))

        # Keep the connection alive and handle incoming pings
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except (json.JSONDecodeError, Exception):
                pass  # Ignore malformed messages

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("WebSocket error for user %s: %s", user_id[:8], e)
    finally:
        manager.disconnect(websocket, user_id)
