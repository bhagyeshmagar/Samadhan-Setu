import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, Integer, DateTime, Text, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .officer import Officer
    from .complaint import Complaint
    from .team import Team

class Department(Base):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_firestore_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    head_officer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("officers.id", ondelete="SET NULL", use_alter=True, name="fk_departments_head_officer"),
        nullable=True,
    )
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # SLA configurations (in hours)
    sla_high: Mapped[int] = mapped_column(Integer, default=24, server_default="24")
    sla_medium: Mapped[int] = mapped_column(Integer, default=72, server_default="72")
    sla_low: Mapped[int] = mapped_column(Integer, default=168, server_default="168")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    officers: Mapped[List["Officer"]] = relationship(
        "Officer", back_populates="department", foreign_keys="Officer.department_id"
    )
    teams: Mapped[List["Team"]] = relationship(
        "Team", back_populates="department", cascade="all, delete-orphan"
    )
    complaints: Mapped[List["Complaint"]] = relationship(
        "Complaint", back_populates="department"
    )
    category_mappings: Mapped[List["CategoryMapping"]] = relationship(
        "CategoryMapping", back_populates="department", cascade="all, delete-orphan"
    )

    @property
    def categories_handled(self) -> List[str]:
        if hasattr(self, "_categories_handled") and self._categories_handled is not None:
            return self._categories_handled

        cats = [self.name]
        name_lower = self.name.lower()
        if "road" in name_lower or "transport" in name_lower:
            cats.extend(["roads", "transport", "roads & transport", "roads and transport", "potholes", "traffic", "general"])
        elif "water" in name_lower:
            cats.extend(["water", "water supply", "drainage", "sewage", "leakage"])
        elif "electr" in name_lower or "power" in name_lower:
            cats.extend(["electricity", "power", "lighting", "streetlight"])
        elif "sanitat" in name_lower or "waste" in name_lower:
            cats.extend(["sanitation", "waste", "sanitation & waste", "garbage", "cleaning"])
        elif "health" in name_lower or "safety" in name_lower:
            cats.extend(["health", "safety", "health & safety", "medical", "hospital"])

        if "category_mappings" in self.__dict__ and self.category_mappings:
            for cm in self.category_mappings:
                if cm.category not in cats:
                    cats.append(cm.category)

        return cats

    @categories_handled.setter
    def categories_handled(self, val: List[str]):
        self._categories_handled = val


class CategoryMapping(Base):
    __tablename__ = "category_mappings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False
    )
    sub_categories: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    auto_assign: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    department: Mapped["Department"] = relationship("Department", back_populates="category_mappings")


class SLARule(Base):
    __tablename__ = "sla_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    priority: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    resolution_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    escalation_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
