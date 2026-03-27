from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLEnum
from datetime import datetime

from ..database import Base
from .complaint import ComplaintPriority

class SLARule(Base):
    """SLA rules defining resolution timeframes by category and priority"""
    __tablename__ = "sla_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=True)  # Null = applies to all categories
    priority = Column(SQLEnum(ComplaintPriority), nullable=True)  # Null = applies to all priorities
    resolution_hours = Column(Integer, nullable=False, default=72)  # Default 3 days
    escalation_hours = Column(Integer, nullable=True)  # Hours before escalation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<SLARule {self.category or 'All'}/{self.priority or 'All'}: {self.resolution_hours}h>"
