from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..models.complaint import ComplaintStatus, ComplaintPriority

class ComplaintBase(BaseModel):
    description: str
    location: str
    ward: Optional[str] = None
    is_public: Optional[bool] = True
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ComplaintCreate(ComplaintBase):
    """Schema for creating a new complaint - category, priority are AI-assigned"""
    pass

class ComplaintUpdate(BaseModel):
    """Schema for updating complaint (admin/officer)"""
    status: Optional[ComplaintStatus] = None
    remarks: Optional[str] = None
    assigned_officer_id: Optional[int] = None

class ComplaintAIResponse(BaseModel):
    """AI classification response"""
    category: str
    priority: ComplaintPriority
    urgency_score: int
    confidence: int
    department_id: Optional[int] = None

class StatusLogResponse(BaseModel):
    id: int
    status: ComplaintStatus
    remarks: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserBasicResponse(BaseModel):
    """Basic user info for complaint response"""
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    
    class Config:
        from_attributes = True

class ComplaintResponse(ComplaintBase):
    id: int
    user_id: int
    category: str
    priority: ComplaintPriority
    urgency_score: int
    ai_confidence: Optional[int] = None
    status: ComplaintStatus
    department_id: Optional[int]
    upvotes: int
    attachments: Optional[List] = None
    resolution_proof: Optional[List] = None
    resolution_remarks: Optional[str] = None
    resolution_upvotes: Optional[int] = 0
    resolution_downvotes: Optional[int] = 0
    needs_reconsideration: Optional[bool] = False
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    deadline: Optional[datetime] = None  # SLA deadline
    status_logs: Optional[List[StatusLogResponse]] = []
    user: Optional[UserBasicResponse] = None  # Citizen details
    
    class Config:
        from_attributes = True

class ComplaintListResponse(BaseModel):
    complaints: List[ComplaintResponse]
    total: int
    page: int
    per_page: int

class ComplaintStats(BaseModel):
    """Statistics for dashboard"""
    total: int
    pending: int
    in_progress: int
    resolved: int
    rejected: int
    by_category: dict
    by_priority: dict
