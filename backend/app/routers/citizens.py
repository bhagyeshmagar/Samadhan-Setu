"""
Citizens Router — PostgreSQL edition.
Handles complaint submission, tracking, uploads, upvotes, and feedback.

IMPORTANT: ALL fixed-path routes (e.g. /my, /public/feed, /preview-ai,
/check-similar) MUST be declared BEFORE parameterised routes (/{complaint_id})
otherwise Starlette's path-matching will match the fixed segments as a path
parameter and return 405 Method Not Allowed for the wrong HTTP method.
"""
import io
import os
import uuid
from typing import List, Optional, Any
from datetime import datetime, timezone

from fastapi import (
    APIRouter, Depends, HTTPException, status,
    Query, File, UploadFile, BackgroundTasks,
)
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session
from ..auth import get_current_user, require_citizen
from ..models.orm import User, Complaint, CitizenFeedback
from ..models.orm.enums import ComplaintStatus, ComplaintPriority, UserRole, VoteType, MediaType
from ..repositories.complaint_repo import ComplaintRepository
from ..repositories.department_repo import DepartmentRepository
from ..schemas import ComplaintCreate, ComplaintResponse, ComplaintAIResponse, StatusLogResponse, ComplaintFeedback as FeedbackSchema
from ..config import settings
from ..services.ai_bridge import ai_bridge
from ..ai.priority import calculate_priority

