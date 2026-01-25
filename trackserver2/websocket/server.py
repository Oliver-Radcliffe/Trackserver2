"""WebSocket server for real-time position updates."""

import asyncio
import json
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional, Set

from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from ..config import config

SECRET_KEY = config.jwt_secret
ALGORITHM = "HS256"
from ..protocol.message_parser import ParsedMessage

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        # Map of device_id -> set of connected websockets
        self.device_subscriptions: dict[int, Set[WebSocket]] = {}
        # Map of websocket -> set of subscribed device_ids
        self.websocket_devices: dict[WebSocket, Set[int]] = {}
        # All connected websockets
        self.connections: Set[WebSocket] = set()
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, token: Optional[str] = None) -> bool:
        """Accept a new WebSocket connection.

        Args:
            websocket: The WebSocket connection
            token: Optional JWT token for authentication

        Returns:
            True if connection accepted, False otherwise
        """
        # Validate token if provided
        if token:
            try:
                jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            except JWTError:
                logger.warning("Invalid WebSocket auth token")
                await websocket.close(code=4001)
                return False

        await websocket.accept()

        async with self._lock:
            self.connections.add(websocket)
            self.websocket_devices[websocket] = set()

        logger.info(f"WebSocket connected. Total connections: {len(self.connections)}")
        return True

    async def disconnect(self, websocket: WebSocket):
        """Handle WebSocket disconnection."""
        async with self._lock:
            # Remove from all device subscriptions
            if websocket in self.websocket_devices:
                for device_id in self.websocket_devices[websocket]:
                    if device_id in self.device_subscriptions:
                        self.device_subscriptions[device_id].discard(websocket)
                        if not self.device_subscriptions[device_id]:
                            del self.device_subscriptions[device_id]
                del self.websocket_devices[websocket]

            self.connections.discard(websocket)

        logger.info(f"WebSocket disconnected. Total connections: {len(self.connections)}")

    async def subscribe(self, websocket: WebSocket, device_ids: list[int]):
        """Subscribe websocket to device updates."""
        async with self._lock:
            if websocket not in self.websocket_devices:
                return

            for device_id in device_ids:
                if device_id not in self.device_subscriptions:
                    self.device_subscriptions[device_id] = set()
                self.device_subscriptions[device_id].add(websocket)
                self.websocket_devices[websocket].add(device_id)

        logger.debug(f"WebSocket subscribed to devices: {device_ids}")

    async def unsubscribe(self, websocket: WebSocket, device_ids: list[int]):
        """Unsubscribe websocket from device updates."""
        async with self._lock:
            if websocket not in self.websocket_devices:
                return

            for device_id in device_ids:
                if device_id in self.device_subscriptions:
                    self.device_subscriptions[device_id].discard(websocket)
                self.websocket_devices[websocket].discard(device_id)

    async def broadcast_position(self, device_id: int, position: ParsedMessage):
        """Broadcast position update to subscribed clients."""
        async with self._lock:
            subscribers = self.device_subscriptions.get(device_id, set()).copy()

        if not subscribers:
            return

        message = {
            "type": "position",
            "device_id": device_id,
            "data": {
                "timestamp": position.timestamp.isoformat(),
                "latitude": position.latitude,
                "longitude": position.longitude,
                "altitude": position.altitude,
                "speed": position.speed,
                "heading": position.heading,
                "satellites": position.satellites,
                "hdop": position.hdop,
                "battery": position.battery,
                "is_moving": position.motion > 0,
                "gps_valid": position.gps_valid,
            }
        }

        json_message = json.dumps(message)

        # Send to all subscribers
        disconnected = []
        for websocket in subscribers:
            try:
                await websocket.send_text(json_message)
            except Exception as e:
                logger.warning(f"Failed to send to websocket: {e}")
                disconnected.append(websocket)

        # Clean up disconnected clients
        for websocket in disconnected:
            await self.disconnect(websocket)

    async def broadcast_alert(self, device_id: int, alert_type: str, message: str):
        """Broadcast alert to subscribed clients."""
        async with self._lock:
            subscribers = self.device_subscriptions.get(device_id, set()).copy()

        if not subscribers:
            return

        alert_message = {
            "type": "alert",
            "device_id": device_id,
            "alert_type": alert_type,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        json_message = json.dumps(alert_message)

        disconnected = []
        for websocket in subscribers:
            try:
                await websocket.send_text(json_message)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            await self.disconnect(websocket)

    async def broadcast_user_location(
        self,
        user_id: int,
        user_name: str,
        user_email: str,
        latitude: float,
        longitude: float,
        accuracy: float,
        timestamp,
    ):
        """Broadcast user location update to all connected clients."""
        async with self._lock:
            all_connections = self.connections.copy()

        if not all_connections:
            return

        message = {
            "type": "user_location",
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy": accuracy,
            "timestamp": timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp),
        }

        json_message = json.dumps(message)

        disconnected = []
        for websocket in all_connections:
            try:
                await websocket.send_text(json_message)
            except Exception as e:
                logger.warning(f"Failed to send user location to websocket: {e}")
                disconnected.append(websocket)

        for websocket in disconnected:
            await self.disconnect(websocket)

    async def handle_message(self, websocket: WebSocket, data: str):
        """Handle incoming WebSocket message."""
        try:
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "subscribe":
                device_ids = message.get("device_ids", [])
                await self.subscribe(websocket, device_ids)
                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "device_ids": device_ids
                }))

            elif msg_type == "unsubscribe":
                device_ids = message.get("device_ids", [])
                await self.unsubscribe(websocket, device_ids)
                await websocket.send_text(json.dumps({
                    "type": "unsubscribed",
                    "device_ids": device_ids
                }))

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            else:
                logger.warning(f"Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.warning("Invalid JSON in WebSocket message")


# Global WebSocket manager instance
websocket_manager = WebSocketManager()


async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    """WebSocket endpoint handler."""
    if not await websocket_manager.connect(websocket, token):
        return

    try:
        while True:
            data = await websocket.receive_text()
            await websocket_manager.handle_message(websocket, data)
    except WebSocketDisconnect:
        await websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.exception(f"WebSocket error: {e}")
        await websocket_manager.disconnect(websocket)
