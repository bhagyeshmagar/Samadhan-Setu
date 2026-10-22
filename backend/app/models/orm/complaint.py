import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import (
    String, Boolean, Integer, Float, BigInteger, DateTime, Text,
    ForeignKey, UniqueConstraint, Index, func
)
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym
from app.db.base import Base
from .enums import (
    ComplaintStatus,
    ComplaintPriority,
    VoteType,
    MediaType,
    pg_enum,
)

if TYPE_CHECKING:
    from .user import User
    from .department import Department
    from .officer import Officer
    from .team import TaskAssignment
    from .ai import AIAnalysisResult

class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        Index("ix_complaints_dept_status_pri", "department_id", "status", "priority_score"),
        Index("ix_complaints_ward_cat_created", "ward", "category", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legacy_firestore_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    complaint_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    citizen_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    sub_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # AI Pipeline results
    ai_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_confidence: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duplicate_of: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Priority & Ranking
    priority: Mapped[ComplaintPriority] = mapped_column(
        pg_enum(ComplaintPriority, "complaint_priority"),
        nullable=False,
        default=ComplaintPriority.LOW,
        server_default="low",
    )
    priority_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", index=True)
    urgency_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    vote_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Location (GPS + Address)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ward: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Status & Routing
    status: Mapped[ComplaintStatus] = mapped_column(
        pg_enum(ComplaintStatus, "complaint_status"),
        nullable=False,
        default=ComplaintStatus.SUBMITTED,
        server_default="submitted",
        index=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_officer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("officers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # SLA Tracking
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Resolution Details
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    citizen_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_taken_report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    atr_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    satisfaction_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    appeal_level: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    appeal_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Flags & Counts
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    escalation_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    citizen: Mapped["User"] = relationship(
        "User", back_populates="complaints", foreign_keys=[citizen_id]
    )
    department: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="complaints"
    )
    assigned_officer: Mapped[Optional["Officer"]] = relationship(
        "Officer", back_populates="assigned_complaints"
    )
    media: Mapped[List["ComplaintMedia"]] = relationship(
        "ComplaintMedia", back_populates="complaint", cascade="all, delete-orphan"
    )
    timeline: Mapped[List["ComplaintTimeline"]] = relationship(
        "ComplaintTimeline", back_populates="complaint", cascade="all, delete-orphan"
    )
    votes: Mapped[List["ComplaintVote"]] = relationship(
        "ComplaintVote", back_populates="complaint", cascade="all, delete-orphan"
    )
    feedback: Mapped[List["CitizenFeedback"]] = relationship(
        "CitizenFeedback", back_populates="complaint", cascade="all, delete-orphan"
    )
    task_assignments: Mapped[List["TaskAssignment"]] = relationship(
        "TaskAssignment", back_populates="complaint", cascade="all, delete-orphan"
    )
    ai_analysis: Mapped[Optional["AIAnalysisResult"]] = relationship(
        "AIAnalysisResult", back_populates="complaint", uselist=False, cascade="all, delete-orphan"
    )


class ComplaintMedia(Base):
    __tablename__ = "complaint_media"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    media_type: Mapped[MediaType] = mapped_column(
        pg_enum(MediaType, "media_type"),
        nullable=False,
        default=MediaType.PROOF_PHOTO,
        server_default="proof_photo",
    )
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # GPS stamp proof verification
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    device_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    has_watermark: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="media")


class ComplaintTimeline(Base):
    __tablename__ = "complaint_timeline"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status_from: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status_to: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by = synonym("changed_by")
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="timeline")
    actor: Mapped[Optional["User"]] = relationship(
        "User", back_populates="timeline_entries", foreign_keys=[changed_by]
    )


class ComplaintVote(Base):
    __tablename__ = "complaint_votes"
    __table_args__ = (
        UniqueConstraint("complaint_id", "user_id", name="uq_complaint_vote_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vote_type: Mapped[VoteType] = mapped_column(
        pg_enum(VoteType, "vote_type"),
        nullable=False,
        default=VoteType.UPVOTE,
        server_default="upvote",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="votes")
    user: Mapped["User"] = relationship("User", back_populates="votes")


class CitizenFeedback(Base):
    __tablename__ = "citizen_feedback"
    __table_args__ = (
        UniqueConstraint("complaint_id", "citizen_id", name="uq_complaint_citizen_feedback"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    citizen_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="feedback")
    citizen: Mapped["User"] = relationship("User", back_populates="feedback_entries")
