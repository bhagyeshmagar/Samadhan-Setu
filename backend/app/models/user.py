from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

class UserRole(str, Enum):
    CITIZEN = "citizen"
    OFFICER = "officer"
    ADMIN = "admin"

class User(BaseModel):
    id: Optional[str] = None  # Firestore Document ID
    email: str
    password_hash: str
    name: str
    phone: Optional[str] = None
    role: UserRole = UserRole.CITIZEN
    department_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True

    @classmethod
    def from_firestore(cls, doc):
        """Convert a Firestore DocumentSnapshot to this model"""
        if not doc.exists:
            return None
        data = doc.to_dict()
        data["id"] = doc.id
        return cls(**data)

    def to_firestore(self):
        """Convert to dict for saving to Firestore"""
        data = self.model_dump(mode='json')
        data.pop("id", None)  # Don't save ID in the document body
        return data
