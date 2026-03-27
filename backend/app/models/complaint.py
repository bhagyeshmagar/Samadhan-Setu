from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum, Boolean, JSON, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..database import Base

class ComplaintStatus(str, enum.Enum):
    PENDING = "Pending"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    REJECTED = "Rejected"

class ComplaintPriority(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class Complaint(Base):
    __tablename__ = "complaints"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    location = Column(String(255), nullable=False)
    ward = Column(String(50), nullable=True)  # Ward/Zone for routing
    
    # AI-assigned fields
    priority = Column(SQLEnum(ComplaintPriority), default=ComplaintPriority.LOW)
    urgency_score = Column(Integer, default=0)
    ai_confidence = Column(Integer, default=0)  # 0-100 confidence score
    
    # Status and routing
    status = Column(SQLEnum(ComplaintStatus), default=ComplaintStatus.PENDING)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    assigned_officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)  # AI-assigned team
    
    # Location coordinates (for heatmap and geographic routing)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Community features
    upvotes = Column(Integer, default=0)
    is_public = Column(Boolean, default=True)
    
    # Attachments (store as JSON array of file paths)
    attachments = Column(JSON, nullable=True)  # Citizen uploaded images
    resolution_proof = Column(JSON, nullable=True)  # Officer uploaded proof images
    resolution_remarks = Column(Text, nullable=True)  # Officer remarks when resolving
    
    # Resolution rating by citizen
    resolution_upvotes = Column(Integer, default=0)  # Citizen satisfied
    resolution_downvotes = Column(Integer, default=0)  # Citizen not satisfied
    needs_reconsideration = Column(Boolean, default=False)  # Auto-set if downvotes > upvotes
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)  # SLA deadline based on priority
    
    # Relationships
    user = relationship("User", back_populates="complaints", foreign_keys=[user_id])
    department = relationship("Department", back_populates="complaints")
    assigned_officer = relationship("User", foreign_keys=[assigned_officer_id])
    status_logs = relationship("ComplaintStatusLog", back_populates="complaint", order_by="ComplaintStatusLog.created_at")
    
    def __repr__(self):
        return f"<Complaint #{self.id} - {self.category} ({self.status})>"


class ComplaintStatusLog(Base):
    """Audit log for complaint status changes"""
    __tablename__ = "complaint_status_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    status = Column(SQLEnum(ComplaintStatus), nullable=False)
    remarks = Column(Text, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    complaint = relationship("Complaint", back_populates="status_logs")
    updater = relationship("User", foreign_keys=[updated_by])
    
    def __repr__(self):
        return f"<StatusLog Complaint#{self.complaint_id} -> {self.status}>"
