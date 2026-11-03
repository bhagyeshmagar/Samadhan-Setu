"""
Audit log model for Samadhan Setu Phase 1.
Persistent, immutable record of every significant system action.
"""
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from enum import Enum


class AuditAction(str, Enum):
    COMPLAINT_CREATED = "complaint_created"
    COMPLAINT_STATUS_UPDATED = "complaint_status_updated"
    TASK_CREATED = "task_created"
    TASK_ASSIGNED = "task_assigned"
    TASK_STATUS_UPDATED = "task_status_updated"
    FILE_UPLOADED = "file_uploaded"
    MAPPING_UPDATED = "mapping_updated"
    COMPLAINT_REOPENED = "complaint_reopened"
    COMPLAINT_APPEALED = "complaint_appealed"
    OFFICER_REASSIGNED = "officer_reassigned"


class AuditLog(BaseModel):
    id: Optional[str] = None
    action: str
    entity_type: str  # "complaint", "task", "mapping", etc.
    entity_id: str
    actor_id: Optional[str] = None
    actor_role: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
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
        try:
            return cls(**data)
        except Exception:
            return None

    def to_firestore(self):
        data = self.model_dump(mode='json')
        data.pop("id", None)
        return data
