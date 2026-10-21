from pydantic import BaseModel, EmailStr
from typing import Optional, List
import uuid
from datetime import datetime
from ..models.orm.enums import UserRole

class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: Optional[UserRole] = UserRole.CITIZEN
    department_id: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: str
    role: UserRole
    department_id: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserWithToken(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[str] = None


# ── Officer schemas ──────────────────────────────────────────────────────────

class OfficerCreate(BaseModel):
    """Schema for creating a new officer account from the admin dashboard.
    Creates both the User record and Officer profile in one call.
    """
    email: EmailStr
    name: str
    password: str
    phone: Optional[str] = None
    department_id: str       # UUID string of the target department
    employee_id: str         # Unique employee / badge ID
    designation: Optional[str] = None
    jurisdiction_wards: Optional[List[str]] = None


class OfficerResponse(BaseModel):
    """Officer profile enriched with user details."""
    id: str                  # officer.id
    user_id: str
    email: str
    name: str
    phone: Optional[str] = None
    department_id: str
    department_name: Optional[str] = None
    employee_id: str
    designation: Optional[str] = None
    is_active: bool
    total_resolved: int = 0
    avg_resolution_hours: float = 0.0
    rating: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True
