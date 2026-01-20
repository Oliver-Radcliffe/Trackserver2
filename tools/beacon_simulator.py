#!/usr/bin/env python3
"""
Beacon Simulator for testing Trackserver2.

Simulates a Pico Beacon sending position messages to the server.
"""

import argparse
import asyncio
import logging
import random
import sys
import struct
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from trackserver2.protocol.blowfish import Blowfish, derive_key
from trackserver2.protocol.crc import CRC16

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BeaconSimulator:
    """Simulates a Pico Beacon device."""

    MSG_LENGTH = 149
    HEADER_LENGTH = 51
    ENCRYPTED_LENGTH = 96

    START_BYTE = 0x24
    PACKET_TYPE = 0x55

    def __init__(
        self,
        host: str,
        port: int,
        device_key: int,
        serial_number: str,
        passphrase: str,
        latitude: float = 51.5074,
        longitude: float = -0.1278,
    ):
        self.host = host
        self.port = port
        self.device_key = device_key
        self.serial_number = serial_number
        self.passphrase = passphrase
        self.latitude = latitude
        self.longitude = longitude
        self.sequence = 0

        # Initialize cipher
        key = derive_key(passphrase)
        self.cipher = Blowfish(key)

    def _encode_datong_timestamp(self, dt: datetime) -> bytes:
        """Encode datetime to Datong 5-byte timestamp."""
        ts = bytearray(5)
        ts[0] = ((dt.day & 0x1F) << 3) | ((dt.month >> 1) & 0x07)
        ts[1] = ((dt.year - 1980) & 0x7F) | ((dt.month & 0x01) << 7)
        ts[2] = ((dt.hour & 0x1F) << 3) | ((dt.minute >> 3) & 0x07)
        ts[3] = ((dt.minute & 0x07) << 5) | ((dt.second >> 1) & 0x1F)
        ts[4] = (dt.second & 0x01) << 7
        return bytes(ts)

    def build_message(self, speed: float = 0.0, battery: int = 100) -> bytes:
        """Build a ciNet position message."""
        buf = bytearray(self.MSG_LENGTH)
        now = datetime.now(timezone.utc)
        datong_ts = self._encode_datong_timestamp(now)

        self.sequence = (self.sequence + 1) & 0xFF

        # Header (bytes 0-50)
        buf[0] = self.START_BYTE
        buf[1] = self.PACKET_TYPE
        struct.pack_into('>H', buf, 2, self.MSG_LENGTH)
        buf[4] = self.sequence
        struct.pack_into('>I', buf, 5, self.device_key)
        buf[9] = 0x44  # ciNet type

        # Source type (12 bytes)
        source_type = b"Millitag"
        buf[10:10 + len(source_type)] = source_type

        # Serial number (24 bytes)
        serial = self.serial_number.encode('utf-8')[:24]
        buf[22:22 + len(serial)] = serial

        # Header timestamp
        buf[46:51] = datong_ts

        # Encrypted payload (bytes 51-146)
        struct.pack_into('>H', buf, 51, self.ENCRYPTED_LENGTH)
        # CRC placeholder at 53-54

        buf[55] = 0x02  # Message type

        # Client name (20 bytes)
        client = b"TestClient"
        buf[56:56 + len(client)] = client

        # Position
        lat_int = int(self.latitude * 60000)
        lon_int = int(self.longitude * 60000)
        struct.pack_into('>i', buf, 76, lat_int)
        struct.pack_into('>i', buf, 80, lon_int)

        # Heading (0xFFFF = invalid)
        struct.pack_into('>H', buf, 84, 0xFFFF)

        # Speed
        struct.pack_into('>H', buf, 86, int(speed))

        # GPS timestamp
        buf[88:93] = datong_ts

        # HDOP
        struct.pack_into('>H', buf, 93, 100)  # 1.00

        # GPS valid
        buf[95] = 1

        # Motion
        buf[96] = 1 if speed > 0 else 0

        # Alarm
        buf[97] = 0xFF

        # Millitag specific
        struct.pack_into('>H', buf, 98, 46)
        buf[100] = battery
        buf[101] = 20  # temperature
        buf[102] = 8  # satellites

        # Firmware version
        buf[127] = 1
        buf[128] = 0
        buf[129] = 0

        # Calculate payload CRC (bytes 55-146 -> stored at 53-54)
        crc_value = CRC16.calculate(buf, 55, 92)
        buf[53] = (~crc_value) & 0xFF
        buf[54] = (~(crc_value >> 8)) & 0xFF

        # Encrypt payload (bytes 51-146)
        encrypted = self.cipher.encrypt_bytes(bytes(buf[51:147]))
        buf[51:147] = encrypted

        # Calculate message CRC (bytes 0-146 -> stored at 147-148)
        crc_value = CRC16.calculate(buf, 0, 147)
        buf[147] = (~crc_value) & 0xFF
        buf[148] = (~(crc_value >> 8)) & 0xFF

        return bytes(buf)

    async def run(self, interval: float = 10.0, count: int = 0):
        """Run the simulator, sending messages at the specified interval.

        Args:
            interval: Seconds between messages
            count: Number of messages to send (0 = infinite)
        """
        logger.info(f"Connecting to {self.host}:{self.port}")

        try:
            reader, writer = await asyncio.open_connection(self.host, self.port)
            logger.info("Connected!")
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return

        sent = 0
        try:
            while count == 0 or sent < count:
                # Simulate some movement
                self.latitude += random.uniform(-0.0001, 0.0001)
                self.longitude += random.uniform(-0.0001, 0.0001)
                speed = random.uniform(0, 50)
                battery = max(0, 100 - sent)

                message = self.build_message(speed=speed, battery=battery)
                writer.write(message)
                await writer.drain()

                sent += 1
                logger.info(
                    f"Sent message {sent}: "
                    f"({self.latitude:.6f}, {self.longitude:.6f}) "
                    f"speed={speed:.1f}km/h battery={battery}%"
                )

                await asyncio.sleep(interval)

        except KeyboardInterrupt:
            logger.info("Interrupted")
        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            writer.close()
            await writer.wait_closed()
            logger.info(f"Disconnected. Sent {sent} messages.")


def parse_device_key(key_str: str) -> int:
    """Parse device key from hex string (e.g., '06.EA.83.A3' or '06EA83A3')."""
    # Remove dots, spaces, and 0x prefix
    clean = key_str.replace('.', '').replace(' ', '').replace('0x', '')
    return int(clean, 16)


def main():
    parser = argparse.ArgumentParser(description="Pico Beacon Simulator")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--port", type=int, default=4509, help="Server port")
    parser.add_argument("--key", default="06.EA.83.A3", help="Device key (hex)")
    parser.add_argument("--serial", default="SIM00000001", help="Serial number")
    parser.add_argument("--passphrase", default="fredfred", help="Passphrase")
    parser.add_argument("--lat", type=float, default=51.5074, help="Starting latitude")
    parser.add_argument("--lon", type=float, default=-0.1278, help="Starting longitude")
    parser.add_argument("--interval", type=float, default=10.0, help="Seconds between messages")
    parser.add_argument("--count", type=int, default=0, help="Number of messages (0=infinite)")

    args = parser.parse_args()

    device_key = parse_device_key(args.key)
    logger.info(f"Device key: 0x{device_key:08X}")

    simulator = BeaconSimulator(
        host=args.host,
        port=args.port,
        device_key=device_key,
        serial_number=args.serial,
        passphrase=args.passphrase,
        latitude=args.lat,
        longitude=args.lon,
    )

    asyncio.run(simulator.run(interval=args.interval, count=args.count))


if __name__ == "__main__":
    main()
