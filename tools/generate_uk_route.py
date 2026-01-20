#!/usr/bin/env python3
"""
Generate realistic GPS test data for a route around the UK.
"""

import asyncio
import sys
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from trackserver2.protocol.blowfish import Blowfish, derive_key
from trackserver2.protocol.crc import CRC16
import struct

# Route waypoints: Around the UK
# Format: (lat, lon, name, typical_speed_kmh)
ROUTE_WAYPOINTS = [
    # Start in London
    (51.5074, -0.1278, "London", 30),
    (51.5200, -0.0800, "London East", 50),

    # M11 North to Cambridge
    (51.7500, 0.0500, "M11 North", 110),
    (52.2053, 0.1218, "Cambridge", 50),

    # A14/A1 to Peterborough
    (52.5695, -0.2405, "Peterborough", 80),

    # A1 North to Lincoln
    (53.2307, -0.5406, "Lincoln", 70),

    # Continue to York
    (53.7000, -0.8000, "Doncaster area", 110),
    (53.9591, -1.0815, "York", 60),

    # A1/A19 to Newcastle
    (54.3500, -1.4000, "Northallerton", 110),
    (54.6000, -1.5500, "Darlington", 100),
    (54.7800, -1.5800, "Durham", 80),
    (54.9783, -1.6178, "Newcastle", 50),

    # A1 to Edinburgh
    (55.3500, -1.8000, "Alnwick area", 100),
    (55.6500, -2.0000, "Berwick area", 110),
    (55.9533, -3.1883, "Edinburgh", 40),

    # M8 to Glasgow
    (55.8609, -3.5000, "Livingston", 110),
    (55.8642, -4.2518, "Glasgow", 40),

    # A82 to Loch Lomond
    (56.0000, -4.5000, "Dumbarton", 80),
    (56.1500, -4.6500, "Loch Lomond", 60),

    # A85 to Perth via Stirling
    (56.1166, -3.9369, "Stirling", 70),
    (56.3950, -3.4308, "Perth", 60),

    # A9 to Inverness
    (56.7000, -3.8000, "Pitlochry", 90),
    (57.0000, -4.2000, "Aviemore", 80),
    (57.4778, -4.2247, "Inverness", 50),

    # A9 back south to Aberdeen via coast
    (57.3000, -3.8000, "Nairn", 90),
    (57.5000, -3.0000, "Elgin", 80),
    (57.4500, -2.2000, "Banff", 70),
    (57.1497, -2.0943, "Aberdeen", 50),

    # A90 south to Dundee
    (56.8000, -2.4000, "Stonehaven", 100),
    (56.5500, -2.6000, "Montrose", 100),
    (56.4620, -2.9707, "Dundee", 50),

    # A90/M90 back to Edinburgh
    (56.2000, -3.2000, "Kinross", 110),
    (55.9533, -3.1883, "Edinburgh", 40),

    # A68/A7 to Carlisle
    (55.6000, -2.8000, "Galashiels", 80),
    (55.3000, -2.7000, "Jedburgh", 70),
    (54.8951, -2.9382, "Carlisle", 50),

    # M6 south to Lake District
    (54.6000, -2.8000, "Penrith", 100),
    (54.4000, -2.9500, "Windermere", 60),

    # M6 to Manchester
    (54.0500, -2.8000, "Lancaster", 110),
    (53.7500, -2.7000, "Preston", 100),
    (53.4808, -2.2426, "Manchester", 50),

    # M62 to Liverpool
    (53.4084, -2.9916, "Liverpool", 50),

    # M56/M6 to Birmingham
    (53.2000, -2.5000, "Chester area", 100),
    (52.8000, -2.3000, "Stoke area", 110),
    (52.4862, -1.8904, "Birmingham", 50),

    # M5 to Bristol
    (52.2000, -2.2000, "Worcester", 100),
    (51.8500, -2.2500, "Gloucester", 90),
    (51.4545, -2.5879, "Bristol", 50),

    # M4 to Cardiff
    (51.5000, -2.8000, "Severn Bridge", 100),
    (51.4816, -3.1791, "Cardiff", 50),

    # M4 to Swansea
    (51.5500, -3.5000, "Port Talbot", 110),
    (51.6214, -3.9436, "Swansea", 50),

    # A40 to Pembroke
    (51.7500, -4.5000, "Carmarthen", 80),
    (51.6740, -4.9160, "Pembroke", 50),

    # A40/M4 back east
    (51.8500, -4.3000, "Haverfordwest", 80),
    (51.8000, -3.5000, "Brecon area", 70),

    # M50/M5 to Exeter
    (51.9000, -2.6000, "Ross-on-Wye", 90),
    (51.4500, -2.6000, "Bristol", 100),
    (51.0500, -3.1000, "Taunton", 110),
    (50.7184, -3.5339, "Exeter", 50),

    # A30 to Cornwall
    (50.4500, -4.2000, "Bodmin", 90),
    (50.2660, -5.0527, "Truro", 60),
    (50.1185, -5.5373, "Penzance", 40),

    # A30 back to Exeter
    (50.3500, -4.8000, "Redruth", 70),
    (50.5000, -4.5000, "Launceston area", 90),
    (50.7184, -3.5339, "Exeter", 50),

    # M5/A303 to London via Stonehenge
    (50.9500, -2.6500, "Yeovil area", 100),
    (51.1789, -1.8262, "Stonehenge", 80),
    (51.2500, -1.5000, "Andover", 100),
    (51.4000, -1.0000, "Basingstoke", 110),
    (51.4500, -0.5000, "M25 West", 90),
    (51.5074, -0.1278, "London", 30),
]