CITIZEN_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "citizen"
)
os.makedirs(CITIZEN_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/complaints", tags=["Citizens"])


def _complaint_to_response(c: Complaint) -> ComplaintResponse:
    """Map ORM Complaint to ComplaintResponse-compatible dict."""
    status_logs = [
        StatusLogResponse(
            id=str(t.id),
            complaint_id=str(t.complaint_id),
            from_status=t.status_from,
            to_status=t.status_to,
            remarks=t.notes,
            updated_by=str(t.changed_by) if t.changed_by else None,
            created_at=t.created_at,
        )
        for t in sorted(c.timeline or [], key=lambda x: x.created_at)
    ]
    user_dict = None
    if getattr(c, "citizen", None) and not c.is_anonymous:
        user_dict = {
            "id": str(c.citizen.id),
            "name": c.citizen.name,
            "email": c.citizen.email,
            "phone": c.citizen.phone,
        }

    return ComplaintResponse(
        id=str(c.id),
        user_id=str(c.citizen_id),
        user=user_dict,
        title=c.title,
        category=c.category,
        subcategory=c.sub_category,
        description=c.description,
        location=c.address or (f"{c.latitude},{c.longitude}" if c.latitude else ""),
        ward=c.ward,
        latitude=c.latitude,
        longitude=c.longitude,
        is_public=c.is_public,
        priority=c.priority,
        priority_score=c.priority_score,
        urgency_score=c.urgency_score,
        ai_confidence=int(c.ai_confidence * 100) if c.ai_confidence else None,
        status=c.status,
        department_id=str(c.department_id) if c.department_id else None,
        upvotes=c.vote_count,
        attachments=[f"/uploads/{m.s3_key}" if not m.s3_key.startswith("http") else m.s3_key for m in c.media] if c.media else [],
        resolution_proof=[f"/uploads/{m.s3_key}" if not m.s3_key.startswith("http") else m.s3_key for m in c.media if m.media_type == MediaType.RESOLUTION_PHOTO] if c.media else [],
        resolution_remarks=c.resolution_remarks,
        citizen_rating=getattr(c, 'citizen_rating', None) if getattr(c, 'citizen_rating', None) is not None else (c.feedback[-1].rating if getattr(c, 'feedback', None) and len(c.feedback) > 0 else None),
        feedback_text=getattr(c, 'feedback_text', None) if getattr(c, 'feedback_text', None) else (c.feedback[-1].comment if getattr(c, 'feedback', None) and len(c.feedback) > 0 else None),
        created_at=c.created_at,
        updated_at=c.updated_at,
        resolved_at=c.resolved_at,
        deadline=c.sla_deadline,
        status_logs=status_logs,
        status_history=status_logs,
    )


def _complaint_to_public_response(c: Complaint) -> ComplaintResponse:
    resp = _complaint_to_response(c)
    if c.is_anonymous:
        resp.user_id = "anonymous"
        resp.user = None
    if resp.latitude is not None and resp.longitude is not None:
        resp.latitude = round(resp.latitude, 3)
        resp.longitude = round(resp.longitude, 3)
    return resp


# POST /
@router.post("/", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
async def submit_complaint(
    complaint_data: ComplaintCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Submit a new complaint. Category and priority are system-assigned via AI."""
    complaint_repo = ComplaintRepository(session)
    dept_repo = DepartmentRepository(session)

    classification = ai_bridge.classify_complaint(complaint_data.description)
    category = complaint_data.category or classification["category"]

    priority_result = calculate_priority(complaint_data.description, category, upvotes=0)
    priority_map = {
        "Low": ComplaintPriority.LOW,
        "Medium": ComplaintPriority.MEDIUM,
        "High": ComplaintPriority.HIGH,
        "Critical": ComplaintPriority.CRITICAL,
    }
    priority_enum = priority_map.get(priority_result["priority"], ComplaintPriority.LOW)

    department = await dept_repo.get_by_category(category)
    department_id = department.id if department else None
    sla_hours = await dept_repo.get_sla_hours(category, priority_result["priority"])

    complaint = await complaint_repo.create(
        citizen_id=current_user.id,
        title=complaint_data.title,
        description=complaint_data.description,
        category=category,
        address=complaint_data.location,
        ward=complaint_data.ward,
        latitude=complaint_data.latitude,
        longitude=complaint_data.longitude,
        priority=priority_enum,
        priority_score=priority_result["score"],
        urgency_score=priority_result["breakdown"].get("urgency", 0),
        department_id=department_id,
        sla_hours=sla_hours,
        is_public=complaint_data.is_public if complaint_data.is_public is not None else True,
    )

    if department_id:
        await complaint_repo.add_status_transition(
            complaint,
            ComplaintStatus.ASSIGNED,
            changed_by=current_user.id,
            actor_role=current_user.role.value,
            notes=f"Auto-assigned to {department.name} department",
        )

    await session.commit()
    # Re-fetch with ALL relations eagerly loaded (avoids MissingGreenlet on async sessions)
    loaded = await complaint_repo.get_by_id(complaint.id)
    if loaded is None:
        raise HTTPException(status_code=500, detail="Complaint saved but could not be retrieved.")

    return _complaint_to_response(loaded)


# GET /preview-ai
@router.get("/preview-ai", response_model=ComplaintAIResponse)
async def preview_ai_classification(
    description: str = Query(..., min_length=10),
    current_user: User = Depends(get_current_user),
):
    """Preview AI category + priority before submitting a complaint."""
    classification = ai_bridge.classify_complaint(description)
    priority_result = calculate_priority(description, classification["category"], 0)
    return ComplaintAIResponse(
        category=classification["category"],
        priority=priority_result["priority"],
        priority_score=priority_result["score"],
        urgency_score=priority_result["breakdown"].get("urgency", 0),
        confidence=classification["confidence"],
        department_id=None,
    )


# GET /check-similar
# NOTE: MUST be declared before /{complaint_id} routes to prevent Starlette
# from matching "check-similar" as a path parameter and returning 405.
# Using GET (not POST) avoids CORS preflight (OPTIONS) which Starlette
# incorrectly 405s when a parameterised route /{complaint_id} exists below.
@router.get("/check-similar")
async def check_similar_complaints(
    description: str = Query(..., min_length=10),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Return similar public complaints for the given description text."""
    repo = ComplaintRepository(session)
    recent, _ = await repo.list_complaints(is_public_only=True, limit=50, offset=0)

    similar = []
    try:
        candidates = [
            {"id": str(c.id), "text": c.description}
            for c in recent
        ]
        matches = ai_bridge.get_similar_complaints(description, candidates, threshold=0.60)
        score_map = {m["complaint_id"]: m["similarity_score"] for m in matches}
        similar = [
            {
                "id": str(c.id),
                "complaint_id": str(c.id),
                "complaint_number": c.complaint_number,
                "title": c.title,
                "description": c.description,
                "similarity_score": score_map.get(str(c.id), 0.75),
                "category": c.category,
                "status": c.status.value,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in recent
            if str(c.id) in score_map
        ]
        similar.sort(key=lambda x: x["similarity_score"], reverse=True)
    except Exception:
        similar = []

    return {
        "has_similar": len(similar) > 0,
        "similar_complaints": similar,
        "description_processed": description[:100],
    }


# GET /my
@router.get("/my", response_model=List[ComplaintResponse])
async def get_my_complaints(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """All complaints by the current citizen, newest first."""
    repo = ComplaintRepository(session)
    status_enum = None
    if status_filter:
        try:
            status_enum = ComplaintStatus(status_filter)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid status: {status_filter}")

    complaints, _ = await repo.list_complaints(citizen_id=current_user.id, status=status_enum, limit=100)
    return [_complaint_to_response(c) for c in complaints]


# GET /public/feed
@router.get("/public/feed", response_model=List[ComplaintResponse])
async def get_public_complaints(
    category: Optional[str] = None,
    ward: Optional[str] = None,
    sort_by: str = Query("recent", enum=["recent", "priority", "upvotes"]),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_async_session),
):
    """Public complaint feed. No authentication required."""
    repo = ComplaintRepository(session)
    offset = (page - 1) * per_page
    complaints, _ = await repo.list_complaints(
        category=category,
        ward=ward,
        is_public_only=True,
        sort_by=sort_by,
        limit=per_page,
        offset=offset,
    )
    return [_complaint_to_public_response(c) for c in complaints]


# GET /{complaint_id}
@router.get("/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Complaint detail with full timeline. Owner, officers, and admins can access."""
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

    return _complaint_to_response(complaint)


# GET /{complaint_id}/history
@router.get("/{complaint_id}/history", response_model=List[StatusLogResponse])
async def get_complaint_history(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Status timeline for a complaint."""
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
    if not (is_owner or is_staff):
        raise HTTPException(status_code=403, detail="Access denied")

    return [
        StatusLogResponse(
            id=str(t.id),
            complaint_id=str(t.complaint_id),
            from_status=t.status_from,
            to_status=t.status_to,
            remarks=t.notes,
            updated_by=str(t.changed_by) if t.changed_by else None,
            created_at=t.created_at,
        )
        for t in sorted(complaint.timeline or [], key=lambda x: x.created_at)
    ]


# POST /{complaint_id}/upload-images
@router.post("/{complaint_id}/upload-images")
async def upload_complaint_images(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload evidence images for a complaint. Only the complaint owner can upload."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if complaint.citizen_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the complaint owner can upload images")

    existing_count = len(complaint.media or [])
    if existing_count >= settings.MAX_ATTACHMENTS_PER_COMPLAINT:
        raise HTTPException(status_code=400, detail=f"Maximum {settings.MAX_ATTACHMENTS_PER_COMPLAINT} attachments allowed.")

    remaining = settings.MAX_ATTACHMENTS_PER_COMPLAINT - existing_count
    files = files[:remaining]

    uploaded, rejected = [], []
    for file in files:
        if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
            rejected.append({"filename": file.filename, "reason": "Unsupported file type"})
            continue

        content = await file.read()
        if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
            rejected.append({"filename": file.filename, "reason": "File exceeds 5MB limit"})
            continue

        try:
            img = Image.open(io.BytesIO(content))
            img.verify()
        except Exception:
            rejected.append({"filename": file.filename, "reason": "Invalid or unreadable image"})
            continue

        ext = os.path.splitext(file.filename or "")[1].lower()
        safe_ext = ext if ext in {".jpg", ".jpeg", ".png", ".webp"} else ".jpg"
        unique_name = f"{uuid.uuid4().hex}{safe_ext}"
        file_path = os.path.join(CITIZEN_UPLOAD_DIR, unique_name)
        with open(file_path, "wb") as f:
            f.write(content)

        local_key = f"citizen/{unique_name}"
        await repo.add_media_proof(
            complaint_id=complaint.id,
            media_type=MediaType.PROOF_PHOTO,
            s3_key=local_key,
            file_name=unique_name,
            file_size_bytes=len(content),
            mime_type=file.content_type or "image/jpeg",
            uploaded_by=current_user.id,
        )
        uploaded.append(f"/uploads/{local_key}")

    await session.commit()
    return {
        "message": f"Uploaded {len(uploaded)} image(s).",
        "uploaded": uploaded,
        "rejected": rejected,
    }


# POST /{complaint_id}/upvote
@router.post("/{complaint_id}/upvote")
async def upvote_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Upvote a public complaint. One vote per user per complaint."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if not complaint.is_public:
        raise HTTPException(status_code=404, detail="Complaint not public")

    voted = await repo.upvote(complaint.id, current_user.id, VoteType.UPVOTE)
    await session.commit()

    if not voted:
        return {"message": "Already upvoted", "upvotes": complaint.vote_count}
    return {"message": "Upvoted successfully", "upvotes": complaint.vote_count + 1}
# POST /{complaint_id}/feedback
@router.post("/{complaint_id}/feedback")
async def submit_feedback(
    complaint_id: str,
    feedback_data: FeedbackSchema,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Submit a 1-5 star rating for a resolved complaint."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if complaint.citizen_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if complaint.status not in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED):
        raise HTTPException(status_code=400, detail="Feedback only allowed for resolved complaints")

    if not (1 <= feedback_data.rating <= 5):
        raise HTTPException(status_code=422, detail="Rating must be between 1 and 5")

    # Prevent duplicate feedback submissions
    existing = await session.execute(
        select(CitizenFeedback).where(
            CitizenFeedback.complaint_id == complaint.id,
            CitizenFeedback.citizen_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Feedback already submitted for this complaint")

    feedback = CitizenFeedback(
        id=uuid.uuid4(),
        complaint_id=complaint.id,
        citizen_id=current_user.id,
        rating=feedback_data.rating,
        comment=feedback_data.feedback_text,
    )
    session.add(feedback)

    # Set citizen_rating and feedback_text on the complaint
    complaint.citizen_rating = feedback_data.rating
    complaint.feedback_text = feedback_data.feedback_text

    await session.commit()

    return {
        "message": "Feedback submitted. Thank you!",
        "rating": feedback_data.rating,
        "citizen_rating": feedback_data.rating,
        "feedback_text": feedback_data.feedback_text,
    }


# POST /verify-priority
@router.post("/verify-priority")
async def verify_priority(
    urgency: int = Query(..., ge=0, le=10),
    severity: int = Query(..., ge=0, le=10),
    upvotes: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """Verify priority score and SLA tier given urgency, severity, and upvote metrics."""
    base_score = (urgency * 0.4) + (severity * 0.4)
    vote_boost = min(upvotes * 0.1, 2.0)
    final_score = round(base_score + vote_boost, 2)

    if final_score >= 7.0:
        band = "CRITICAL"
        sla_hours = 4
    elif final_score >= 5.0:
        band = "HIGH"
        sla_hours = 24
    elif final_score >= 3.0:
        band = "MEDIUM"
        sla_hours = 48
    else:
        band = "LOW"
        sla_hours = 72

    return {
        "priority": band,
        "priority_score": final_score,
        "sla_target_hours": sla_hours,
        "breakdown": {
            "urgency": urgency,
            "severity": severity,
            "upvotes": upvotes,
            "vote_boost": vote_boost,
        }
    }
