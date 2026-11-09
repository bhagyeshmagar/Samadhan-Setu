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
from datetime import datetime, timezone, timedelta

from fastapi import (
    APIRouter, Depends, HTTPException, status,
    Query, File, UploadFile, BackgroundTasks,
)
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session, get_db_session
from ..auth import get_current_user, require_citizen
from ..models.orm import User, Complaint, CitizenFeedback
from ..models.orm.enums import ComplaintStatus, ComplaintPriority, UserRole, VoteType, MediaType
from ..repositories.complaint_repo import ComplaintRepository
from ..repositories.department_repo import DepartmentRepository
from ..schemas import ComplaintCreate, ComplaintResponse, ComplaintAIResponse, StatusLogResponse, ComplaintFeedback as FeedbackSchema
from ..config import settings
from ..services.ai_bridge import ai_bridge
from ..ai.priority import calculate_priority
from ..services.media_service import process_and_store_image
from ..services.complaint_access import (
    get_visible_complaint,
    serialize_public,
    serialize_owner,
    serialize_staff,
    serialize_complaint,
)

CITIZEN_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "citizen"
)
os.makedirs(CITIZEN_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/complaints", tags=["Citizens"])


def _media_url(s3_key: Optional[str]) -> Optional[str]:
    if not s3_key:
        return None
    if s3_key.startswith(("http://", "https://")):
        return s3_key
    clean_key = s3_key.lstrip("/")
    return f"/{clean_key}" if clean_key.startswith("uploads/") else f"/uploads/{clean_key}"


def _complaint_to_response(
    c: Complaint,
    viewer_id: Optional[str] = None,
    viewer_role: Optional[str] = None,
) -> ComplaintResponse:
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

    inspection_images = [
        _media_url(m.s3_key)
        for m in (c.media or [])
        if m.media_type == MediaType.INSPECTION_PHOTO
    ]
    resolution_images = [
        _media_url(m.s3_key)
        for m in (c.media or [])
        if m.media_type == MediaType.RESOLUTION_PHOTO
        and "inspection" not in (m.s3_key or "").lower()
    ]
    all_attachments = [
        _media_url(m.s3_key)
        for m in (c.media or [])
    ]

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
        attachments=all_attachments,
        inspection_images=inspection_images,
        resolution_proof=resolution_images,
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


def _complaint_to_public_response(c: Complaint) -> Dict[str, Any]:
    # Strictly zero PII: ward only, no street address, no user_id, no citizen contact info
    return serialize_public(c)


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

    # Persist initial AI Triage & 6-Factor Priority breakdown into ai_results
    from app.models.orm.complaint import AIResult
    ai_record = AIResult(
        complaint_id=complaint.id,
        model_name="Samadhan-Hybrid-Triage-v2",
        predicted_category=category,
        category_confidence=round(float(classification.get("confidence", 0.85)), 4),
        urgency_score=round(float(priority_result.get("breakdown", {}).get("urgency", 1.5)), 3),
        severity_score=round(float(priority_result.get("breakdown", {}).get("severity", 1.5)), 3),
        priority_score=round(float(priority_result.get("score", 1.5)), 3),
        overridden=False,
        raw_output={
            "formula": "P = 0.30*U + 0.30*S + 0.15*C + 0.10*R + 0.10*L + 0.05*H",
            "factors": priority_result.get("breakdown", {}),
            "matched_keywords": classification.get("matched_keywords", []),
        },
    )
    session.add(ai_record)
    await session.flush()

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
    return [serialize_owner(c) for c in complaints]


# GET /public/feed
@router.get("/public/feed", response_model=List[ComplaintResponse])
async def get_public_complaints(
    category: Optional[str] = None,
    ward: Optional[str] = None,
    sort_by: str = Query("recent", pattern="^(recent|priority|upvotes)$"),
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
    return [serialize_public(c) for c in complaints]


# GET /{complaint_id}
@router.get("/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Complaint detail with full timeline. Access verified by get_visible_complaint and serialized without PII leaks."""
    complaint = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)
    return await serialize_complaint(complaint, current_user, session)


# GET /{complaint_id}/history
@router.get("/{complaint_id}/history", response_model=List[StatusLogResponse])
async def get_complaint_history(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Status timeline for a complaint. Actor UUIDs are redacted for citizens."""
    complaint = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)
    is_staff = current_user.role in (UserRole.OFFICER, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)

    return [
        StatusLogResponse(
            id=str(t.id),
            complaint_id=str(t.complaint_id),
            from_status=t.status_from,
            to_status=t.status_to,
            remarks=t.notes,
            updated_by=str(t.changed_by) if (is_staff and t.changed_by) else None,
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

        # BUG-07 FIX: Route ALL citizen uploads through process_and_store_image so
        # that EXIF metadata is stripped, perceptual hash is computed, and dedup
        # is applied — previously was writing raw bytes directly to disk.
        try:
            s3_key, file_url, file_size = await process_and_store_image(
                file=file,
                complaint_id=complaint.id,
                media_type=MediaType.PROOF_PHOTO,
            )
        except Exception as exc:
            rejected.append({"filename": file.filename, "reason": str(exc)})
            continue

        await repo.add_media_proof(
            complaint_id=complaint.id,
            media_type=MediaType.PROOF_PHOTO,
            s3_key=s3_key,
            file_name=os.path.basename(s3_key),
            file_size_bytes=file_size,
            mime_type=file.content_type or "image/jpeg",
            uploaded_by=current_user.id,
        )
        uploaded.append(file_url)

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
    payload: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Samadhan Setu Citizen Resolution Gate:
    - If satisfied=True (default when rating >= 3): stores rating/comment and closes complaint.
    - If satisfied=False: redirects citizen to Appeal Level 1 flow.
    """
    repo = ComplaintRepository(session)
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid complaint ID")

    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    user_id_str = str(user.id) if hasattr(user, "id") else str(user.get("id"))
    user_role_str = user.role.value if hasattr(user, "role") and hasattr(user.role, "value") else (user.get("role") if isinstance(user, dict) else str(user))

    if str(complaint.citizen_id) != user_id_str:
        raise HTTPException(status_code=403, detail="Only the complainant can submit resolution feedback")

    status_val = complaint.status.value if hasattr(complaint.status, "value") else str(complaint.status)
    if status_val not in ("resolved", "closed"):
        raise HTTPException(status_code=400, detail="Feedback can only be submitted after resolution (ATR)")

    rating = int(payload.get("rating", 5))
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    comment = (payload.get("feedback_text") or payload.get("comment") or "").strip()
    satisfied = payload.get("satisfied", rating >= 3)

    # Save on both Complaint columns (added in migration a1b2c3d4e5f6) and CitizenFeedback table
    complaint.citizen_rating = rating
    complaint.feedback_text = comment

    existing_fb = (
        await session.execute(
            select(CitizenFeedback).where(
                CitizenFeedback.complaint_id == cid,
                CitizenFeedback.citizen_id == uuid.UUID(user_id_str),
            )
        )
    ).scalar_one_or_none()

    if existing_fb:
        existing_fb.rating = rating
        existing_fb.comment = comment
    else:
        session.add(
            CitizenFeedback(
                complaint_id=cid,
                citizen_id=uuid.UUID(user_id_str),
                rating=rating,
                comment=comment,
            )
        )

    if satisfied and status_val == "resolved":
        await repo.add_status_transition(
            complaint_id=cid,
            from_status=complaint.status,
            to_status=ComplaintStatus.CLOSED,
            actor_id=uuid.UUID(user_id_str),
            actor_role="citizen",
            notes=f"Citizen verified ATR & closed complaint (Rating: {rating}/5). {comment}",
        )
    elif not satisfied:
        curr_level = complaint.appeal_level or 0
        if curr_level >= 2:
            raise HTTPException(
                status_code=400,
                detail="Maximum appeal level (Level 2) reached. No further appeals permitted."
            )
        next_level = curr_level + 1
        complaint.appeal_level = next_level
        target_status = ComplaintStatus.APPEALED_L2 if next_level == 2 else ComplaintStatus.APPEALED_L1

        await repo.add_status_transition(
            complaint_id=cid,
            from_status=complaint.status,
            to_status=target_status,
            actor_id=uuid.UUID(user_id_str),
            actor_role="citizen",
            notes=f"Appeal Level {next_level} triggered (Citizen unsatisfied with ATR, Rating: {rating}/5): {comment}",
            appeal_level=next_level,
        )
        complaint.sla_breached = False
        complaint.sla_deadline = datetime.now(timezone.utc) + timedelta(hours=48 if next_level == 1 else 24)

    await session.commit()
    updated = await repo.get_by_id(cid)
    return {
        "message": "Complaint closed with citizen satisfaction" if satisfied else "Appeal Level 1 registered",
        "complaint": serialize_owner(updated),
    }


@router.post("/{complaint_id}/appeal")
async def file_citizen_appeal(
    complaint_id: str,
    payload: dict,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Explicit Samadhan Setu Multi-Tier Appeal Protocol:
    - Level 1: Nodal Appellate Authority (APPEALED_L1)
    - Level 2: Sub / Appellate Authority (APPEALED_L2)
    Appeals are strictly restricted to resolved, closed, or rejected complaints.
    """
    repo = ComplaintRepository(session)
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid complaint ID")

    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    user_id_str = str(user.id) if hasattr(user, "id") else str(user.get("id"))

    if str(complaint.citizen_id) != user_id_str:
        raise HTTPException(status_code=403, detail="Only the filing citizen can lodge an appeal")

    # Enforce allowed statuses for appeal: only from RESOLVED, CLOSED, REJECTED, or existing APPEALED_L1
    valid_appeal_statuses = (
        ComplaintStatus.RESOLVED,
        ComplaintStatus.CLOSED,
        ComplaintStatus.REJECTED,
        ComplaintStatus.APPEALED,
        ComplaintStatus.APPEALED_L1,
    )
    if complaint.status not in valid_appeal_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot appeal a complaint in '{complaint.status.value}' status. Appeals are only permitted on resolved, closed, or rejected complaints."
        )

    curr_level = complaint.appeal_level or 0
    if curr_level >= 2:
        raise HTTPException(
            status_code=400,
            detail="Maximum appeal level (Level 2) reached. No further appeals permitted."
        )

    reason = (payload.get("reason") or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Please provide a clear appeal reason (at least 10 characters)")

    next_level = curr_level + 1
    authority_name = "Appellate Authority (Level 2)" if next_level == 2 else "Nodal Authority (Level 1)"
    target_status = ComplaintStatus.APPEALED_L2 if next_level == 2 else ComplaintStatus.APPEALED_L1

    complaint.appeal_level = next_level
    complaint.appeal_remarks = reason
    complaint.sla_breached = False
    complaint.sla_deadline = datetime.now(timezone.utc) + timedelta(hours=48 if next_level == 1 else 24)

    await repo.add_status_transition(
        complaint_id=cid,
        from_status=complaint.status,
        to_status=target_status,
        actor_id=uuid.UUID(user_id_str),
        actor_role="citizen",
        notes=f"[APPEAL LEVEL {next_level} -> {authority_name}] Citizen Appeal Reason: {reason}",
        appeal_level=next_level,
        appeal_remarks=reason,
    )

    await session.commit()
    updated = await repo.get_by_id(cid)
    return {
        "message": f"Appeal Level {next_level} filed with {authority_name}",
        "appeal_level": next_level,
        "authority": authority_name,
        "complaint": serialize_owner(updated),
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

    # BUG-05 FIX: Align SLA hours with canonical table in department_repo.py and
    # DeadlineTimer.jsx (72/120/168/504h). Previous values (4/24/48/72h) were wrong.
    # Score scale here is 0-10 so thresholds are proportionally adjusted.
    if final_score >= 7.0:
        band = "CRITICAL"
        sla_hours = 72    # 3 days
    elif final_score >= 5.0:
        band = "HIGH"
        sla_hours = 120   # 5 days
    elif final_score >= 3.0:
        band = "MEDIUM"
        sla_hours = 168   # 7 days
    else:
        band = "LOW"
        sla_hours = 504   # 21 days

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
