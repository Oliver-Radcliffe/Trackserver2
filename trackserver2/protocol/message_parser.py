"""ciNet message parser for Trackserver2."""

import struct
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from .blowfish import Blowfish, derive_key
from .crc import CRC16


@dataclass
class ParsedMessage:
    """Parsed ciNet position message."""
    # Header fields
    device_key: int
    serial_number: str
    source_type: str
    sequence: int

    # Position data
    latitude: float
    longitude: float
    altitude: int
    speed: float
    heading: Optional[float]
    timestamp: datetime

    # GPS quality
    satellites: int
    hdop: float
    gps_valid: bool

    # Device status
    battery: int
    temperature: int
    rssi: int
    motion: int
    status_flags: int

    # Cellular info
    lac: int
    cell_id: int
    operator: str

    # Additional fields
    client_name: str
    alarm: int
    beacon_mode: int
    motion_sensitivity: int
    output_state: int
    input_state: int
    geozone: int
    alerts: int
    fw_version: str

    # New fields from plan
    mcc: int = 0
    mnc: int = 0
    network_type: str = ""
    timing_advance: int = 0
    bit_error_rate: int = 0
    gps_accuracy: str = ""
    input_triggered: bool = False
    power_source: str = ""
    external_battery_volts: float = 0.0
    external_battery_low: bool = False
    battery_used_mah: int = 0
    message_type: str = "Position"
    packet_number: int = 0
    packet_index: int = 0
    tamper: str = ""
    rf_mode: str = ""
    rf_channel: int = 0
    df_pulse_type: str = ""
    cinet_mode: str = ""
    config_id: int = 0

    # Raw data for storage
    raw_data: bytes = b""


