"""Configuration for Trackserver2."""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Config:
    """Application configuration."""

    # Database
    database_url: str = field(
        default_factory=lambda: os.environ.get(
            "DATABASE_URL",
            "sqlite+aiosqlite:///./trackserver2.db"
        )
    )

    # Protocol Server
    cinet_host: str = field(
        default_factory=lambda: os.environ.get("CINET_HOST", "0.0.0.0")
    )
    cinet_port: int = field(
        default_factory=lambda: int(os.environ.get("CINET_PORT", "4509"))
    )

    # API Server
    api_host: str = field(
        default_factory=lambda: os.environ.get("API_HOST", "0.0.0.0")
    )
    api_port: int = field(
        default_factory=lambda: int(os.environ.get("API_PORT", "8080"))
    )

    # WebSocket
    ws_port: int = field(
        default_factory=lambda: int(os.environ.get("WS_PORT", "8081"))
    )

    # JWT
    jwt_secret: str = field(
        default_factory=lambda: os.environ.get(
            "JWT_SECRET",
            "development-secret-key-change-in-production"
        )
    )
    jwt_expiry: int = field(
        default_factory=lambda: int(os.environ.get("JWT_EXPIRY", "3600"))
    )

    # Redis (optional)
    redis_url: Optional[str] = field(
        default_factory=lambda: os.environ.get("REDIS_URL")
    )

    # Debug
    debug: bool = field(
        default_factory=lambda: os.environ.get("DEBUG", "").lower() == "true"
    )

    # Logging
    log_level: str = field(
        default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO")
    )


# Global config instance
config = Config()
