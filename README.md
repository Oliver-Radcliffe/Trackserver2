# Trackserver2

Modern GPS Tracking Server for Pico Beacon and ciNet-compatible devices.

## Overview

Trackserver2 is a Python-based GPS tracking server that:
- Receives position data from Pico Beacon devices using the ciNet protocol
- Provides a REST API for device management and position queries
- Offers real-time updates via WebSocket
- Includes a web dashboard for tracking visualization

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRACKSERVER2                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Protocol   │    │   REST API   │    │  WebSocket   │          │
│  │   Server     │    │   Server     │    │   Server     │          │
│  │  (TCP 4509)  │    │  (HTTP 8080) │    │  (WS /ws)    │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                        │
│                    ┌────────┴────────┐                              │
│                    │   PostgreSQL/   │                              │
│                    │     SQLite      │                              │
│                    └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Development Setup

1. Install dependencies:
```bash
cd Trackserver2
pip install -r requirements.txt
```

2. Initialize the database with test data:
```bash
python tools/init_db.py
```

3. Run the server:
```bash
python -m trackserver2.main
```

4. (Optional) Test with the beacon simulator:
```bash
python tools/beacon_simulator.py --host localhost --port 4509
```

### Docker Setup

```bash
docker-compose up -d
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./trackserver2.db` | Database connection URL |
| `CINET_HOST` | `0.0.0.0` | Protocol server bind address |
| `CINET_PORT` | `4509` | Protocol server port |
| `API_HOST` | `0.0.0.0` | API server bind address |
| `API_PORT` | `8080` | API server port |
| `JWT_SECRET` | (dev key) | Secret key for JWT tokens |
| `LOG_LEVEL` | `INFO` | Logging level |

## API Endpoints

Base URL: `http://localhost:8080/v1`

### Authentication
- `POST /auth/login` - Login, returns JWT token
- `GET /users/me` - Get current user

### Devices
- `GET /devices` - List all devices
- `GET /devices/{id}` - Get device details
- `POST /devices` - Register new device
- `PUT /devices/{id}` - Update device
- `DELETE /devices/{id}` - Delete device
- `GET /devices/{id}/position` - Get latest position
- `GET /devices/{id}/positions` - Get position history

### WebSocket
Connect to `ws://localhost:8080/ws` for real-time updates.

Subscribe to device updates:
```json
{"type": "subscribe", "device_ids": [1, 2, 3]}
```

## Test Credentials

After running `init_db.py`:
- Email: `admin@test.local`
- Password: `admin123`

Test device:
- Key: `0x06EA83A3` (06.EA.83.A3)
- Serial: `SIM00000001`
- Passphrase: `fredfred`

## License

MIT
