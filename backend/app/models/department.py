from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from ..database import Base

class Department(Base):
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    code = Column(String(50), unique=True, nullable=False)  # e.g., "dept_roads"
    description = Column(String(500), nullable=True)
    keywords = Column(JSON, nullable=True)  # Keywords for AI classification
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    officers = relationship("User", back_populates="department")
    complaints = relationship("Complaint", back_populates="department")
    category_mappings = relationship("CategoryMapping", back_populates="department")
    
    def __repr__(self):
        return f"<Department {self.name}>"


class CategoryMapping(Base):
    """Maps complaint categories to departments for routing"""
    __tablename__ = "category_mappings"
    
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), unique=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    priority_boost = Column(Integer, default=0)  # Additional priority for this category
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    department = relationship("Department", back_populates="category_mappings")
    
    def __repr__(self):
        return f"<CategoryMapping {self.category} -> Dept {self.department_id}>"

