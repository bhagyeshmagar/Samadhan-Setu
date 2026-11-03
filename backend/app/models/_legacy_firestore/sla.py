from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
from .complaint import ComplaintPriority

class SLARule(BaseModel):
    id: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    resolution_hours: int = 72
    escalation_hours: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
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
