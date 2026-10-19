"""
Authentication Router for Samadhan Setu
Handles user registration, login, and profile management
"""
from datetime import datetime, timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from ..database import get_db
from ..auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, settings
)
from ..models import User, UserRole
from ..schemas import (
    UserCreate, UserResponse, UserWithToken, Token, UserLogin
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserWithToken, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Any = Depends(get_db)):
    """
    Register a new user
    """
    # Check if email already exists
    existing_users = db.collection('users').where('email', '==', user_data.email).limit(1).get()
    if existing_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Always create as citizen — role elevation requires a protected admin workflow
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        name=user_data.name,
        phone=user_data.phone,
        role=UserRole.CITIZEN,       # Hardcoded — never trust client-supplied role
        department_id=None           # Never trust client-supplied department
    )

    # Add to Firestore
    doc_ref = db.collection('users').document()
    new_user.id = doc_ref.id
    doc_ref.set(new_user.to_firestore())

    # Create access token
    access_token = create_access_token(
        data={"sub": str(new_user.id), "role": new_user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return UserWithToken(
        user=UserResponse.model_validate(new_user),
        access_token=access_token,
        token_type="bearer"
    )


@router.post("/login", response_model=UserWithToken)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Any = Depends(get_db)):
    """
    Login with email and password (OAuth2 compatible)
    """
    users = db.collection('users').where('email', '==', form_data.username).limit(1).get()
    
    if not users:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user = User.from_firestore(users[0])

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if hasattr(user, 'is_active') and user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return UserWithToken(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        token_type="bearer"
    )


@router.post("/login/json", response_model=UserWithToken)
async def login_json(login_data: UserLogin, db: Any = Depends(get_db)):
    """
    Login with JSON body (for frontend convenience)
    """
    users = db.collection('users').where('email', '==', login_data.email).limit(1).get()
    
    if not users:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
        
    user = User.from_firestore(users[0])

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if hasattr(user, 'is_active') and user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return UserWithToken(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        token_type="bearer"
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Get the current authenticated user's profile
    """
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_profile(
    name: str = None,
    phone: str = None,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Update current user's own profile (name and phone only).
    Role and department changes require an admin workflow.
    """
    updates = {}
    if name is not None:
        name = name.strip()
        if not name or len(name) > 200:
            raise HTTPException(status_code=422, detail="Name must be 1-200 characters")
        current_user.name = name
        updates["name"] = name
    if phone is not None:
        phone = phone.strip()
        if phone and (not phone.lstrip("+").isdigit() or len(phone) > 15):
            raise HTTPException(status_code=422, detail="Invalid phone number")
        current_user.phone = phone
        updates["phone"] = phone

    if updates:
        updates["updated_at"] = datetime.utcnow()
        current_user.updated_at = updates["updated_at"]
        db.collection('users').document(current_user.id).update(updates)

    return UserResponse.model_validate(current_user)