class CiNetMessageParser:
    """Parser for ciNet protocol messages."""

    MSG_LENGTH = 149
    HEADER_LENGTH = 51
    ENCRYPTED_LENGTH = 96
    ENCRYPTED_BLOCKS = 12

    START_BYTE = 0x24  # '$'
    PACKET_TYPE = 0x55  # 'U'

    def __init__(self):
        """Initialize the message parser."""
        self._cipher_cache: dict[str, Blowfish] = {}

    def get_cipher(self, passphrase: str) -> Blowfish:
        """Get or create Blowfish cipher for passphrase (cached)."""
        if passphrase not in self._cipher_cache:
            key = derive_key(passphrase)
            self._cipher_cache[passphrase] = Blowfish(key)
        return self._cipher_cache[passphrase]

    def validate_header(self, data: bytes) -> bool:
        """Validate message header bytes."""
        if len(data) < self.MSG_LENGTH:
            return False
        if data[0] != self.START_BYTE:
            return False
        if data[1] != self.PACKET_TYPE:
            return False
        return True

    def extract_device_key(self, data: bytes) -> int:
        """Extract device key from message header."""
        return struct.unpack('>I', data[5:9])[0]

    def validate_crc(self, data: bytes) -> bool:
        """Validate message CRC16."""
        # Calculate CRC over bytes 0-146
        calc_crc = CRC16.calculate(data, 0, 147)
        # Read stored CRC (inverted, little-endian at bytes 147-148)
        stored_crc_low = data[147]
        stored_crc_high = data[148]
        stored_crc = (stored_crc_high << 8) | stored_crc_low
        # Compare inverted values
        return ((~calc_crc) & 0xFFFF) == stored_crc

    def parse(self, data: bytes, passphrase: str) -> Optional[ParsedMessage]:
        """Parse a ciNet message.

        Args:
            data: 149-byte message data
            passphrase: Device passphrase for decryption

        Returns:
            ParsedMessage or None if parsing fails
        """
        if not self.validate_header(data):
            return None

        if not self.validate_crc(data):
            return None

        # Extract header fields
        sequence = data[4]
        device_key = struct.unpack('>I', data[5:9])[0]
        source_type = data[10:22].rstrip(b'\x00').decode('utf-8', errors='replace')
        serial_number = data[22:46].rstrip(b'\x00').decode('utf-8', errors='replace')
        header_timestamp = self._decode_datong_timestamp(data[46:51])

        # Decrypt payload
        cipher = self.get_cipher(passphrase)
        encrypted_data = bytearray(data[51:147])
        decrypted = cipher.decrypt_bytes(bytes(encrypted_data))

        # Validate payload CRC (bytes 2 onwards, CRC at bytes 0-1)
        payload_crc = CRC16.calculate(decrypted, 4, 92)
        stored_payload_crc = (decrypted[3] << 8) | decrypted[2]
        if ((~payload_crc) & 0xFFFF) != stored_payload_crc:
            # CRC mismatch - decryption may have failed (wrong passphrase)
            return None

        # Parse decrypted payload
        message_type = decrypted[4]
        client_name = decrypted[5:25].rstrip(b'\x00').decode('utf-8', errors='replace')

        # Position data
        lat_raw = struct.unpack('>i', decrypted[25:29])[0]
        lon_raw = struct.unpack('>i', decrypted[29:33])[0]
        latitude = lat_raw / 60000.0
        longitude = lon_raw / 60000.0

        heading_raw = struct.unpack('>H', decrypted[33:35])[0]
        heading = heading_raw / 100.0 if heading_raw != 0xFFFF else None

        speed = struct.unpack('>H', decrypted[35:37])[0]

        gps_timestamp = self._decode_datong_timestamp(decrypted[37:42])

        hdop_raw = struct.unpack('>H', decrypted[42:44])[0]
        hdop = hdop_raw / 100.0

        gps_valid = decrypted[44] == 1
        motion = decrypted[45]
        alarm = decrypted[46]

        # Millitag-specific data
        millitag_len = struct.unpack('>H', decrypted[47:49])[0]

        battery = decrypted[49]
        temperature = struct.unpack('b', decrypted[50:51])[0]  # signed byte
        satellites = decrypted[51]
        rssi = struct.unpack('>i', decrypted[52:56])[0]
        # rssi_ber at 56-60
        status_flags = struct.unpack('>H', decrypted[60:62])[0]
        lac = struct.unpack('>H', decrypted[62:64])[0]
        cell_id = struct.unpack('>H', decrypted[64:66])[0]
        act = struct.unpack('>H', decrypted[66:68])[0]
        operator = decrypted[68:76].rstrip(b'\x00').decode('utf-8', errors='replace')

        fw_major = decrypted[76]
        fw_minor = decrypted[77]
        fw_patch = decrypted[78]
        fw_version = f"{fw_major}.{fw_minor}.{fw_patch}"

        # Additional status fields
        beacon_mode = decrypted[87]
        motion_sensitivity = decrypted[88]
        wake_trigger = decrypted[89]
        output_state = decrypted[90]
        geozone = decrypted[91]
        input_state = decrypted[92]
        alerts = struct.unpack('>H', decrypted[93:95])[0]

        # Extract additional fields from status_flags and protocol data
        # Bit error rate from rssi_ber field (bytes 56-60)
        bit_error_rate = struct.unpack('>i', decrypted[56:60])[0]

        # Derive GPS accuracy from HDOP value
        if not gps_valid:
            gps_accuracy = "No Fix"
        elif hdop <= 1.0:
            gps_accuracy = "High"
        elif hdop <= 2.0:
            gps_accuracy = "Medium"
        elif hdop <= 5.0:
            gps_accuracy = "Low"
        else:
            gps_accuracy = "Poor"

        # Derive input/output state strings
        input_state_str = "High" if input_state else "Low"
        output_state_str = "Open" if output_state else "Closed"

        # Message type based on decrypted[4]
        message_type_map = {0: "Position", 1: "Status", 2: "GSM", 3: "Diagnostic"}
        message_type_str = message_type_map.get(message_type, "Position")

        return ParsedMessage(
            device_key=device_key,
            serial_number=serial_number,
            source_type=source_type,
            sequence=sequence,
            latitude=latitude,
            longitude=longitude,
            altitude=0,  # Not in this message format
            speed=float(speed),
            heading=heading,
            timestamp=gps_timestamp,
            satellites=satellites,
            hdop=hdop,
            gps_valid=gps_valid,
            battery=battery,
            temperature=temperature,
            rssi=rssi,
            motion=motion,
            status_flags=status_flags,
            lac=lac,
            cell_id=cell_id,
            operator=operator,
            client_name=client_name,
            alarm=alarm,
            beacon_mode=beacon_mode,
            motion_sensitivity=motion_sensitivity,
            output_state=output_state,
            input_state=input_state,
            geozone=geozone,
            alerts=alerts,
            fw_version=fw_version,
            # New fields
            bit_error_rate=bit_error_rate,
            gps_accuracy=gps_accuracy,
            input_triggered=wake_trigger == 1,
            message_type=message_type_str,
            packet_number=sequence,
            raw_data=bytes(data),
        )

    @staticmethod
    def _decode_datong_timestamp(ts: bytes) -> datetime:
        """Decode Datong 5-byte timestamp to datetime.

        Args:
            ts: 5-byte Datong timestamp

        Returns:
            datetime object
        """
        day = (ts[0] >> 3) & 0x1F
        month = ((ts[0] & 0x07) << 1) | ((ts[1] >> 7) & 0x01)
        year = (ts[1] & 0x7F) + 1980

        hour = (ts[2] >> 3) & 0x1F
        minute = ((ts[2] & 0x07) << 3) | ((ts[3] >> 5) & 0x07)
        second = ((ts[3] & 0x1F) << 1) | ((ts[4] >> 7) & 0x01)

        try:
            return datetime(year, month, day, hour, minute, second)
        except ValueError:
            # Invalid date, return epoch
            return datetime(1980, 1, 1, 0, 0, 0)
