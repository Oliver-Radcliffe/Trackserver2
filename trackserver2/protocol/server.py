"""ciNet protocol server for Trackserver2."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Callable, Awaitable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .message_parser import CiNetMessageParser, ParsedMessage
from ..models.database import AsyncSessionLocal
from ..models.models import Device, Position

logger = logging.getLogger(__name__)


class CiNetProtocolHandler(asyncio.Protocol):
    """Asyncio protocol handler for ciNet connections."""

    MSG_LENGTH = 149

    def __init__(
        self,
        parser: CiNetMessageParser,
        on_position: Optional[Callable[[int, ParsedMessage], Awaitable[None]]] = None
    ):
        self.parser = parser
        self.on_position = on_position
        self.buffer = bytearray()
        self.transport: Optional[asyncio.Transport] = None
        self.peer_addr: Optional[tuple] = None

    def connection_made(self, transport: asyncio.Transport):
        """Called when connection is established."""
        self.transport = transport
        self.peer_addr = transport.get_extra_info('peername')
        logger.info(f"Connection from {self.peer_addr}")

    def connection_lost(self, exc: Optional[Exception]):
        """Called when connection is lost."""
        if exc:
            logger.warning(f"Connection lost from {self.peer_addr}: {exc}")
        else:
            logger.info(f"Connection closed from {self.peer_addr}")

    def data_received(self, data: bytes):
        """Called when data is received."""
        self.buffer.extend(data)

        # Process complete messages
        while len(self.buffer) >= self.MSG_LENGTH:
            message_data = bytes(self.buffer[:self.MSG_LENGTH])
            self.buffer = self.buffer[self.MSG_LENGTH:]

            # Schedule async message processing
            asyncio.create_task(self._process_message(message_data))

    async def _process_message(self, data: bytes):
        """Process a complete ciNet message."""
        try:
            # Validate header first
            if not self.parser.validate_header(data):
                logger.debug(f"Invalid header from {self.peer_addr}")
                return

            # Extract device key to look up device
            device_key = self.parser.extract_device_key(data)
            logger.debug(f"Message from device key: 0x{device_key:08X}")

            # Look up device in database
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Device).where(Device.device_key == device_key)
                )
                device = result.scalar_one_or_none()

                if not device:
                    logger.warning(f"Unknown device key: 0x{device_key:08X}")
                    return

                if not device.enabled:
                    logger.debug(f"Device disabled: {device.serial_number}")
                    return

                # Parse message with device passphrase
                parsed = self.parser.parse(data, device.passphrase)
                if not parsed:
                    logger.warning(f"Failed to parse message from device: {device.serial_number}")
                    return

                logger.info(
                    f"Position from {device.serial_number}: "
                    f"({parsed.latitude:.6f}, {parsed.longitude:.6f}) "
                    f"speed={parsed.speed}km/h battery={parsed.battery}%"
                )

                # Store position in database
                position = Position(
                    device_id=device.id,
                    timestamp=parsed.timestamp,
                    latitude=parsed.latitude,
                    longitude=parsed.longitude,
                    altitude=parsed.altitude,
                    speed=parsed.speed,
                    heading=int(parsed.heading) if parsed.heading else None,
                    satellites=parsed.satellites,
                    hdop=parsed.hdop,
                    battery=parsed.battery,
                    gsm_signal=parsed.rssi,
                    status_flags=parsed.status_flags,
                    is_moving=parsed.motion > 0,
                    temperature=parsed.temperature,
                    motion=parsed.motion,
                    lac=parsed.lac,
                    cell_id=parsed.cell_id,
                    operator=parsed.operator,
                    raw_data=parsed.raw_data,
                )
                session.add(position)

                # Update device last seen
                device.last_seen_at = datetime.now(timezone.utc)
                await session.commit()

                # Get position ID after commit
                await session.refresh(position)

                # Notify listeners
                if self.on_position:
                    await self.on_position(device.id, parsed)

        except Exception as e:
            logger.exception(f"Error processing message: {e}")


class CiNetServer:
    """ciNet protocol server."""

    def __init__(
        self,
        host: str = "0.0.0.0",
        port: int = 4509,
        on_position: Optional[Callable[[int, ParsedMessage], Awaitable[None]]] = None
    ):
        self.host = host
        self.port = port
        self.on_position = on_position
        self.parser = CiNetMessageParser()
        self.server: Optional[asyncio.Server] = None

    def _create_protocol(self) -> CiNetProtocolHandler:
        """Factory for creating protocol handlers."""
        return CiNetProtocolHandler(self.parser, self.on_position)

    async def start(self):
        """Start the server."""
        loop = asyncio.get_event_loop()
        self.server = await loop.create_server(
            self._create_protocol,
            self.host,
            self.port,
        )
        addrs = ', '.join(str(sock.getsockname()) for sock in self.server.sockets)
        logger.info(f"ciNet server listening on {addrs}")

    async def stop(self):
        """Stop the server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("ciNet server stopped")

    async def serve_forever(self):
        """Run the server forever."""
        await self.start()
        try:
            await self.server.serve_forever()
        except asyncio.CancelledError:
            await self.stop()


async def run_protocol_server(
    host: str = "0.0.0.0",
    port: int = 4509,
    on_position: Optional[Callable[[int, ParsedMessage], Awaitable[None]]] = None
):
    """Run the protocol server standalone."""
    server = CiNetServer(host, port, on_position)
    await server.serve_forever()
