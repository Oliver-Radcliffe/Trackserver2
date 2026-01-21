#!/usr/bin/env python3
"""
Import CSV log files (Neo Net Log, Rapid Log) into Trackserver2 database.
"""

import asyncio
import csv
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from trackserver2.models.database import init_db, AsyncSessionLocal
from trackserver2.models.models import Account, Device, Position


def parse_neo_net_timestamp(ts: str) -> datetime:
    """Parse Neo Net Log timestamp format: DD/MM/YYYY HH:MM:SS"""
    if not ts or ts.strip() == '':
        return None
    try:
        return datetime.strptime(ts.strip(), "%d/%m/%Y %H:%M:%S")
    except ValueError:
        return None


def parse_rapid_timestamp(ts: str) -> datetime:
    """Parse Rapid Log timestamp format: DD/MM/YYYY HH:MM:SS"""
    if not ts or ts.strip() == '' or ts.startswith('01/01/0001'):
        return None
    try:
        return datetime.strptime(ts.strip(), "%d/%m/%Y %H:%M:%S")
    except ValueError:
        return None


def parse_gsm_signal(signal_str: str) -> int:
    """Parse GSM signal like '37% (-82 dBm)' to percentage."""
    if not signal_str:
        return None
    try:
        return int(signal_str.split('%')[0])
    except (ValueError, IndexError):
        return None


def parse_int(val: str) -> int:
    """Parse integer, return None if empty or invalid."""
    if not val or val.strip() == '':
        return None
    try:
        return int(val)
    except ValueError:
        return None


def parse_float(val: str) -> float:
    """Parse float, return None if empty or invalid."""
    if not val or val.strip() == '':
        return None
    try:
        return float(val)
    except ValueError:
        return None


def parse_bool(val: str) -> bool:
    """Parse boolean from Yes/No or similar."""
    if not val:
        return None
    val = val.strip().lower()
    return val in ('yes', 'true', '1', 'high', 'enabled')


async def ensure_device(session, serial_number: str, account_id: int) -> Device:
    """Get or create device by serial number."""
    result = await session.execute(
        select(Device).where(Device.serial_number == str(serial_number))
    )
    device = result.scalar_one_or_none()

    if not device:
        # Create device with a generated device key
        device_key = int(serial_number) if serial_number.isdigit() else hash(serial_number) & 0xFFFFFFFF
        device = Device(
            account_id=account_id,
            device_key=device_key,
            serial_number=str(serial_number),
            name=f"Imported Device {serial_number}",
            passphrase="imported",
            device_type="NeonNet",
            enabled=True,
        )
        session.add(device)
        await session.flush()
        print(f"Created device: {serial_number} (key: 0x{device_key:08X})")

    return device


async def import_neo_net_log(filepath: str):
    """Import Neo Net Log CSV file."""
    print(f"\nImporting Neo Net Log: {filepath}")

    await init_db()

    async with AsyncSessionLocal() as session:
        # Get or create account
        result = await session.execute(select(Account).limit(1))
        account = result.scalar_one_or_none()
        if not account:
            account = Account(name="Imported Data", enabled=True)
            session.add(account)
            await session.flush()

        devices_cache = {}
        positions_added = 0
        rows_processed = 0

        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)

            for row in reader:
                rows_processed += 1

                # Parse timestamp
                timestamp = parse_neo_net_timestamp(row.get('Time (UTC)'))
                if not timestamp:
                    continue

                # Get latitude/longitude
                lat = parse_float(row.get('Latitude'))
                lon = parse_float(row.get('Longitude'))
                if lat is None or lon is None:
                    continue

                # Get or create device
                serial = row.get('Serial Number', '').strip()
                if not serial:
                    continue

                if serial not in devices_cache:
                    devices_cache[serial] = await ensure_device(session, serial, account.id)
                device = devices_cache[serial]

                # Map GPS Quality to gps_valid and gps_accuracy
                gps_quality = row.get('GPS Quality', '')
                gps_valid = gps_quality.lower() == 'good' if gps_quality else None
                gps_accuracy = gps_quality if gps_quality else None

                # Map motion status
                motion_status = row.get('Motion Status', '')
                is_moving = motion_status.lower() not in ('stationary', '') if motion_status else None
                motion = 1 if is_moving else 0

                # Parse battery percentage (e.g., "100%" -> 100)
                battery_str = row.get('Integrated Battery (%)', '')
                battery = None
                if battery_str:
                    try:
                        battery = int(battery_str.replace('%', ''))
                    except ValueError:
                        pass

                # Create position
                position = Position(
                    device_id=device.id,
                    timestamp=timestamp,
                    latitude=lat,
                    longitude=lon,
                    speed=parse_float(row.get('Speed (kph)')),
                    heading=parse_int(row.get('Heading')),
                    satellites=parse_int(row.get('Satellites')),
                    battery=battery,
                    gsm_signal=parse_gsm_signal(row.get('GSM Signal')),
                    is_moving=is_moving,
                    temperature=parse_int(row.get('Temperature (C)').replace('.0', '')) if row.get('Temperature (C)') else None,
                    motion=motion,
                    lac=parse_int(row.get('LAC')),
                    cell_id=parse_int(row.get('Cell ID')),
                    # New fields
                    mcc=parse_int(row.get('MCC')),
                    mnc=parse_int(row.get('MNC')),
                    network_type=row.get('Network Type') or None,
                    timing_advance=parse_int(row.get('Timing Advance')),
                    gps_valid=gps_valid,
                    gps_accuracy=gps_accuracy,
                    input_state=row.get('Sense Input') or None,
                    output_state=row.get('Output Switch') or None,
                    input_triggered=parse_bool(row.get('Input Triggered')),
                    power_source=row.get('Power Source') or None,
                    battery_used_mah=parse_int(row.get('Integrated Battery Used (mAh)')),
                    message_type=row.get('Type') or None,
                    packet_number=parse_int(row.get('Packet Number')),
                    packet_index=parse_int(row.get('Packet Index')),
                    geozone=parse_int(row.get('Geozone')),
                    tamper=row.get('Tamper') or None,
                    rf_mode=row.get('RF Mode') or None,
                    rf_channel=parse_int(row.get('RF Channel')),
                    df_pulse_type=row.get('DF Pulse Type') or None,
                    cinet_mode=row.get('ciNet Mode') or None,
                    config_id=parse_int(row.get('Config Id')),
                    firmware_version=row.get('Firmware') or None,
                )
                session.add(position)
                positions_added += 1

                # Commit in batches
                if positions_added % 1000 == 0:
                    await session.commit()
                    print(f"  Processed {rows_processed} rows, added {positions_added} positions...")

        await session.commit()
        print(f"\nDone! Processed {rows_processed} rows, added {positions_added} positions.")


