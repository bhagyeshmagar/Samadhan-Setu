"""
Authentication Router — PostgreSQL edition.
Handles user registration, login, and profile management.
"""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session
from ..auth import (
    hash_password_async,
    verify_password_async,
    create_access_token,
    get_current_user,
    get_current_user_optional,
    revoke_token,
    extract_token_from_request,
    settings,
)
from ..services.rate_limiter import limit_login_attempts
from ..models.orm import User, AuditLog
from ..models.orm.enums import UserRole
from ..repositories.user_repo import UserRepository
from ..schemas import UserCreate, UserUpdate, UserResponse, UserWithToken, UserLogin

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,
        created_at=user.created_at,
    )


@router.post("/register", response_model=UserWithToken, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    user_data: UserCreate,
    session: AsyncSession = Depends(get_async_session),
):
    """Register a new citizen account. Role is always CITIZEN — elevation requires admin."""
    repo = UserRepository(session)

    # M-18 FIX: Sanitize empty phone string to None to avoid unique index violation on empty strings
    clean_phone = user_data.phone.strip() if user_data.phone and user_data.phone.strip() else None

    # Uniqueness check
    if await repo.get_by_email(user_data.email):
        raise HTTPException(status_code=409, detail="Registration failed. An account with these details already exists.")
    if clean_phone and await repo.get_by_phone(clean_phone):
        raise HTTPException(status_code=409, detail="Registration failed. An account with these details already exists.")

    # BUG-11 FIX: use async wrapper so argon2 hashing runs in the thread-pool
    # and never blocks the FastAPI async event loop.
    hashed_password = await hash_password_async(user_data.password)
    try:
        user = await repo.create(
            email=user_data.email,
            name=user_data.name,
            password_hash=hashed_password,
            role=UserRole.CITIZEN,   # Always CITIZEN — never trust client-supplied role
            phone=clean_phone,
        )
        # M-01 FIX: Audit log citizen registration with client IP
        client_ip = request.client.host if request.client else None
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        session.add(
            AuditLog(
                action="user_register",
                entity_type="user",
                entity_id=str(user.id),
                actor_id=user.id,
                actor_role=user.role.value,
                ip_address=client_ip,
                details={"email": user.email, "name": user.name},
            )
        )
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration failed. An account with these details already exists.",
        )

    token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return UserWithToken(user=_user_to_response(user), access_token=token, token_type="bearer")


@router.post("/login", response_model=UserWithToken)
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_async_session),
):
    """Login via OAuth2 form (username = email)."""
    limit_login_attempts(request, form_data.username)

    repo = UserRepository(session)
    user = await repo.get_by_email(form_data.username)

    # BUG-11 / H13 FIX: Non-blocking async verification with constant-time dummy hash comparison
    password_matches = await verify_password_async(
        form_data.password,
        user.password_hash if user else None,
    )
    if not user or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact support.")

    await repo.update_last_login(user.id)

    # M-01 FIX: Audit log user login with client IP
    client_ip = request.client.host if request.client else None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    session.add(
        AuditLog(
            action="user_login",
            entity_type="user",
            entity_id=str(user.id),
            actor_id=user.id,
            actor_role=user.role.value,
            ip_address=client_ip,
            details={"email": user.email, "method": "oauth2"},
        )
    )
    await session.commit()

    token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    is_prod = settings.ENVIRONMENT.lower() in ("production", "prod")
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return UserWithToken(user=_user_to_response(user), access_token=token, token_type="bearer")


@router.post("/login/json", response_model=UserWithToken)
async def login_json(
    request: Request,
    response: Response,
    login_data: UserLogin,
    session: AsyncSession = Depends(get_async_session),
):
    """Login via JSON body (frontend convenience endpoint)."""
    limit_login_attempts(request, login_data.email)

    repo = UserRepository(session)
    user = await repo.get_by_email(login_data.email)

    # BUG-11 / H13 FIX: Non-blocking async verification with constant-time dummy hash comparison
    password_matches = await verify_password_async(
        login_data.password,
        user.password_hash if user else None,
    )
    if not user or not password_matches:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact support.")

    await repo.update_last_login(user.id)

    # M-01 FIX: Audit log JSON login with client IP
    client_ip = request.client.host if request.client else None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    session.add(
        AuditLog(
            action="user_login",
            entity_type="user",
            entity_id=str(user.id),
            actor_id=user.id,
            actor_role=user.role.value,
            ip_address=client_ip,
            details={"email": user.email, "method": "json"},
        )
    )
    await session.commit()

    token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    is_prod = settings.ENVIRONMENT.lower() in ("production", "prod")
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return UserWithToken(user=_user_to_response(user), access_token=token, token_type="bearer")


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Revoke JWT access token and clear authentication cookie (H-07 fix)."""
    token = extract_token_from_request(request)
    if token:
        revoke_token(token)
    response.delete_cookie("access_token")
    return {"message": "Logged out successfully", "revoked": bool(token)}


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get the authenticated user's own profile."""
    return _user_to_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Update own profile — only name and phone. Role changes require admin."""
    if update_data.name is not None:
        name = update_data.name.strip()
        if not name or len(name) > 200:
            raise HTTPException(status_code=422, detail="Name must be 1–200 characters")
        current_user.name = name

    if update_data.phone is not None:
        phone = update_data.phone.strip()
        if phone and (not phone.lstrip("+").isdigit() or len(phone) > 15):
            raise HTTPException(status_code=422, detail="Invalid phone number")
        current_user.phone = phone or None

    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return _user_to_response(current_user)
