"""
AI Insights Router — PostgreSQL edition.
Provides AI classification preview, duplicate detection, priority explanation,
and officer AI-ranked queue. All AI outputs are advisory — officers decide.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session
from ..auth import get_current_user, require_officer
from ..models.orm import User, Complaint
from ..models.orm.enums import UserRole, ComplaintStatus
from ..repositories.complaint_repo import ComplaintRepository
from ..repositories.user_repo import UserRepository
from ..services.ai_bridge import ai_bridge
from ..ai.priority import calculate_priority

router = APIRouter(prefix="/api/ai", tags=["AI Insights"])


class AIClassifyRequest(BaseModel):
    description: str
    title: Optional[str] = None


class AIClassifyResponse(BaseModel):
    category: str
    confidence: int
    priority: str
    priority_score: float
    urgency_score: int
    is_duplicate_likely: bool


class OfficerQueueItem(BaseModel):
    complaint_id: str
    complaint_number: str
    title: str
    category: str
    priority: str
    priority_score: float
    status: str
    ward: Optional[str] = None
    sla_breached: bool
    vote_count: int


# ──────────────────────────────────────────────────────────────────────────────
# Classify text
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/classify", response_model=AIClassifyResponse)
async def classify_complaint_text(
    body: AIClassifyRequest,
    current_user: User = Depends(get_current_user),
):
    """AI classification preview — no database write, advisory only."""
    if len(body.description) < 10:
        raise HTTPException(status_code=422, detail="Description too short for classification")

    classification = ai_bridge.classify_complaint(body.description)
    priority_result = calculate_priority(body.description, classification["category"], upvotes=0)

    return AIClassifyResponse(
        category=classification["category"],
        confidence=classification["confidence"],
        priority=priority_result["priority"],
        priority_score=priority_result["score"],
        urgency_score=priority_result["breakdown"].get("urgency", 0),
        is_duplicate_likely=False,  # Full duplicate check runs at submission time
    )


# ──────────────────────────────────────────────────────────────────────────────
# Priority explanation for a specific complaint
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/priority-explanation")
async def get_priority_explanation(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Explain how the priority score was computed for a complaint."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    is_owner = complaint.citizen_id == current_user.id
    is_staff = current_user.role in (UserRole.OFFICER, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if not (is_owner or complaint.is_public or is_staff):
        raise HTTPException(status_code=403, detail="Access denied")

    priority_result = calculate_priority(complaint.description, complaint.category, complaint.vote_count)

    return {
        "complaint_id": complaint_id,
        "complaint_number": complaint.complaint_number,
        "priority": complaint.priority.value,
        "priority_score": complaint.priority_score,
        "ai_explanation": priority_result,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Officer AI-ranked queue
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/officer/queue", response_model=List[OfficerQueueItem])
async def get_officer_ai_queue(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """AI-ranked complaint queue for the officer — sorted by priority score descending."""
    user_repo = UserRepository(session)
    officer = await user_repo.get_officer_by_user_id(current_user.id)

    repo = ComplaintRepository(session)
    dept_id = officer.department_id if officer and current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN) else None

    complaints, _ = await repo.list_complaints(
        department_id=dept_id,
        status=None,
        limit=limit,
        offset=0,
    )

    # Filter to only active (non-terminal) complaints
    active = [c for c in complaints if c.status not in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED)]

    return [
        OfficerQueueItem(
            complaint_id=str(c.id),
            complaint_number=c.complaint_number,
            title=c.title,
            category=c.category,
            priority=c.priority.value,
            priority_score=c.priority_score,
            status=c.status.value,
            ward=c.ward,
            sla_breached=c.sla_breached,
            vote_count=c.vote_count,
        )
        for c in active
    ]


# ──────────────────────────────────────────────────────────────────────────────
# AI model health
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/health")
async def ai_health(current_user: User = Depends(get_current_user)):
    """Check availability of AI service components."""
    try:
        result = ai_bridge.classify_complaint("Test road pothole issue near bus stop")
        classifier_ok = bool(result and result.get("category"))
    except Exception as e:
        classifier_ok = False

    return {
        "classifier": "healthy" if classifier_ok else "degraded",
        "priority_engine": "healthy",
        "overall": "healthy" if classifier_ok else "degraded",
    }