async def import_rapid_log(filepath: str):
    """Import Rapid Log CSV file."""
    print(f"\nImporting Rapid Log: {filepath}")

    await init_db()

    async with AsyncSessionLocal() as session:
        # Get or create account
        result = await session.execute(select(Account).limit(1))
        account = result.scalar_one_or_none()
        if not account:
            account = Account(name="Imported Data", enabled=True)
            session.add(account)
            await session.flush()

        devices_cache = {}
        positions_added = 0
        rows_processed = 0

        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)

            for row in reader:
                rows_processed += 1

                # Parse timestamp
                timestamp = parse_rapid_timestamp(row.get('Time (UTC +1)'))
                if not timestamp:
                    continue

                # Get latitude/longitude
                lat = parse_float(row.get('Latitude'))
                lon = parse_float(row.get('Longitude'))
                if lat is None or lon is None:
                    continue

                # Get or create device
                serial = row.get('Serial Number', '').strip()
                if not serial:
                    continue

                if serial not in devices_cache:
                    devices_cache[serial] = await ensure_device(session, serial, account.id)
                device = devices_cache[serial]

                # Map GPS Valid
                gps_valid_str = row.get('GPS Valid', '')
                gps_valid = gps_valid_str.lower() == 'true' if gps_valid_str else None

                # Map moving
                moving_str = row.get('Moving', '')
                is_moving = moving_str.lower() == 'true' if moving_str else None

                # Create position
                position = Position(
                    device_id=device.id,
                    timestamp=timestamp,
                    latitude=lat,
                    longitude=lon,
                    speed=parse_float(row.get('Speed (kph)')),
                    heading=parse_int(row.get('Heading')),
                    satellites=parse_int(row.get('Satellites Used')),
                    battery=parse_int(row.get('Battery %')),
                    gsm_signal=parse_int(row.get('GSM Signal (%)')),
                    is_moving=is_moving,
                    temperature=parse_int(row.get('Temperature (C)')),
                    lac=parse_int(row.get('LAC')),
                    cell_id=parse_int(row.get('Cell ID')),
                    # New fields
                    mcc=parse_int(row.get('MCC')),
                    mnc=parse_int(row.get('MNC')),
                    timing_advance=parse_int(row.get('Timing Advance')),
                    bit_error_rate=parse_int(row.get('Bit Error Rate')),
                    gps_valid=gps_valid,
                    gps_accuracy=row.get('GPS Accuracy') or None,
                    input_state=row.get('Input') or None,
                    output_state=row.get('Output') or None,
                    input_triggered=parse_bool(row.get('Input Triggered')),
                    external_battery_volts=parse_float(row.get('Ext Battery Volts')),
                    external_battery_low=parse_bool(row.get('Ext Battery Low')),
                    message_type=row.get('Type') or None,
                    packet_number=parse_int(row.get('Record Number')),
                )
                session.add(position)
                positions_added += 1

                # Commit in batches
                if positions_added % 1000 == 0:
                    await session.commit()
                    print(f"  Processed {rows_processed} rows, added {positions_added} positions...")

        await session.commit()
        print(f"\nDone! Processed {rows_processed} rows, added {positions_added} positions.")


async def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python import_csv_logs.py <csv_file> [--type neo|rapid]")
        print("\nAuto-detects format based on header if --type not specified.")
        sys.exit(1)

    filepath = sys.argv[1]

    # Check file exists
    if not Path(filepath).exists():
        print(f"Error: File not found: {filepath}")
        sys.exit(1)

    # Determine format
    log_type = None
    if '--type' in sys.argv:
        idx = sys.argv.index('--type')
        if idx + 1 < len(sys.argv):
            log_type = sys.argv[idx + 1].lower()

    if not log_type:
        # Auto-detect based on header
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            header = f.readline()
            if 'Packet Number' in header and 'Beacon Type' in header:
                log_type = 'neo'
            elif 'Record Number' in header and 'GPS Valid' in header:
                log_type = 'rapid'
            else:
                print("Could not auto-detect log format. Please specify --type neo or --type rapid")
                sys.exit(1)

    print(f"Detected format: {log_type}")

    if log_type == 'neo':
        await import_neo_net_log(filepath)
    elif log_type == 'rapid':
        await import_rapid_log(filepath)
    else:
        print(f"Unknown log type: {log_type}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
