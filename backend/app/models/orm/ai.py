import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Float, DateTime, ForeignKey, func, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from .complaint import Complaint
    from .department import Department

class AIAnalysisResult(Base):
    __tablename__ = "ai_analysis_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    complaint_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # NLP / DistilBERT
    predicted_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category_confidence: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    # Vision / YOLOv8
    detected_objects: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    damage_severity: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    # SBERT Semantic Embedding
    semantic_embedding: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # Priority Fusion (6-factor breakdown)
    priority_factors: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    fused_priority_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    # Routing Intelligence
    recommended_department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    routing_confidence: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")

    raw_model_outputs: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    model_version: Mapped[str] = mapped_column(String(50), default="2.0", server_default="2.0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    complaint: Mapped["Complaint"] = relationship("Complaint", back_populates="ai_analysis")
    recommended_department: Mapped[Optional["Department"]] = relationship("Department")
