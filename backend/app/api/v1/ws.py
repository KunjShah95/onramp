"""
WebSocket router — real-time push for notifications and task updates.

Clients connect at ``/api/v1/ws?token=<jwt>``. The server authenticates
via the JWT and registers the connection with the ConnectionManager.
"""

import asyncio
import logging
import json
import time
from collections import defaultdict
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

# ── Unauthenticated WebSocket rate limiting ─────────────────────────────────
# Prevent unauthenticated clients from holding many pending connections.
# Per-IP sliding window: max pending unauthenticated handshakes per minute.
_WS_PENDING_MAX_PER_IP = 10
_WS_PENDING_WINDOW = 60.0
_ws_pending: dict[str, list[float]] = defaultdict(list)
_ws_pending_lock = asyncio.Lock()


async def _check_ws_rate_limit(websocket: WebSocket) -> bool:
    """Return True if IP is within pending-connection limit, False if throttled."""
    # Extract client IP (X-Forwarded-For when behind proxy, else client.host)
    ip = ""
    try:
        fwd = websocket.headers.get("x-forwarded-for", "")
        if fwd:
            ip = fwd.split(",")[0].strip()
        elif websocket.client:
            ip = websocket.client.host
    except Exception:
        ip = "unknown"
    now = time.monotonic()
    async with _ws_pending_lock:
        timestamps = _ws_pending[ip]
        # Evict entries outside window
        cutoff = now - _WS_PENDING_WINDOW
        timestamps[:] = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= _WS_PENDING_MAX_PER_IP:
            return False
        timestamps.append(now)
        # Opportunistic cleanup of stale IP keys
        if len(_ws_pending) > 2000:
            stale = [k for k, v in _ws_pending.items() if not v or all(t <= cutoff for t in v)]
            for k in stale:
                _ws_pending.pop(k, None)
        return True


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
        # Rate-limit unauthenticated handshakes per IP before accepting
        if not await _check_ws_rate_limit(websocket):
            # Must accept before we can send a close code, but do so and
            # immediately close to signal throttling — still counts as one
            # pending slot already accounted for above.
            try:
                await websocket.accept()
                await websocket.close(code=4008, reason="Too many pending connections, try again later")
            except Exception:
                pass
            return
        await websocket.accept()
        # Allow first-message auth within 5s (short timeout limits resource hold)
        try:
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
    # Query-param path (legacy) — validate token BEFORE accepting
    user = await verify_session_token(token)
    if user is None:
        # Must accept to send close code; hold time is minimal (immediate close)
        try:
            await websocket.accept()
            await websocket.close(code=4001, reason="Invalid or expired token")
        except Exception:
            pass
        return

    user_id = user.get("uid", "")
    if not user_id:
        try:
            await websocket.accept()
            await websocket.close(code=4001, reason="Missing user ID in token")
        except Exception:
            pass
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
