import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, Integer, Float, DateTime, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .user import User
    from .department import Department
    from .complaint import Complaint

class Officer(Base):
    __tablename__ = "officers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    employee_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    designation: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    jurisdiction_wards: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Capacity & Workload metrics
    max_active_complaints: Mapped[int] = mapped_column(
        Integer, default=20, server_default="20"
    )
    current_active_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )

    # Performance tracking
    total_resolved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_resolution_hours: Mapped[float] = mapped_column(
        Float, default=0.0, server_default="0.0"
    )
    rating: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="officer_profile")
    department: Mapped["Department"] = relationship(
        "Department", back_populates="officers", foreign_keys=[department_id]
    )
    assigned_complaints: Mapped[List["Complaint"]] = relationship(
        "Complaint", back_populates="assigned_officer"
    )
