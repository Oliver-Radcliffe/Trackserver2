"""FastAPI application for Trackserver2 REST API."""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db, init_db
from ..models.models import Account, Device, Position, User, Geofence, Command

# JWT Configuration
SECRET_KEY = os.environ.get("JWT_SECRET", "development-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="v1/auth/login")


# Pydantic models for API
class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int


class TokenData(BaseModel):
    email: Optional[str] = None


class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    role: str
    enabled: bool

    class Config:
        from_attributes = True


class DeviceCreate(BaseModel):
    device_key: int
    serial_number: str
    name: Optional[str] = None
    passphrase: str
    device_type: str = "Millitag"


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    passphrase: Optional[str] = None
    enabled: Optional[bool] = None


class DeviceResponse(BaseModel):
    id: int
    device_key: int
    serial_number: str
    name: Optional[str]
    device_type: str
    enabled: bool
    last_seen_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PositionResponse(BaseModel):
    id: int
    device_id: int
    timestamp: datetime
    latitude: float
    longitude: float
    altitude: Optional[int] = None
    speed: Optional[float] = None
    heading: Optional[int] = None
    satellites: Optional[int] = None
    hdop: Optional[float] = None
    battery: Optional[int] = None
    is_moving: Optional[bool] = None

    # New optional fields
    temperature: Optional[int] = None
    gsm_signal: Optional[int] = None
    mcc: Optional[int] = None
    mnc: Optional[int] = None
    network_type: Optional[str] = None
    gps_valid: Optional[bool] = None
    gps_accuracy: Optional[str] = None
    input_state: Optional[str] = None
    output_state: Optional[str] = None
    message_type: Optional[str] = None
    geozone: Optional[int] = None
    alerts: Optional[int] = None
    firmware_version: Optional[str] = None

    class Config:
        from_attributes = True


class PositionListResponse(BaseModel):
    device_id: int
    positions: list[PositionResponse]
    total: int
    has_more: bool


class GeofenceCreate(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius: int
    alert_on_enter: bool = True
    alert_on_exit: bool = True


class GeofenceResponse(BaseModel):
    id: int
    device_id: int
    name: str
    latitude: float
    longitude: float
    radius: int
    alert_on_enter: bool
    alert_on_exit: bool
    enabled: bool

    class Config:
        from_attributes = True


class CommandCreate(BaseModel):
    command_type: str
    command_data: Optional[dict] = None


class CommandResponse(BaseModel):
    id: int
    device_id: int
    command_type: str
    command_data: Optional[dict]
    status: str
    created_at: datetime
    sent_at: Optional[datetime]
    acknowledged_at: Optional[datetime]

    class Config:
        from_attributes = True


# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_db()
    yield
    # Shutdown


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    application = FastAPI(
        title="Trackserver2 API",
        description="GPS Tracking Server for Pico Beacon devices",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return application


app = create_app()


# Authentication endpoints
@app.post("/v1/auth/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Login and get access token."""
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@app.get("/v1/users/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return current_user


# Device endpoints
@app.get("/v1/devices", response_model=list[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all devices."""
    result = await db.execute(select(Device).order_by(Device.name))
    devices = result.scalars().all()
    return devices


@app.get("/v1/devices/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get device by ID."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@app.post("/v1/devices", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    device: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Register a new device."""
    # Check if device key already exists
    result = await db.execute(select(Device).where(Device.device_key == device.device_key))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Device key already registered")

    new_device = Device(
        device_key=device.device_key,
        serial_number=device.serial_number,
        name=device.name,
        passphrase=device.passphrase,
        device_type=device.device_type,
        account_id=current_user.account_id,
    )
    db.add(new_device)
    await db.commit()
    await db.refresh(new_device)
    return new_device


@app.put("/v1/devices/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: int,
    device_update: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update device."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if device_update.name is not None:
        device.name = device_update.name
    if device_update.passphrase is not None:
        device.passphrase = device_update.passphrase
    if device_update.enabled is not None:
        device.enabled = device_update.enabled

    await db.commit()
    await db.refresh(device)
    return device


@app.delete("/v1/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete device."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    await db.delete(device)
    await db.commit()


# Position endpoints
@app.get("/v1/devices/{device_id}/position", response_model=PositionResponse)
async def get_latest_position(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get latest position for device."""
    result = await db.execute(
        select(Position)
        .where(Position.device_id == device_id)
        .order_by(desc(Position.timestamp))
        .limit(1)
    )
    position = result.scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=404, detail="No positions found for device")
    return position


@app.get("/v1/devices/{device_id}/positions", response_model=PositionListResponse)
async def get_device_positions(
    device_id: int,
    from_time: Optional[datetime] = Query(None, alias="from"),
    to_time: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(1000, le=10000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get position history for device."""
    query = select(Position).where(Position.device_id == device_id)

    if from_time:
        query = query.where(Position.timestamp >= from_time)
    if to_time:
        query = query.where(Position.timestamp <= to_time)

    query = query.order_by(desc(Position.timestamp)).offset(offset).limit(limit + 1)

    result = await db.execute(query)
    positions = list(result.scalars().all())

    has_more = len(positions) > limit
    if has_more:
        positions = positions[:limit]

    return PositionListResponse(
        device_id=device_id,
        positions=positions,
        total=len(positions),
        has_more=has_more
    )


# Geofence endpoints
@app.get("/v1/devices/{device_id}/geofences", response_model=list[GeofenceResponse])
async def list_geofences(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List geofences for device."""
    result = await db.execute(
        select(Geofence).where(Geofence.device_id == device_id)
    )
    return result.scalars().all()


@app.post("/v1/devices/{device_id}/geofences", response_model=GeofenceResponse, status_code=status.HTTP_201_CREATED)
async def create_geofence(
    device_id: int,
    geofence: GeofenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create geofence for device."""
    # Verify device exists
    result = await db.execute(select(Device).where(Device.id == device_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    new_geofence = Geofence(
        device_id=device_id,
        name=geofence.name,
        latitude=geofence.latitude,
        longitude=geofence.longitude,
        radius=geofence.radius,
        alert_on_enter=geofence.alert_on_enter,
        alert_on_exit=geofence.alert_on_exit,
    )
    db.add(new_geofence)
    await db.commit()
    await db.refresh(new_geofence)
    return new_geofence


@app.delete("/v1/geofences/{geofence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_geofence(
    geofence_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete geofence."""
    result = await db.execute(select(Geofence).where(Geofence.id == geofence_id))
    geofence = result.scalar_one_or_none()
    if not geofence:
        raise HTTPException(status_code=404, detail="Geofence not found")

    await db.delete(geofence)
    await db.commit()


# Command endpoints
@app.get("/v1/devices/{device_id}/commands", response_model=list[CommandResponse])
async def list_commands(
    device_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List commands for device."""
    query = select(Command).where(Command.device_id == device_id)
    if status_filter:
        query = query.where(Command.status == status_filter)
    query = query.order_by(desc(Command.created_at))

    result = await db.execute(query)
    return result.scalars().all()


@app.post("/v1/devices/{device_id}/commands", response_model=CommandResponse, status_code=status.HTTP_201_CREATED)
async def create_command(
    device_id: int,
    command: CommandCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send command to device."""
    # Verify device exists
    result = await db.execute(select(Device).where(Device.id == device_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    new_command = Command(
        device_id=device_id,
        command_type=command.command_type,
        command_data=command.command_data,
    )
    db.add(new_command)
    await db.commit()
    await db.refresh(new_command)
    return new_command


# Dates with data endpoint
@app.get("/v1/devices/{device_id}/dates-with-data")
async def get_dates_with_data(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of dates that have position data for a device."""
    from sqlalchemy import func, cast, Date

    # Query distinct dates that have positions
    result = await db.execute(
        select(func.date(Position.timestamp).label('date'))
        .where(Position.device_id == device_id)
        .group_by(func.date(Position.timestamp))
        .order_by(func.date(Position.timestamp))
    )

    dates = [row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date) for row in result]

    return {"device_id": device_id, "dates": dates}


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "trackserver2"}
