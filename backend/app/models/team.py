"""
Team and Task Assignment Models for AI-Driven Load Balancing
=============================================================
These models support Feature 1: AI Auto-Assignment & Load Balancing.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime

from ..database import Base


class Team(Base):
    """
    A team is a sub-unit within a Department responsible for handling grievances.
    Teams have defined daily capacities and geographic coverage (wards/zones).
    """
    __tablename__ = "teams"
    
    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)  # e.g., "roads_team_north"
    
    # Capacity & Workload
    daily_capacity = Column(Integer, default=10)  # Max tasks per day
    active_tasks = Column(Integer, default=0)     # Current active tasks
    
    # Geographic Coverage (JSON array of ward/zone codes)
    ward_coverage = Column(JSON, nullable=True)  # e.g., ["ward_1", "ward_2", "ward_3"]
    
    # Contact
    head_officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    contact_email = Column(String(255), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    department = relationship("Department", backref="teams")
    head_officer = relationship("User", foreign_keys=[head_officer_id])
    assignments = relationship("TaskAssignment", back_populates="team", foreign_keys="TaskAssignment.team_id")
    
    def __repr__(self):
        return f"<Team {self.name} (Dept: {self.department_id})>"
    
    @property
    def load_ratio(self) -> float:
        """Calculate current load as a ratio (0.0 to 1.0+)"""
        if self.daily_capacity == 0:
            return float('inf')
        return self.active_tasks / self.daily_capacity


class TaskAssignment(Base):
    """
    Audit log for AI-driven task assignments.
    Records assignment decisions, reasons, and reassignment history.
    """
    __tablename__ = "task_assignments"
    
    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    
    # Assignment Details
    assigned_at = Column(DateTime, default=datetime.utcnow)
    deadline = Column(DateTime, nullable=False)  # SLA-based deadline
    
    # AI Decision Explainability
    load_score = Column(Float, nullable=True)  # The calculated load score at assignment time
    reason = Column(Text, nullable=True)  # Human-readable reason for assignment
    
    # Reassignment Tracking
    is_reassigned = Column(Boolean, default=False)
    reassigned_from_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    reassignment_reason = Column(Text, nullable=True)
    reassigned_at = Column(DateTime, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)  # False when task is completed/closed
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    complaint = relationship("Complaint", backref="task_assignments")
    team = relationship("Team", foreign_keys=[team_id], back_populates="assignments")
    reassigned_from_team = relationship("Team", foreign_keys=[reassigned_from_team_id])
    
    def __repr__(self):
        return f"<TaskAssignment Complaint#{self.complaint_id} -> Team#{self.team_id}>"


class AssignmentLog(Base):
    """
    Granular log for assignment lifecycle events.
    Useful for auditing and governance requirements.
    """
    __tablename__ = "assignment_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("task_assignments.id"), nullable=False)
    event_type = Column(String(50), nullable=False)  # "CREATED", "REASSIGNED", "COMPLETED", "OVERRIDDEN"
    details = Column(JSON, nullable=True)  # Event-specific data
    triggered_by = Column(String(50), nullable=True)  # "AI", "ADMIN", "SYSTEM"
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    assignment = relationship("TaskAssignment", backref="logs")
    
    def __repr__(self):
        return f"<AssignmentLog {self.event_type} for Assignment#{self.assignment_id}>"
