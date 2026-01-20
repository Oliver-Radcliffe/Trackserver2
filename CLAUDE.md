# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Repository Overview

Trackserver2 is a Python GPS tracking server for Pico Beacon devices using the ciNet protocol.

## Project Structure

```
Trackserver2/
├── trackserver2/           # Main Python package
│   ├── api/               # FastAPI REST API
│   │   └── main.py       # API endpoints and authentication
│   ├── models/            # SQLAlchemy database models
│   │   ├── database.py   # Database connection/session
│   │   └── models.py     # ORM models (Device, Position, etc.)
│   ├── protocol/          # ciNet protocol implementation
│   │   ├── blowfish.py   # Blowfish encryption
│   │   ├── crc.py        # CRC16 validation
│   │   ├── message_parser.py  # Message parsing
│   │   └── server.py     # TCP protocol server
│   ├── websocket/         # Real-time WebSocket server
│   ├── config.py          # Configuration management
│   └── main.py           # Application entry point
├── tools/                 # Development tools
│   ├── beacon_simulator.py  # Simulate beacon messages
│   └── init_db.py        # Initialize test database
├── dashboard/             # React web dashboard (TODO)
├── 20-TrackServer/        # Legacy .NET code (reference only)
├── requirements.txt
├── pyproject.toml
├── Dockerfile
└── docker-compose.yml
```

## Common Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database with test data
python tools/init_db.py

# Run the server
python -m trackserver2.main

# Run beacon simulator
python tools/beacon_simulator.py --host localhost --port 4509

# Run with Docker
docker-compose up -d
```

## Key Concepts

### ciNet Protocol
- 149-byte binary messages over TCP port 4509
- Header (51 bytes) + Encrypted payload (96 bytes) + CRC (2 bytes)
- Blowfish ECB encryption with PBKDF2-derived key
- Device identified by 4-byte device_key

### Authentication
- JWT tokens for API authentication
- Passphrase per device for ciNet decryption

### Database
- SQLite for development, PostgreSQL for production
- Async SQLAlchemy 2.0 with aiosqlite/asyncpg

## Development Notes

- The protocol implementation is compatible with the Pico Beacon firmware in `../Pi Pico/pico_beacon/`
- Legacy TrackServer code in `20-TrackServer/` is for reference only (ASP.NET/SQL Server)
- Web dashboard using React/Leaflet is planned but not yet implemented

## Test Credentials

- User: admin@test.local / admin123
- Device key: 0x06EA83A3
- Passphrase: fredfred
