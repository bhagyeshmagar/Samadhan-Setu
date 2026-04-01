from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class ComplaintStatus(str, Enum):
    PENDING = "Pending"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    REJECTED = "Rejected"

class ComplaintPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class Complaint(BaseModel):
    id: Optional[str] = None
    user_id: str
    category: str
    description: str
    location: str
    ward: Optional[str] = None
    
    priority: ComplaintPriority = ComplaintPriority.LOW
    urgency_score: int = 0
    ai_confidence: int = 0
    
    status: ComplaintStatus = ComplaintStatus.PENDING
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
    
    resolution_upvotes: int = 0
    resolution_downvotes: int = 0
    needs_reconsideration: bool = False
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None
    deadline: Optional[datetime] = None
    
    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists: return None
        data = doc.to_dict()
        data["id"] = doc.id
        # Convert Firestore Timestamps to Python datetime
        for date_field in ["created_at", "updated_at", "resolved_at", "deadline"]:
            val = data.get(date_field)
            if val is not None and hasattr(val, 'timestamp'):
                # Firestore DatetimeWithNanoseconds -> Python datetime
                from datetime import datetime as dt
                data[date_field] = dt.fromtimestamp(val.timestamp())
        return cls(**data)

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data


class ComplaintStatusLog(BaseModel):
    id: Optional[str] = None
    complaint_id: str
    status: ComplaintStatus
    remarks: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists: return None
        data = doc.to_dict()
        data["id"] = doc.id
        return cls(**data)

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data
