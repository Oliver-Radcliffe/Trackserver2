"""Main entry point for Trackserver2."""

import asyncio
import logging
import signal
import sys
from typing import Optional

import uvicorn
from fastapi import WebSocket

from .api.main import app
from .config import config
from .models.database import init_db
from .protocol.server import CiNetServer
from .protocol.message_parser import ParsedMessage
from .websocket.server import websocket_manager, websocket_endpoint

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Add WebSocket endpoint to FastAPI app
@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: Optional[str] = None):
    """WebSocket endpoint for real-time updates."""
    await websocket_endpoint(websocket, token)


async def on_position_received(device_id: int, position: ParsedMessage):
    """Callback when position is received from protocol server."""
    await websocket_manager.broadcast_position(device_id, position)


async def run_servers():
    """Run both the protocol server and API server."""
    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Create protocol server
    protocol_server = CiNetServer(
        host=config.cinet_host,
        port=config.cinet_port,
        on_position=on_position_received
    )

    # Start protocol server
    await protocol_server.start()

    # Create uvicorn config for API server
    uvicorn_config = uvicorn.Config(
        app,
        host=config.api_host,
        port=config.api_port,
        log_level=config.log_level.lower(),
    )
    api_server = uvicorn.Server(uvicorn_config)

    # Handle shutdown signals
    shutdown_event = asyncio.Event()

    def signal_handler():
        logger.info("Shutdown signal received")
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    # Run API server
    api_task = asyncio.create_task(api_server.serve())

    # Wait for shutdown
    await shutdown_event.wait()

    # Cleanup
    logger.info("Shutting down servers...")
    api_server.should_exit = True
    await protocol_server.stop()
    await api_task

    logger.info("Trackserver2 stopped")


def main():
    """Main entry point."""
    logger.info("Starting Trackserver2")
    logger.info(f"Protocol server: {config.cinet_host}:{config.cinet_port}")
    logger.info(f"API server: {config.api_host}:{config.api_port}")

    try:
        asyncio.run(run_servers())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