class RouteGenerator:
    """Generate GPS positions along the route."""

    MSG_LENGTH = 149
    START_BYTE = 0x24
    PACKET_TYPE = 0x55
    ENCRYPTED_LENGTH = 96

    def __init__(self, host: str, port: int, device_key: int, passphrase: str):
        self.host = host
        self.port = port
        self.device_key = device_key
        self.passphrase = passphrase
        self.sequence = 0

        key = derive_key(passphrase)
        self.cipher = Blowfish(key)

    def interpolate_points(self, start, end, num_points):
        """Generate intermediate points between two waypoints."""
        points = []
        for i in range(num_points):
            t = i / num_points
            lat = start[0] + t * (end[0] - start[0])
            lon = start[1] + t * (end[1] - start[1])
            # Add some random variation to simulate real GPS
            lat += random.uniform(-0.0005, 0.0005)
            lon += random.uniform(-0.0005, 0.0005)
            points.append((lat, lon))
        return points

    def calculate_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two points in km (Haversine)."""
        import math
        R = 6371  # Earth radius in km

        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)

        a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

        return R * c

    def generate_route_points(self):
        """Generate all points along the route with realistic data."""
        all_points = []
        current_time = datetime.now(timezone.utc)
        battery = 100

        for i in range(len(ROUTE_WAYPOINTS) - 1):
            start = ROUTE_WAYPOINTS[i]
            end = ROUTE_WAYPOINTS[i + 1]

            # Calculate distance and time
            distance = self.calculate_distance(start[0], start[1], end[0], end[1])
            avg_speed = (start[3] + end[3]) / 2

            # Time = distance / speed (in hours), convert to points
            time_hours = distance / avg_speed
            num_points = max(2, int(time_hours * 12))  # ~5 min intervals

            # Generate intermediate points
            points = self.interpolate_points(start, end, num_points)

            for j, (lat, lon) in enumerate(points):
                # Vary speed realistically
                base_speed = avg_speed
                speed = base_speed + random.uniform(-10, 10)
                speed = max(5, min(speed, 120))  # Cap speed

                # Battery drain
                if random.random() < 0.1 and battery > 10:
                    battery -= 1

                all_points.append({
                    'latitude': lat,
                    'longitude': lon,
                    'speed': speed,
                    'battery': battery,
                    'timestamp': current_time,
                    'location': start[2] if j == 0 else f"En route to {end[2]}",
                })

                # Advance time based on speed
                if speed > 0:
                    time_increment = (distance / num_points) / speed * 60  # minutes
                    current_time += timedelta(minutes=time_increment)

        return all_points

    def _encode_datong_timestamp(self, dt: datetime) -> bytes:
        """Encode datetime to Datong 5-byte timestamp."""
        ts = bytearray(5)
        ts[0] = ((dt.day & 0x1F) << 3) | ((dt.month >> 1) & 0x07)
        ts[1] = ((dt.year - 1980) & 0x7F) | ((dt.month & 0x01) << 7)
        ts[2] = ((dt.hour & 0x1F) << 3) | ((dt.minute >> 3) & 0x07)
        ts[3] = ((dt.minute & 0x07) << 5) | ((dt.second >> 1) & 0x1F)
        ts[4] = (dt.second & 0x01) << 7
        return bytes(ts)

    def build_message(self, lat: float, lon: float, speed: float, battery: int, timestamp: datetime) -> bytes:
        """Build a ciNet position message."""
        buf = bytearray(self.MSG_LENGTH)
        datong_ts = self._encode_datong_timestamp(timestamp)

        self.sequence = (self.sequence + 1) & 0xFF

        # Header
        buf[0] = self.START_BYTE
        buf[1] = self.PACKET_TYPE
        struct.pack_into('>H', buf, 2, self.MSG_LENGTH)
        buf[4] = self.sequence
        struct.pack_into('>I', buf, 5, self.device_key)
        buf[9] = 0x44

        # Source type
        source_type = b"Millitag"
        buf[10:10 + len(source_type)] = source_type

        # Serial number
        serial = b"SIM00000001"
        buf[22:22 + len(serial)] = serial

        # Header timestamp
        buf[46:51] = datong_ts

        # Encrypted payload
        struct.pack_into('>H', buf, 51, self.ENCRYPTED_LENGTH)
        buf[55] = 0x02

        # Client name
        client = b"UKRoute"
        buf[56:56 + len(client)] = client

        # Position
        lat_int = int(lat * 60000)
        lon_int = int(lon * 60000)
        struct.pack_into('>i', buf, 76, lat_int)
        struct.pack_into('>i', buf, 80, lon_int)

        # Heading
        struct.pack_into('>H', buf, 84, 0xFFFF)

        # Speed
        struct.pack_into('>H', buf, 86, int(speed))

        # GPS timestamp
        buf[88:93] = datong_ts

        # HDOP
        struct.pack_into('>H', buf, 93, 100)

        # GPS valid
        buf[95] = 1

        # Motion
        buf[96] = 1 if speed > 0 else 0

        # Alarm
        buf[97] = 0xFF

        # Millitag specific
        struct.pack_into('>H', buf, 98, 46)
        buf[100] = battery
        buf[101] = 20
        buf[102] = 8

        # Firmware version
        buf[127] = 1
        buf[128] = 0
        buf[129] = 0

        # Calculate payload CRC
        crc_value = CRC16.calculate(buf, 55, 92)
        buf[53] = (~crc_value) & 0xFF
        buf[54] = (~(crc_value >> 8)) & 0xFF

        # Encrypt payload
        encrypted = self.cipher.encrypt_bytes(bytes(buf[51:147]))
        buf[51:147] = encrypted

        # Calculate message CRC
        crc_value = CRC16.calculate(buf, 0, 147)
        buf[147] = (~crc_value) & 0xFF
        buf[148] = (~(crc_value >> 8)) & 0xFF

        return bytes(buf)

    async def send_route(self, points, delay=0.1):
        """Send all route points to the server."""
        print(f"Connecting to {self.host}:{self.port}...")

        try:
            reader, writer = await asyncio.open_connection(self.host, self.port)
            print("Connected!")
        except Exception as e:
            print(f"Connection failed: {e}")
            return

        try:
            for i, point in enumerate(points):
                message = self.build_message(
                    point['latitude'],
                    point['longitude'],
                    point['speed'],
                    point['battery'],
                    point['timestamp']
                )
                writer.write(message)
                await writer.drain()

                if i % 20 == 0 or i == len(points) - 1:
                    print(f"Sent {i+1}/{len(points)}: {point['location']} - "
                          f"({point['latitude']:.4f}, {point['longitude']:.4f}) "
                          f"{point['speed']:.0f}km/h {point['battery']}%")

                await asyncio.sleep(delay)

            print(f"\nDone! Sent {len(points)} positions.")

        finally:
            writer.close()
            await writer.wait_closed()


async def main():
    generator = RouteGenerator(
        host="localhost",
        port=4509,
        device_key=0x06EA83A3,
        passphrase="fredfred"
    )

    print("Generating UK route...")
    print(f"Route has {len(ROUTE_WAYPOINTS)} waypoints")

    points = generator.generate_route_points()
    print(f"Generated {len(points)} GPS points")

    # Show route summary
    print("\nRoute summary:")
    for wp in ROUTE_WAYPOINTS[::5]:  # Every 5th waypoint
        print(f"  - {wp[2]}")

    print("\nSending to server (with live delay for trail visualization)...")
    await generator.send_route(points, delay=0.15)


if __name__ == "__main__":
    asyncio.run(main())
