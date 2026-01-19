# Trackserver2 - Technical Specification
## Modern GPS Tracking Server for Pico Beacon

**Document Version:** 1.0
**Date:** January 2026
**Status:** Draft Specification

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Protocol Server](#5-protocol-server)
6. [Database Schema](#6-database-schema)
7. [REST API](#7-rest-api)
8. [Web Dashboard](#8-web-dashboard)
9. [Real-time Updates](#9-real-time-updates)
10. [Security](#10-security)
11. [Deployment](#11-deployment)
12. [Migration from Legacy](#12-migration-from-legacy)

---

## 1. Executive Summary

### 1.1 Purpose

Trackserver2 is a modern, open-source GPS tracking server designed to:
- Receive position data from Pico Beacon devices using the ciNet protocol
- Provide a web-based dashboard for real-time tracking visualization
- Offer a REST API for third-party integrations
- Replace the legacy Windows-based TrackServer with a cross-platform solution

### 1.2 Key Improvements Over Legacy System

| Aspect | Legacy TrackServer | Trackserver2 |
|--------|-------------------|--------------|
| Platform | Windows only (IIS + SQL Server) | Cross-platform (Linux/Docker) |
| Database | SQL Server | PostgreSQL (or SQLite for dev) |
| Frontend | ASP.NET Web Forms + Prototype.js | React + Modern JavaScript |
| Mapping | Google Maps (paid) | OpenStreetMap + Leaflet (free) |
| API | SOAP + proprietary JSON | REST API + WebSocket |
| Deployment | Manual Windows install | Docker containers |
| Real-time | Polling (2s interval) | WebSocket push |

### 1.3 Compatibility

- **Full compatibility** with Pico Beacon ciNet protocol
- **Full compatibility** with existing RAPID 2 devices
- **Backward compatible** with legacy Millitag devices

---

## 2. System Overview

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRACKSERVER2                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Protocol   │    │   REST API   │    │  WebSocket   │          │
│  │   Server     │    │   Server     │    │   Server     │          │
│  │  (TCP 4509)  │    │  (HTTP 8080) │    │  (WS 8081)   │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                        │
│                    ┌────────┴────────┐                              │
│                    │  Message Queue  │                              │
│                    │   (Internal)    │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│                    ┌────────┴────────┐                              │
│                    │   PostgreSQL    │                              │
│                    │    Database     │                              │
│                    └─────────────────┘                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │  Pico   │         │  Mobile │         │   Web   │
    │ Beacon  │         │   App   │         │Dashboard│
    └─────────┘         └─────────┘         └─────────┘
```

### 2.2 Data Flow

1. **Device → Protocol Server**: Pico Beacon sends 149-byte ciNet message via TCP
2. **Protocol Server → Database**: Decrypted position data stored
3. **Protocol Server → WebSocket**: Real-time position broadcast to connected clients
4. **Web Dashboard → REST API**: Historical data queries
5. **Web Dashboard → WebSocket**: Live position updates

---

## 3. Architecture

### 3.1 Service Components

#### 3.1.1 Protocol Server (ciNet Receiver)
- TCP listener on port 4509
- Handles ciNet 149-byte binary protocol
- Blowfish decryption (256-bit key)
- PBKDF2 key derivation
- CRC16 validation
- Device authentication

#### 3.1.2 REST API Server
- HTTP/HTTPS on port 8080
- JWT authentication
- Device management endpoints
- Position history queries
- User management
- Command dispatch

#### 3.1.3 WebSocket Server
- Real-time position broadcasts
- Per-device subscription channels
- Connection authentication
- Heartbeat/keepalive

#### 3.1.4 Web Dashboard
- Single Page Application (SPA)
- OpenStreetMap with Leaflet
- Real-time device tracking
- Historical track playback
- Geofence management
- Device configuration

### 3.2 Design Principles

1. **Stateless services** - Horizontal scaling capability
2. **Event-driven** - Position updates trigger downstream actions
3. **Separation of concerns** - Protocol handling separate from business logic
4. **Configuration over code** - Environment variables for deployment
5. **Observable** - Structured logging, metrics, health checks

---

## 4. Technology Stack

### 4.1 Backend (Recommended)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | Python 3.11+ | Same as Pico Beacon, code sharing |
| Web Framework | FastAPI | Async, automatic OpenAPI docs |
| Protocol Server | asyncio | High-performance async TCP |
| Database ORM | SQLAlchemy 2.0 | Async support, migrations |
| WebSocket | websockets | Native Python async WebSocket |
| Task Queue | Celery (optional) | Background job processing |
| Caching | Redis (optional) | Session/rate limiting |

### 4.2 Frontend

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | React 18+ | Component-based, large ecosystem |
| Build Tool | Vite | Fast development, modern bundling |
| State Management | Zustand | Simple, no boilerplate |
| Mapping | Leaflet + React-Leaflet | Free, OpenStreetMap |
| UI Components | Tailwind CSS | Utility-first, responsive |
| Charts | Chart.js | Lightweight charting |

### 4.3 Database

| Environment | Database | Notes |
|-------------|----------|-------|
| Development | SQLite | Zero config, file-based |
| Production | PostgreSQL 15+ | Scalable, PostGIS for geo |

### 4.4 Deployment

| Component | Technology |
|-----------|------------|
| Containerization | Docker |
| Orchestration | Docker Compose (single server) |
| Reverse Proxy | Nginx or Caddy |
| SSL/TLS | Let's Encrypt |

---

## 5. Protocol Server

### 5.1 ciNet Protocol Implementation

The protocol server must handle the ciNet/Millitag 149-byte message format:

```
┌─────────────────────────────────────────────────────────────────────┐
│ BYTE 0-50: PLAIN TEXT HEADER (51 bytes)                             │
├─────────────────────────────────────────────────────────────────────┤
│ 0     : Start byte (0x24 = '$')                                     │
│ 1     : Packet type (0x55 = 'U')                                    │
│ 2     : ciNet type (0x44 = 'D')                                     │
│ 3     : Message type (0x02 = position)                              │
│ 4-7   : Device key (4 bytes, e.g., 0x06EA83A3)                     │
│ 8     : Alarm code (0xFF = normal)                                  │
│ 9-32  : Serial number (24 bytes, null-padded string)               │
│ 33-52 : Client name (20 bytes, null-padded string)                 │
├─────────────────────────────────────────────────────────────────────┤
│ BYTE 51-146: ENCRYPTED PAYLOAD (96 bytes = 12 Blowfish blocks)     │
├─────────────────────────────────────────────────────────────────────┤
│ After decryption:                                                   │
│ 0-1   : Payload CRC16 (inverted)                                   │
│ 2     : Source type length                                          │
│ 3-14  : Source type string (12 bytes)                              │
│ 15-22 : Operator string (8 bytes)                                  │
│ 23-27 : Timestamp (5 bytes, Datong format)                         │
│ 28-31 : Latitude (int32, degrees × 60000)                          │
│ 32-35 : Longitude (int32, degrees × 60000)                         │
│ 36-37 : Altitude (int16, meters)                                   │
│ 38-39 : Speed (uint16, km/h × 10)                                  │
│ 40-41 : Heading (uint16, degrees × 10)                             │
│ 42    : GPS satellite count                                         │
│ 43    : HDOP (× 10)                                                 │
│ 44    : Status flags                                                │
│ 45    : Battery percentage                                          │
│ 46-47 : GSM signal / LAC                                           │
│ 48-51 : Cell ID                                                     │
│ 52-93 : Reserved / additional data                                 │
├─────────────────────────────────────────────────────────────────────┤
│ BYTE 147-148: MESSAGE CRC16 (2 bytes)                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Protocol Server Pseudocode

```python
async def handle_client(reader, writer):
    device_key = None
    passphrase = None
    cipher = None

    while True:
        # Read 149-byte message
        data = await reader.readexactly(149)

        # Validate start byte and packet type
        if data[0] != 0x24 or data[1] != 0x55:
            continue

        # Extract device key
        device_key = struct.unpack('>I', data[4:8])[0]

        # Look up device and get passphrase
        device = await db.get_device_by_key(device_key)
        if not device:
            continue

        # Initialize cipher if needed
        if cipher is None:
            key = derive_key(device.passphrase)
            cipher = Blowfish(key)

        # Validate message CRC
        if not validate_crc(data):
            continue

        # Decrypt payload
        payload = decrypt_payload(cipher, data[51:147])

        # Parse position data
        position = parse_position(payload)

        # Store in database
        await db.store_position(device.id, position)

        # Broadcast to WebSocket clients
        await broadcast_position(device.id, position)
```

### 5.3 Key Derivation

```python
def derive_key(passphrase: str) -> bytes:
    """PBKDF2-HMAC-SHA1 key derivation."""
    salt = bytes([0x74, 0xC4, 0x89, 0x4C, 0x4F, 0x38, 0xFF, 0xCC])
    return hashlib.pbkdf2_hmac(
        'sha1',
        passphrase.encode('utf-8'),
        salt,
        iterations=1000,
        dklen=32
    )
```

---

## 6. Database Schema

### 6.1 Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   accounts  │       │   devices   │       │  positions  │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │──┐    │ id (PK)     │──┐    │ id (PK)     │
│ name        │  │    │ account_id  │──┘    │ device_id   │──┐
│ created_at  │  └───>│ device_key  │       │ timestamp   │  │
│ enabled     │       │ serial      │       │ latitude    │  │
└─────────────┘       │ name        │       │ longitude   │  │
                      │ passphrase  │       │ altitude    │  │
┌─────────────┐       │ device_type │       │ speed       │  │
│    users    │       │ enabled     │       │ heading     │  │
├─────────────┤       │ last_seen   │       │ satellites  │  │
│ id (PK)     │       │ created_at  │       │ hdop        │  │
│ account_id  │──┐    └─────────────┘       │ battery     │  │
│ email       │  │           ▲              │ gsm_signal  │  │
│ password    │  │           │              │ status      │  │
│ role        │  │    ┌──────┴──────┐       │ raw_data    │  │
│ created_at  │  │    │             │       └─────────────┘  │
└─────────────┘  │    │             │              ▲         │
                 │    ▼             ▼              │         │
          ┌──────┴────────┐ ┌─────────────┐       │         │
          │ user_devices  │ │  geofences  │       │         │
          ├───────────────┤ ├─────────────┤       │         │
          │ user_id (PK)  │ │ id (PK)     │       │         │
          │ device_id(PK) │ │ device_id   │───────┘         │
          └───────────────┘ │ name        │                 │
                            │ lat         │                 │
                            │ lon         │                 │
                            │ radius      │                 │
                            │ enabled     │                 │
                            └─────────────┘                 │
                                                            │
                      ┌─────────────┐                       │
                      │  commands   │                       │
                      ├─────────────┤                       │
                      │ id (PK)     │                       │
                      │ device_id   │───────────────────────┘
                      │ command     │
                      │ status      │
                      │ created_at  │
                      │ executed_at │
                      └─────────────┘
```

### 6.2 SQL Schema (PostgreSQL)

```sql
-- Accounts (organizations/companies)
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Devices (tracking beacons)
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    device_key INTEGER NOT NULL UNIQUE,  -- 4-byte hex key as integer
    serial_number VARCHAR(24) NOT NULL,
    name VARCHAR(50),
    passphrase VARCHAR(64) NOT NULL,
    device_type VARCHAR(20) DEFAULT 'Millitag',
    enabled BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_devices_key ON devices(device_key);

-- Positions (GPS data)
CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    timestamp TIMESTAMP NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude SMALLINT,
    speed REAL,                    -- km/h
    heading SMALLINT,              -- degrees
    satellites SMALLINT,
    hdop REAL,
    battery SMALLINT,              -- percentage
    gsm_signal SMALLINT,
    status_flags INTEGER,
    is_moving BOOLEAN,
    raw_data BYTEA,               -- Original encrypted payload
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_positions_device_time ON positions(device_id, timestamp DESC);
CREATE INDEX idx_positions_timestamp ON positions(timestamp DESC);

-- Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',  -- admin, user, viewer
    enabled BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User-Device permissions
CREATE TABLE user_devices (
    user_id INTEGER REFERENCES users(id),
    device_id INTEGER REFERENCES devices(id),
    PRIMARY KEY (user_id, device_id)
);

-- Geofences
CREATE TABLE geofences (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    name VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius INTEGER NOT NULL,       -- meters
    alert_on_enter BOOLEAN DEFAULT TRUE,
    alert_on_exit BOOLEAN DEFAULT TRUE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device Commands (for remote control)
CREATE TABLE commands (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    command_type VARCHAR(50) NOT NULL,
    command_data JSONB,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, acknowledged, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX idx_commands_device_status ON commands(device_id, status);

-- Alerts/Events
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    alert_type VARCHAR(50) NOT NULL,
    message TEXT,
    position_id BIGINT REFERENCES positions(id),
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. REST API

### 7.1 API Overview

Base URL: `https://api.trackserver2.local/v1`

Authentication: Bearer JWT token

### 7.2 Endpoints

#### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/refresh` | Refresh JWT token |
| POST | `/auth/logout` | Invalidate token |

#### Devices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/devices` | List all devices |
| GET | `/devices/{id}` | Get device details |
| POST | `/devices` | Register new device |
| PUT | `/devices/{id}` | Update device |
| DELETE | `/devices/{id}` | Delete device |
| GET | `/devices/{id}/position` | Get latest position |
| GET | `/devices/{id}/positions` | Get position history |

#### Positions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/positions` | Query positions (with filters) |
| GET | `/positions/{id}` | Get single position |

#### Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/devices/{id}/commands` | List commands |
| POST | `/devices/{id}/commands` | Send command |

#### Geofences

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/devices/{id}/geofences` | List geofences |
| POST | `/devices/{id}/geofences` | Create geofence |
| PUT | `/geofences/{id}` | Update geofence |
| DELETE | `/geofences/{id}` | Delete geofence |

### 7.3 Example Requests

#### Login
```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret123"
}
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

#### Get Device Positions
```http
GET /v1/devices/1/positions?from=2026-01-01T00:00:00Z&to=2026-01-19T23:59:59Z&limit=1000
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Response:
```json
{
  "device_id": 1,
  "positions": [
    {
      "id": 12345,
      "timestamp": "2026-01-19T14:30:00Z",
      "latitude": 51.5074,
      "longitude": -0.1278,
      "altitude": 15,
      "speed": 45.5,
      "heading": 180,
      "satellites": 8,
      "battery": 85,
      "is_moving": true
    }
  ],
  "total": 1,
  "has_more": false
}
```

#### Send Command
```http
POST /v1/devices/1/commands
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "command_type": "output_on",
  "command_data": {}
}
```

---

## 8. Web Dashboard

### 8.1 Features

#### 8.1.1 Live Tracking View
- Real-time map with device markers
- Device info popups (speed, battery, last update)
- Track trails (last N positions)
- Auto-center on selected device
- Multiple device view

#### 8.1.2 Historical Playback
- Date/time range selection
- Animated track playback
- Speed control (1x, 2x, 5x, 10x)
- Stop detection and highlighting
- Export to GPX/KML

#### 8.1.3 Device Management
- Device registration
- Passphrase configuration
- Enable/disable devices
- View connection history

#### 8.1.4 Geofencing
- Draw circular geofences on map
- Enter/exit alerts
- Alert history

#### 8.1.5 Commands
- Send commands to devices
- Command history
- Status tracking

#### 8.1.6 Reports
- Distance traveled
- Stop duration reports
- Speed violations
- Battery history

### 8.2 Map Configuration

Using OpenStreetMap with Leaflet:

```javascript
// Initialize map with OpenStreetMap
const map = L.map('map').setView([51.505, -0.09], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Alternative tile providers (free):
// - CartoDB: https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png
// - Stamen: https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg
```

---

## 9. Real-time Updates

### 9.1 WebSocket Protocol

Connection: `wss://api.trackserver2.local/ws`

#### Authentication
```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Subscribe to Device
```json
{
  "type": "subscribe",
  "device_ids": [1, 2, 3]
}
```

#### Position Update (server → client)
```json
{
  "type": "position",
  "device_id": 1,
  "data": {
    "timestamp": "2026-01-19T14:30:00Z",
    "latitude": 51.5074,
    "longitude": -0.1278,
    "speed": 45.5,
    "heading": 180,
    "battery": 85,
    "is_moving": true
  }
}
```

#### Alert (server → client)
```json
{
  "type": "alert",
  "device_id": 1,
  "alert_type": "geofence_exit",
  "message": "Device exited geofence 'Office'"
}
```

---

## 10. Security

### 10.1 Authentication

- JWT tokens with 1-hour expiry
- Refresh tokens for session extension
- Password hashing with bcrypt
- Rate limiting on auth endpoints

### 10.2 Authorization

- Role-based access control (Admin, User, Viewer)
- Device-level permissions
- Account isolation

### 10.3 Transport Security

- TLS 1.3 for all HTTP/WebSocket connections
- TCP port 4509 optionally with TLS (for capable devices)

### 10.4 Data Protection

- Passphrase stored hashed (for display) + encrypted (for use)
- Position data encrypted at rest (optional)
- Audit logging for sensitive operations

---

## 11. Deployment

### 11.1 Docker Compose

```yaml
version: '3.8'

services:
  # Protocol Server (ciNet receiver)
  protocol-server:
    build: ./protocol-server
    ports:
      - "4509:4509"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/trackserver2
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    restart: unless-stopped

  # REST API + WebSocket Server
  api-server:
    build: ./api-server
    ports:
      - "8080:8080"
      - "8081:8081"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/trackserver2
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - db
      - redis
    restart: unless-stopped

  # Web Dashboard
  dashboard:
    build: ./dashboard
    ports:
      - "3000:80"
    depends_on:
      - api-server
    restart: unless-stopped

  # PostgreSQL Database
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=trackserver
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=trackserver2
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  # Redis (caching, pub/sub)
  redis:
    image: redis:7-alpine
    restart: unless-stopped

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - api-server
      - dashboard
    restart: unless-stopped

volumes:
  postgres_data:
```

### 11.2 Environment Variables

```env
# Database
DATABASE_URL=postgresql://trackserver:password@localhost:5432/trackserver2

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-256-bit-secret-key
JWT_EXPIRY=3600

# Protocol Server
CINET_PORT=4509
CINET_HOST=0.0.0.0

# API Server
API_PORT=8080
WS_PORT=8081
```

---

## 12. Migration from Legacy

### 12.1 Data Migration

For existing TrackServer installations, a migration tool will:

1. Export devices from SQL Server `Devices` table
2. Export users from `aspnet_Users` / `UserProfile`
3. Export position history from `DeviceLog` (with decryption)
4. Import to PostgreSQL schema

### 12.2 Migration Script

```python
# migrate_legacy.py (pseudocode)
async def migrate():
    # Connect to legacy SQL Server
    legacy_db = connect_sqlserver(LEGACY_CONNECTION_STRING)

    # Connect to new PostgreSQL
    new_db = connect_postgres(NEW_DATABASE_URL)

    # Migrate accounts
    accounts = legacy_db.query("SELECT * FROM Accounts")
    for account in accounts:
        new_db.insert("accounts", account)

    # Migrate devices
    devices = legacy_db.query("SELECT * FROM Devices")
    for device in devices:
        new_db.insert("devices", transform_device(device))

    # Migrate users
    users = legacy_db.query("""
        SELECT u.*, p.*
        FROM aspnet_Users u
        JOIN UserProfile p ON u.UserId = p.UserID
    """)
    for user in users:
        new_db.insert("users", transform_user(user))

    # Migrate position history (large - batch processing)
    for device in devices:
        positions = legacy_db.query(
            "SELECT * FROM DeviceLog WHERE DeviceId = ?",
            device.id
        )
        for batch in chunk(positions, 1000):
            decrypted = [decrypt_legacy_position(p) for p in batch]
            new_db.bulk_insert("positions", decrypted)
```

---

## Appendix A: Pico Beacon Compatibility

Trackserver2 is designed to be fully compatible with the Pico Beacon firmware. The protocol server:

1. Accepts standard ciNet 149-byte messages on TCP port 4509
2. Supports PBKDF2-HMAC-SHA1 key derivation with standard salt
3. Handles Blowfish ECB decryption
4. Validates CRC16 checksums
5. Parses Datong timestamp format
6. Supports all RAPID 2 device features

### Configuration for Pico Beacon

```json
{
  "server_host": "your-trackserver2-ip",
  "server_port": 4509,
  "passphrase": "your_passphrase",
  "cinet_key": "06.EA.83.A3",
  "serial_number": "PICO00000001"
}
```

---

## Appendix B: Development Setup

### Quick Start

```bash
# Clone repository
git clone https://github.com/your-org/trackserver2.git
cd trackserver2

# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Initialize database
python -m alembic upgrade head

# Run protocol server
python -m protocol_server

# Run API server (in another terminal)
python -m api_server

# Run frontend (in another terminal)
cd dashboard
npm install
npm run dev
```

### Testing with Pico Beacon Simulator

```bash
# Run simulator
python tools/beacon_simulator.py \
  --host localhost \
  --port 4509 \
  --passphrase "fredfred" \
  --key "06.EA.83.A3" \
  --lat 51.5074 \
  --lon -0.1278
```

---

*End of Specification*
