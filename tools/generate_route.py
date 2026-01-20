#!/usr/bin/env python3
"""
Generate realistic GPS test data for a route from Glasgow to Madrid.
"""

import asyncio
import sys
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from trackserver2.protocol.blowfish import Blowfish, derive_key
from trackserver2.protocol.crc import CRC16
import struct

# Route waypoints: Glasgow -> Madrid via major roads
# Format: (lat, lon, name, typical_speed_kmh)
ROUTE_WAYPOINTS = [
    # Glasgow
    (55.8642, -4.2518, "Glasgow", 30),
    (55.8500, -4.2700, "Glasgow South", 50),

    # M74 South through Scotland
    (55.7800, -4.1500, "Hamilton", 110),
    (55.6500, -3.9500, "Lanark area", 110),
    (55.4500, -3.8000, "Abington", 110),
    (55.3000, -3.6500, "Beattock", 100),
    (55.0500, -3.4500, "Lockerbie", 110),
    (54.9000, -3.2500, "Gretna", 110),

    # M6 through England
    (54.8900, -2.9400, "Carlisle", 90),
    (54.6500, -2.7500, "Penrith", 110),
    (54.3500, -2.6000, "Kendal area", 110),
    (54.0500, -2.8000, "Lancaster", 100),
    (53.7500, -2.7000, "Preston", 110),
    (53.4800, -2.2400, "Manchester area", 80),
    (53.2500, -2.1500, "Knutsford", 110),
    (52.9500, -2.1000, "Stoke area", 110),
    (52.6500, -1.9500, "Birmingham M6", 100),
    (52.4000, -1.8000, "Coventry area", 110),

    # M1/M25/M20 to Channel
    (52.0500, -1.3000, "Northampton area", 110),
    (51.7500, -0.5000, "M25 North", 90),
    (51.4500, 0.2000, "M25 East", 80),
    (51.2800, 0.5200, "M20 Maidstone", 110),
    (51.1300, 1.0800, "Folkestone", 60),

    # Channel Tunnel / Ferry
    (51.0500, 1.5000, "Channel crossing", 30),
    (50.9500, 1.8500, "Calais", 40),

    # A26/A1 through France
    (50.6300, 2.0000, "Boulogne area", 110),
    (50.2900, 2.7800, "Arras area", 130),
    (49.8500, 2.3000, "Amiens area", 130),
    (49.4500, 2.1000, "Compiègne area", 130),
    (49.0500, 2.5000, "Paris North", 90),
    (48.8566, 2.3522, "Paris", 50),
    (48.7000, 2.3500, "Paris South", 80),

    # A10 through France to Spain
    (48.3000, 1.5000, "Chartres area", 130),
    (47.9000, 1.9000, "Orléans", 110),
    (47.3900, 0.6900, "Tours", 100),
    (46.5800, 0.3400, "Poitiers", 130),
    (45.7500, -0.6000, "Angoulême area", 130),
    (44.8378, -0.5792, "Bordeaux", 90),

    # A63 to Spain
    (44.4000, -1.0000, "Arcachon area", 130),
    (43.7000, -1.2000, "Bayonne area", 110),
    (43.4800, -1.5500, "Biarritz", 90),
    (43.3100, -1.9800, "San Sebastián", 80),

    # AP-1/AP-68 through Spain
    (43.2600, -2.9200, "Bilbao", 80),
    (42.8500, -2.6800, "Vitoria-Gasteiz", 120),
    (42.4600, -2.4500, "Logroño", 120),
    (42.0000, -2.5000, "Soria area", 120),
    (41.6500, -2.0000, "Medinaceli", 120),
    (41.4000, -2.2000, "Sigüenza area", 120),
    (40.9000, -3.0000, "Guadalajara area", 120),
    (40.6500, -3.2000, "Alcalá area", 100),

    # Madrid
    (40.4500, -3.5500, "Madrid North", 80),
    (40.4168, -3.7038, "Madrid Centro", 40),
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
            lat += random.uniform(-0.001, 0.001)
            lon += random.uniform(-0.001, 0.001)
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
        current_time = datetime.now(timezone.utc) - timedelta(hours=24)  # Start 24 hours ago
        battery = 100

        for i in range(len(ROUTE_WAYPOINTS) - 1):
            start = ROUTE_WAYPOINTS[i]
            end = ROUTE_WAYPOINTS[i + 1]

            # Calculate distance and time
            distance = self.calculate_distance(start[0], start[1], end[0], end[1])
            avg_speed = (start[3] + end[3]) / 2

            # Time = distance / speed (in hours), convert to points
            time_hours = distance / avg_speed
            num_points = max(2, int(time_hours * 6))  # ~10 min intervals

            # Generate intermediate points
            points = self.interpolate_points(start, end, num_points)

            for j, (lat, lon) in enumerate(points):
                # Vary speed realistically
                base_speed = avg_speed
                speed = base_speed + random.uniform(-15, 15)
                speed = max(0, min(speed, 140))  # Cap speed

                # Occasional stops
                if random.random() < 0.02:  # 2% chance of stop
                    speed = 0
                    current_time += timedelta(minutes=random.randint(5, 30))  # Rest stop

                # Battery drain (roughly 1% per 30 min of driving)
                if j % 3 == 0 and battery > 10:
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
        client = b"RouteTest"
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

    async def send_route(self, points):
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

                if i % 50 == 0:
                    print(f"Sent {i+1}/{len(points)}: {point['location']} - "
                          f"({point['latitude']:.4f}, {point['longitude']:.4f}) "
                          f"{point['speed']:.0f}km/h {point['battery']}%")

                # Small delay to not overwhelm the server
                await asyncio.sleep(0.05)

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

    print("Generating Glasgow to Madrid route...")
    print(f"Route has {len(ROUTE_WAYPOINTS)} waypoints")

    points = generator.generate_route_points()
    print(f"Generated {len(points)} GPS points")

    # Show route summary
    print("\nRoute summary:")
    for i, wp in enumerate(ROUTE_WAYPOINTS[::5]):  # Every 5th waypoint
        print(f"  - {wp[2]}")
    print(f"  ... and {len(ROUTE_WAYPOINTS) - len(ROUTE_WAYPOINTS[::5])} more waypoints")

    print("\nSending to server...")
    await generator.send_route(points)


if __name__ == "__main__":
    asyncio.run(main())
