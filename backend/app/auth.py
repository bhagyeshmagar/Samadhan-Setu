"""
auth.py — JWT authentication utilities for Samadhan Setu.
Uses PostgreSQL via UserRepository (no Firestore).
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

import jwt as pyjwt
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db.session import get_async_session
from .models.orm import User
from .models.orm.enums import UserRole
from .repositories.user_repo import UserRepository

# Password hashing — argon2 for modern, reliable hashing
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$dGVzdF9kdW1teV9zYWx0$dGVzdF9kdW1teV9oYXNoX3ZhbHVlX2Zvcl90aW1pbmc"


async def verify_password_async(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Non-blocking Argon2 password verification via asyncio.to_thread.
    If hashed_password is None, verifies against a dummy hash to prevent timing attacks (BUG-11, H13).
    """
    target_hash = hashed_password or DUMMY_HASH
    try:
        is_valid = await asyncio.to_thread(pwd_context.verify, plain_password, target_hash)
    except Exception:
        is_valid = False
    return is_valid and (hashed_password is not None)


def get_password_hash(password: str) -> str:
    """Hash a password using argon2.

    NOTE: Argon2 is intentionally CPU/memory-intensive and will block the
    event loop if called directly from an async context.  Always call this
    function via ``asyncio.to_thread`` from async endpoints (BUG-11 fix).
    """
    return pwd_context.hash(password)


async def hash_password_async(password: str) -> str:
    """BUG-11 FIX: Non-blocking wrapper for get_password_hash.

    Runs argon2 hashing in the default executor (thread-pool) so the
    FastAPI async event loop is never blocked during registration or
    password-change operations.
    """
    return await asyncio.to_thread(pwd_context.hash, password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token using PyJWT (H12: replaces python-jose)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return pyjwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token using PyJWT. Returns None on any error."""
    try:
        return pyjwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError:
        return None


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_async_session),
) -> User:
    """Resolve the JWT token to the authenticated User row."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise credentials_exception

    try:
        user_id = uuid.UUID(str(user_id_raw))
    except (ValueError, AttributeError):
        raise credentials_exception

    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)

    if user is None or not user.is_active:
        raise credentials_exception

    if user.role in (UserRole.OFFICER, UserRole.SUPERVISOR):
        officer = await repo.get_officer_by_user_id(user.id)
        if officer is None or not officer.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Officer account or profile is deactivated",
            )

    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    session: AsyncSession = Depends(get_async_session),
) -> Optional[User]:
    """Resolve the JWT token to the authenticated User row, or None if unauthenticated."""
    if not token:
        return None

    payload = decode_token(token)
    if payload is None:
        return None

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        return None

    try:
        user_id = uuid.UUID(str(user_id_raw))
    except (ValueError, AttributeError):
        return None

    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)
    if user is None or not user.is_active:
        return None

    if user.role in (UserRole.OFFICER, UserRole.SUPERVISOR):
        officer = await repo.get_officer_by_user_id(user.id)
        if officer is None or not officer.is_active:
            return None

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is active (used as an alias dependency)."""
    return current_user


def require_role(*roles: UserRole):
    """Dependency factory for role-based access control."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted for role: {current_user.role}",
            )
        return current_user
    return role_checker


# Convenience role-guard dependencies
require_citizen = require_role(UserRole.CITIZEN)
require_officer = require_role(UserRole.OFFICER, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
require_officer_or_admin = require_officer
require_supervisor = require_role(UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
require_admin = require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)
