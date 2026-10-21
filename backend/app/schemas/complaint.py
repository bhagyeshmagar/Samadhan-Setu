from pydantic import BaseModel, field_validator
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime
from ..models.orm.enums import ComplaintStatus, ComplaintPriority


class ComplaintBase(BaseModel):
    title: str
    description: str
    location: str
    ward: Optional[str] = None
    is_public: Optional[bool] = True
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ComplaintCreate(ComplaintBase):
    """Schema for creating a new complaint. Category and priority are system-assigned."""
    category: Optional[str] = None  # optional: AI will detect if not provided


class ComplaintUpdate(BaseModel):
    """Schema for updating a complaint (officer/admin)."""
    status: Optional[str] = None
    remarks: Optional[str] = None
    notes: Optional[str] = None
    assigned_officer_id: Optional[str] = None


class ComplaintFeedback(BaseModel):
    """Schema for a citizen submitting feedback on a resolved complaint."""
    rating: int  # 1-5 stars
    feedback_text: Optional[str] = None


class ComplaintAIResponse(BaseModel):
    """AI classification preview response."""
    category: str
    priority: str
    priority_score: float
    urgency_score: int
    confidence: int
    department_id: Optional[str] = None

    class Config:
        from_attributes = True


class StatusLogResponse(BaseModel):
    id: Optional[str] = None
    complaint_id: Optional[str] = None
    from_status: Optional[str] = None
    to_status: str
    remarks: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ComplaintResponse(BaseModel):
    id: str
    user_id: str
    title: str
    category: str
    subcategory: Optional[str] = None
    description: str
    location: str
    ward: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_public: Optional[bool] = True

    priority: ComplaintPriority
    priority_score: Optional[float] = 0.0
    urgency_score: Optional[int] = 0
    ai_confidence: Optional[int] = None
    status: ComplaintStatus
    department_id: Optional[str] = None
    assigned_officer_id: Optional[str] = None

    upvotes: Optional[int] = 0
    attachments: Optional[List] = None
    resolution_proof: Optional[List] = None
    resolution_remarks: Optional[str] = None
    citizen_rating: Optional[int] = None
    feedback_text: Optional[str] = None

    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    deadline: Optional[datetime] = None

    # Populated on detail view
    user: Optional[Dict[str, Any]] = None
    status_logs: Optional[List[StatusLogResponse]] = []
    status_history: Optional[List[StatusLogResponse]] = []
    tasks: Optional[List[Dict[str, Any]]] = []

    class Config:
        from_attributes = True


class ComplaintListResponse(BaseModel):
    complaints: List[ComplaintResponse]
    total: int
    page: int
    per_page: int


class ComplaintStats(BaseModel):
    """Statistics for admin dashboard."""
    total: int
    submitted: int = 0
    verified: int = 0
    assigned: int = 0
    in_progress: int = 0
    resolved: int = 0
    closed: int = 0
    reopened: int = 0
    appealed: int = 0
    by_category: dict
    by_priority: dict


class TaskResponse(BaseModel):
    id: str
    complaint_id: str
    department_id: str
    department_name: Optional[str] = None
    assigned_officer_id: Optional[str] = None
    status: str
    notes: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    # complaint context included on detail views
    complaint_title: Optional[str] = None
    complaint_description: Optional[str] = None
    complaint_status: Optional[str] = None
    complaint_priority: Optional[str] = None
    complaint_location: Optional[str] = None

    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    resolution_notes: Optional[str] = None
    assigned_officer_id: Optional[str] = None


class AuditLogResponse(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: str
    actor_id: Optional[str] = None
    actor_role: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
