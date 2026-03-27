from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class DepartmentBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

class DepartmentCreate(DepartmentBase):
    keywords: Optional[List[str]] = []

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

class DepartmentResponse(DepartmentBase):
    id: int
    keywords: Optional[List[str]] = []
    created_at: datetime
    
    class Config:
        from_attributes = True

class CategoryMappingBase(BaseModel):
    category: str
    department_id: int
    priority_boost: Optional[int] = 0

class CategoryMappingCreate(CategoryMappingBase):
    pass

class CategoryMappingResponse(CategoryMappingBase):
    id: int
    
    class Config:
        from_attributes = True

class SLARuleBase(BaseModel):
    category: Optional[str] = None
    priority: Optional[str] = None
    resolution_hours: int = 72
    escalation_hours: Optional[int] = None

class SLARuleCreate(SLARuleBase):
    pass

class SLARuleResponse(SLARuleBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
