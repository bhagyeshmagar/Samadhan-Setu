"""
Task model for Samadhan Setu Phase 1.
A single complaint can generate multiple tasks routed to different departments.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "Pending"
    ASSIGNED = "Assigned"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    REJECTED = "Rejected"


class Task(BaseModel):
    id: Optional[str] = None
    complaint_id: str
    department_id: str
    department_name: Optional[str] = None
    assigned_officer_id: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    notes: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        if not doc.exists:
            return None
        data = doc.to_dict()
        data["id"] = doc.id
        for date_field in ["created_at", "updated_at", "completed_at"]:
            val = data.get(date_field)
            if val is not None and hasattr(val, 'timestamp'):
                from datetime import datetime as dt
                data[date_field] = dt.fromtimestamp(val.timestamp())
        try:
            return cls(**data)
        except Exception:
            return None

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data


class TaskStatusLog(BaseModel):
    id: Optional[str] = None
    task_id: str
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
        try:
            return cls(**data)
        except Exception:
            return None

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data
