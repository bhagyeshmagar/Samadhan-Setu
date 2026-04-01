from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from ..models.user import UserRole

class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: Optional[UserRole] = UserRole.CITIZEN
    department_id: Optional[str] = None

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
