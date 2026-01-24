"""Database configuration for Trackserver2."""

import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base


def get_database_url() -> str:
    """Get database URL with proper async driver prefix.

    Handles Render's postgres:// URLs by converting to postgresql+asyncpg://
    """
    url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./trackserver2.db")

    # Render provides postgres:// but SQLAlchemy needs postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    # Handle postgresql:// without async driver
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return url


# Database URL from environment or default to SQLite for development
DATABASE_URL = get_database_url()

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.environ.get("DEBUG", "").lower() == "true",
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for models
Base = declarative_base()


async def init_db():
    """Initialize database, creating tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def seed_default_admin():
    """Create a default admin user if the database is empty.

    Must be called after init_db() and after models are imported.
    """
    from passlib.context import CryptContext
    from sqlalchemy import select, func, text

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async with AsyncSessionLocal() as session:
        # Check if any users exist using raw SQL to avoid circular import
        result = await session.execute(text("SELECT COUNT(*) FROM users"))
        user_count = result.scalar()

        if user_count == 0:
            # Create default account
            await session.execute(
                text("INSERT INTO accounts (name, enabled) VALUES (:name, :enabled)"),
                {"name": "Default Account", "enabled": True}
            )

            # Get the account id
            result = await session.execute(text("SELECT id FROM accounts WHERE name = 'Default Account'"))
            account_id = result.scalar()

            # Create admin user
            password_hash = pwd_context.hash("admin123")
            await session.execute(
                text("""INSERT INTO users (account_id, email, password_hash, name, role, enabled)
                        VALUES (:account_id, :email, :password_hash, :name, :role, :enabled)"""),
                {
                    "account_id": account_id,
                    "email": "admin@trackserver.local",
                    "password_hash": password_hash,
                    "name": "Admin",
                    "role": "admin",
                    "enabled": True
                }
            )
            await session.commit()
            print("Created default admin user: admin@trackserver.local / admin123")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
