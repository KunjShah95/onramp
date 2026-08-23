"""
WebSocket Connection Manager — tracks authenticated user connections
and broadcasts real-time events (notifications, task updates) to them.
"""

import logging
import json
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections per user.

    Each user can have multiple browser tabs open. We keep a set of
    WebSocket connections per user_id so we can broadcast to all of them.
    """

    def __init__(self):
        # user_id -> set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}
        # health stats
        self._total_connections: int = 0

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        """Accept a WebSocket connection and register it for the user."""
        try:
            await websocket.accept()
        except RuntimeError:
            # Already accepted (first-message auth path) — register without re-accepting
            pass
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        self._total_connections += 1
        logger.info(
            "WebSocket connected: user=%s, total_active=%d",
            user_id[:8], self._total_connections,
        )

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        """Remove a WebSocket connection from the user's set."""
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
        self._total_connections = max(0, self._total_connections - 1)
        logger.info(
            "WebSocket disconnected: user=%s, remaining_active=%d",
            user_id[:8], self._total_connections,
        )

    async def send_to_user(self, user_id: str, event: dict) -> int:
        """Send an event to all connections for a user.

        Returns the number of connections the event was sent to.
        Silently removes dead connections.
        """
        if user_id not in self._connections:
            return 0

        payload = json.dumps(event, default=str)
        dead: list[WebSocket] = []
        sent = 0

        for ws in self._connections[user_id]:
            try:
                await ws.send_text(payload)
                sent += 1
            except Exception:
                dead.append(ws)

        for ws in dead:
            self._connections[user_id].discard(ws)
        if user_id in self._connections and not self._connections[user_id]:
            del self._connections[user_id]

        return sent

    async def broadcast_to_team(self, team_id: str, event: dict, user_ids: list[str]) -> int:
        """Send an event to all connected users in a team.

        Args:
            team_id: The team identifier (for logging)
            event: The event payload
            user_ids: List of user IDs to broadcast to

        Returns:
            Number of connections the event was sent to
        """
        total = 0
        for uid in user_ids:
            total += await self.send_to_user(uid, event)
        if total:
            logger.debug("Broadcast to team=%s: %d users reached", team_id[:8], total)
        return total

    @property
    def active_connections(self) -> int:
        return self._total_connections

    @property
    def active_users(self) -> int:
        return len(self._connections)

    def get_connected_users(self) -> list[str]:
        return list(self._connections.keys())


# Singleton instance — shared across the app
manager = ConnectionManager()
