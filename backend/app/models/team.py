from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class Team(BaseModel):
    id: Optional[str] = None
    department_id: str
    name: str
    code: str
    daily_capacity: int = 10
    active_tasks: int = 0
    ward_coverage: Optional[List[str]] = None
    head_officer_id: Optional[str] = None
    contact_email: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @property
    def load_ratio(self) -> float:
        if self.daily_capacity == 0: return float('inf')
        return self.active_tasks / self.daily_capacity

    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists: return None
        data = doc.to_dict()
        data["id"] = doc.id
        try:
            return cls(**data)
        except Exception:
            return None

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data

class TaskAssignment(BaseModel):
    id: Optional[str] = None
    complaint_id: str
    team_id: str
    assigned_at: datetime = Field(default_factory=datetime.utcnow)
    deadline: datetime
    load_score: Optional[float] = None
    reason: Optional[str] = None
    is_reassigned: bool = False
    reassigned_from_team_id: Optional[str] = None
    reassignment_reason: Optional[str] = None
    reassigned_at: Optional[datetime] = None
    is_active: bool = True
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists: return None
        data = doc.to_dict()
        data["id"] = doc.id
        try:
            return cls(**data)
        except Exception:
            return None

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data

class AssignmentLog(BaseModel):
    id: Optional[str] = None
    assignment_id: str
    event_type: str
    details: Optional[Dict[str, Any]] = None
    triggered_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists: return None
        data = doc.to_dict()
        data["id"] = doc.id
        try:
            return cls(**data)
        except Exception:
            return None

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data
