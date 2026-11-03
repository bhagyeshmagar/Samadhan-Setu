"""
Complaint models for Samadhan Setu Phase 1.
Defines the complaint lifecycle statuses, priority levels, and data structures.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


from .orm.enums import ComplaintStatus, ComplaintPriority


class Complaint(BaseModel):
    id: Optional[str] = None
    user_id: str
    title: str
    category: str
    subcategory: Optional[str] = None
    description: str
    location: str
    ward: Optional[str] = None

    priority: ComplaintPriority = ComplaintPriority.LOW
    priority_score: float = 0.0
    urgency_score: int = 0
    ai_confidence: int = 0

    status: ComplaintStatus = ComplaintStatus.SUBMITTED
    department_id: Optional[str] = None
    assigned_officer_id: Optional[str] = None
    assigned_team_id: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    upvotes: int = 0
    is_public: bool = True

    attachments: Optional[List[str]] = None
    resolution_proof: Optional[List[Dict[str, Any]]] = None
    resolution_remarks: Optional[str] = None
    
    citizen_rating: Optional[int] = Field(default=None, ge=1, le=5)
    feedback_text: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    deadline: Optional[datetime] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists:
            return None
        data = doc.to_dict()
        data["id"] = doc.id
        for date_field in ["created_at", "updated_at", "resolved_at", "deadline"]:
            val = data.get(date_field)
            if val is not None and hasattr(val, 'timestamp'):
                from datetime import datetime as dt
                data[date_field] = dt.fromtimestamp(val.timestamp())
        try:
            return cls(**data)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to parse complaint {doc.id}: {e}")
            return None
    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        if "status" in data and isinstance(data["status"], str):
            data["status"] = data["status"].capitalize()
        return data


class ComplaintStatusLog(BaseModel):
    id: Optional[str] = None
    complaint_id: str
    from_status: Optional[str] = None
    to_status: str
    remarks: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists:
            return None
        data = doc.to_dict()
        data["id"] = doc.id
        for date_field in ["created_at"]:
            val = data.get(date_field)
            if val is not None and hasattr(val, 'timestamp'):
                from datetime import datetime as dt
                data[date_field] = dt.fromtimestamp(val.timestamp())
        return cls(**data)

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data
