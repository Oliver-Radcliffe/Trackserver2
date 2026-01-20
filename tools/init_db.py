#!/usr/bin/env python3
"""
Initialize Trackserver2 database with test data.
"""

import asyncio
import sys

sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from passlib.context import CryptContext

from trackserver2.models.database import init_db, AsyncSessionLocal
from trackserver2.models.models import Account, Device, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_test_data():
    """Create test account, user, and device."""
    await init_db()

    async with AsyncSessionLocal() as session:
        # Check if test account exists
        from sqlalchemy import select
        result = await session.execute(select(Account).where(Account.name == "Test Account"))
        account = result.scalar_one_or_none()

        if not account:
            # Create test account
            account = Account(name="Test Account", enabled=True)
            session.add(account)
            await session.flush()  # Get account ID
            print(f"Created account: {account.name} (ID: {account.id})")

            # Create test user
            user = User(
                account_id=account.id,
                email="admin@test.local",
                password_hash=pwd_context.hash("admin123"),
                name="Admin User",
                role="admin",
                enabled=True,
            )
            session.add(user)
            print(f"Created user: {user.email} (password: admin123)")

            # Create test device
            device = Device(
                account_id=account.id,
                device_key=0x06EA83A3,  # 06.EA.83.A3
                serial_number="SIM00000001",
                name="Test Beacon",
                passphrase="fredfred",
                device_type="PicoBeacon",
                enabled=True,
            )
            session.add(device)
            print(f"Created device: {device.serial_number} (key: 0x{device.device_key:08X})")

            await session.commit()
            print("\nTest data created successfully!")
        else:
            print("Test data already exists.")

        # Show existing data
        print("\n=== Existing Data ===")

        result = await session.execute(select(Account))
        accounts = result.scalars().all()
        print(f"\nAccounts ({len(accounts)}):")
        for a in accounts:
            print(f"  - {a.name} (ID: {a.id})")

        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f"\nUsers ({len(users)}):")
        for u in users:
            print(f"  - {u.email} ({u.role})")

        result = await session.execute(select(Device))
        devices = result.scalars().all()
        print(f"\nDevices ({len(devices)}):")
        for d in devices:
            print(f"  - {d.serial_number} (key: 0x{d.device_key:08X}, passphrase: {d.passphrase})")


if __name__ == "__main__":
    asyncio.run(create_test_data())
