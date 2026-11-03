from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List

class Department(BaseModel):
    id: Optional[str] = None
    name: str
    code: str
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
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

class CategoryMapping(BaseModel):
    id: Optional[str] = None
    category: str
    department_id: str
    priority_boost: int = 0
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
