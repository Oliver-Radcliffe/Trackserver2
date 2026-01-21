"""Configuration for Trackserver2."""

import os
import secrets
from dataclasses import dataclass, field
from typing import List, Optional

# ── Ensure data directory exists (runs at module import) ────────────────────────
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

DEFAULT_DB_PATH = os.path.join(DATA_DIR, "trackserver2.db")


@dataclass
class Config:
    """Application configuration for Trackserver2."""

    # ── Database ────────────────────────────────────────────────────────────────
    database_url: str = field(
        default_factory=lambda: os.environ.get(
            "DATABASE_URL",
            f"sqlite+aiosqlite:///{DEFAULT_DB_PATH}"
        )
    )

    # ── Protocol Server (CINET) ─────────────────────────────────────────────────
    cinet_host: str = field(
        default_factory=lambda: os.environ.get("CINET_HOST", "0.0.0.0")
    )
    cinet_port: int = field(
        default_factory=lambda: int(os.environ.get("CINET_PORT", "4509"))
    )

    # ── API Server (HTTP) ───────────────────────────────────────────────────────
    api_host: str = field(
        default_factory=lambda: os.environ.get("API_HOST", "0.0.0.0")
    )
    api_port: int = field(
        default_factory=lambda: int(os.environ.get("API_PORT", "8080"))
    )

    # ── WebSocket Server ────────────────────────────────────────────────────────
    ws_host: str = field(
        default_factory=lambda: os.environ.get("WS_HOST", "0.0.0.0")
    )
    ws_port: int = field(
        default_factory=lambda: int(os.environ.get("WS_PORT", "8081"))
    )

    # ── Security / Auth ─────────────────────────────────────────────────────────
    jwt_secret: str = field(
        default_factory=lambda: os.environ.get("JWT_SECRET")
        or secrets.token_urlsafe(48)   # strong random fallback — never commit this!
    )
    jwt_expiry_seconds: int = field(
        default_factory=lambda: int(os.environ.get("JWT_EXPIRY_SECONDS", "3600"))
    )

    # ── Redis (optional — caching, sessions, queues…) ──────────────────────────
    redis_url: Optional[str] = field(
        default_factory=lambda: os.environ.get("REDIS_URL")
    )

    # ── CORS (very commonly needed) ─────────────────────────────────────────────
    allowed_origins: List[str] = field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
            if origin.strip()
        ]
    )

    # ── Operational / Debugging ─────────────────────────────────────────────────
    environment: str = field(
        default_factory=lambda: os.environ.get("ENVIRONMENT", "development").lower()
    )
    debug: bool = field(
        default_factory=lambda: os.environ.get("DEBUG", "false").lower() in {"true", "1", "yes", "on"}
    )
    log_level: str = field(
        default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO").upper()
    )

    # Optional — add later if needed
    # sentry_dsn: Optional[str] = field(default_factory=lambda: os.environ.get("SENTRY_DSN"))


# Global singleton instance
config = Config()


# Optional helper — useful in startup logs (never log the real secret!)
def get_safe_config_summary() -> dict:
    data = config.__dict__.copy()
    if "jwt_secret" in data:
        data["jwt_secret"] = "**** (hidden)"
    return data
