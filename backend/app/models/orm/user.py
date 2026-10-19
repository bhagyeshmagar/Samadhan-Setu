import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from .enums import UserRole, pg_enum

if TYPE_CHECKING:
    from .officer import Officer
    from .complaint import Complaint, ComplaintTimeline, ComplaintVote, CitizenFeedback
    from .audit import AuditLog, Notification

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_firestore_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(20), unique=True, nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"),
        nullable=False,
        default=UserRole.CITIZEN,
        server_default="citizen",
    )

    # Citizen Profile details
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preferred_lang: Mapped[str] = mapped_column(
        String(10), default="en", server_default="en"
    )
    ward: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[str] = mapped_column(
        String(100), default="Maharashtra", server_default="Maharashtra"
    )
    pincode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Auth flags & Push notifications
    is_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fcm_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    officer_profile: Mapped[Optional["Officer"]] = relationship(
        "Officer", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    complaints: Mapped[List["Complaint"]] = relationship(
        "Complaint", back_populates="citizen", foreign_keys="Complaint.citizen_id"
    )
    timeline_entries: Mapped[List["ComplaintTimeline"]] = relationship(
        "ComplaintTimeline", back_populates="actor", foreign_keys="ComplaintTimeline.changed_by"
    )
    votes: Mapped[List["ComplaintVote"]] = relationship(
        "ComplaintVote", back_populates="user", cascade="all, delete-orphan"
    )
    feedback_entries: Mapped[List["CitizenFeedback"]] = relationship(
        "CitizenFeedback", back_populates="citizen", cascade="all, delete-orphan"
    )
    notifications: Mapped[List["Notification"]] = relationship(
        "Notification", back_populates="user", cascade="all, delete-orphan"
    )
