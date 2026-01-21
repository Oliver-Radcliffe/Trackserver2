"""SQLAlchemy models for Trackserver2."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
    LargeBinary, JSON, Index
)
from sqlalchemy.orm import relationship

from .database import Base


class Account(Base):
    """Account (organization/company) model."""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    devices = relationship("Device", back_populates="account")
    users = relationship("User", back_populates="account")


class Device(Base):
    """Device (tracking beacon) model."""
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    device_key = Column(Integer, unique=True, nullable=False, index=True)
    serial_number = Column(String(24), nullable=False)
    name = Column(String(50))
    passphrase = Column(String(64), nullable=False)
    device_type = Column(String(20), default="Millitag")
    enabled = Column(Boolean, default=True)
    last_seen_at = Column(DateTime)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    account = relationship("Account", back_populates="devices")
    positions = relationship("Position", back_populates="device")
    geofences = relationship("Geofence", back_populates="device")
    commands = relationship("Command", back_populates="device")
    alerts = relationship("Alert", back_populates="device")


class Position(Base):
    """GPS position data model."""
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Integer)
    speed = Column(Float)
    heading = Column(Integer)
    satellites = Column(Integer)
    hdop = Column(Float)
    battery = Column(Integer)
    gsm_signal = Column(Integer)
    status_flags = Column(Integer)
    is_moving = Column(Boolean)
    raw_data = Column(LargeBinary)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Additional fields from ciNet protocol
    temperature = Column(Integer)
    motion = Column(Integer)
    lac = Column(Integer)
    cell_id = Column(Integer)
    operator = Column(String(16))

    # Cellular network details
    mcc = Column(Integer)                    # Mobile Country Code
    mnc = Column(Integer)                    # Mobile Network Code
    network_type = Column(String(10))        # 2G, 3G, 4G, LTE
    timing_advance = Column(Integer)         # GSM timing advance
    bit_error_rate = Column(Integer)         # GSM bit error rate

    # GPS quality
    gps_valid = Column(Boolean)              # GPS fix valid
    gps_accuracy = Column(String(20))        # High/Medium/Low/No Confidence

    # Device I/O
    input_state = Column(String(10))         # High/Low
    output_state = Column(String(10))        # Open/Closed
    input_triggered = Column(Boolean)        # Input trigger flag

    # Power
    power_source = Column(String(20))        # Integrated Battery, External
    external_battery_volts = Column(Float)   # External battery voltage
    external_battery_low = Column(Boolean)   # External battery low flag
    battery_used_mah = Column(Integer)       # Integrated battery used mAh

    # Message metadata
    message_type = Column(String(20))        # Position, Status, GSM, Diagnostic
    packet_number = Column(Integer)          # Packet sequence number
    packet_index = Column(Integer)           # Index within packet

    # Additional status
    geozone = Column(Integer)                # Geozone ID
    alerts = Column(Integer)                 # Alert flags
    tamper = Column(String(10))              # Enabled/Disabled

    # RF/Config
    rf_mode = Column(String(10))             # Off, On
    rf_channel = Column(Integer)             # RF channel number
    df_pulse_type = Column(String(10))       # DF10, etc.
    cinet_mode = Column(String(10))          # Fast, etc.
    config_id = Column(Integer)              # Configuration ID
    firmware_version = Column(String(20))    # Firmware version string

    # Relationships
    device = relationship("Device", back_populates="positions")

    # Indexes for common queries
    __table_args__ = (
        Index('idx_positions_device_time', 'device_id', 'timestamp'),
        Index('idx_positions_timestamp', 'timestamp'),
    )


class User(Base):
    """User model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100))
    role = Column(String(20), default="user")  # admin, user, viewer
    enabled = Column(Boolean, default=True)
    last_login_at = Column(DateTime)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    account = relationship("Account", back_populates="users")


class Geofence(Base):
    """Geofence model."""
    __tablename__ = "geofences"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    name = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius = Column(Integer, nullable=False)  # meters
    alert_on_enter = Column(Boolean, default=True)
    alert_on_exit = Column(Boolean, default=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    device = relationship("Device", back_populates="geofences")


class Command(Base):
    """Device command model."""
    __tablename__ = "commands"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    command_type = Column(String(50), nullable=False)
    command_data = Column(JSON)
    status = Column(String(20), default="pending")  # pending, sent, acknowledged, failed
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    sent_at = Column(DateTime)
    acknowledged_at = Column(DateTime)
    error_message = Column(Text)

    # Relationships
    device = relationship("Device", back_populates="commands")

    __table_args__ = (
        Index('idx_commands_device_status', 'device_id', 'status'),
    )


class Alert(Base):
    """Alert/event model."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    alert_type = Column(String(50), nullable=False)
    message = Column(Text)
    position_id = Column(Integer, ForeignKey("positions.id"))
    acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    device = relationship("Device", back_populates="alerts")
