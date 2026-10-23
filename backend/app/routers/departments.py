"""
Department / Officer Router — PostgreSQL edition.
Handles officer task workflows: viewing complaints, updating status,
resolution proofs, and complaint history.
"""
import io
import os
import uuid
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session, get_db_session
from ..auth import get_current_user, require_officer, require_officer_or_admin
from ..models.orm import User, Complaint, Department, Officer
from ..models.orm.enums import ComplaintStatus, UserRole, MediaType, ComplaintPriority
from ..repositories.complaint_repo import ComplaintRepository
from ..repositories.department_repo import DepartmentRepository
from ..repositories.user_repo import UserRepository
from ..schemas import ComplaintResponse, ComplaintUpdate, StatusLogResponse
from ..services.state_machine import is_valid_transition
from ..services.media_service import process_and_store_image
from ..services.ai_bridge import get_ai_bridge
from ..config import settings

PROOF_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "proof"
)
os.makedirs(PROOF_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/department", tags=["Department"])

STATUS_LABEL_TO_ENUM = {
    "pending": ComplaintStatus.SUBMITTED,
    "submitted": ComplaintStatus.SUBMITTED,
    "verified": ComplaintStatus.VERIFIED,
    "assigned": ComplaintStatus.ASSIGNED,
    "in progress": ComplaintStatus.IN_PROGRESS,
    "in_progress": ComplaintStatus.IN_PROGRESS,
    "pending info": ComplaintStatus.PENDING_INFO,
    "pending_info": ComplaintStatus.PENDING_INFO,
    "resolved": ComplaintStatus.RESOLVED,
    "completed": ComplaintStatus.RESOLVED,
    "closed": ComplaintStatus.CLOSED,
    "reopened": ComplaintStatus.REOPENED,
    "rejected": ComplaintStatus.REJECTED,
    "escalated": ComplaintStatus.ESCALATED,
}


def _complaint_to_response(c: Complaint) -> ComplaintResponse:
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

    proof_images = []
    attachments = []
    if getattr(c, "media", None):
        for m in c.media:
            url = f"/uploads/{m.s3_key}" if not m.s3_key.startswith("http") else m.s3_key
            if m.media_type == MediaType.RESOLUTION_PHOTO:
                proof_images.append(url)
            attachments.append(url)

    return ComplaintResponse(
        id=str(c.id),
        user_id=str(c.citizen_id),
        user=user_dict,
        title=c.title,
        category=c.category,
        subcategory=c.sub_category,
        description=c.description,
        location=c.address or "",
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
        assigned_officer_id=str(c.assigned_officer_id) if c.assigned_officer_id else None,
        upvotes=c.vote_count,
        attachments=attachments,
        resolution_proof=proof_images,
        resolution_remarks=c.resolution_remarks,
        citizen_rating=c.citizen_rating,
        created_at=c.created_at,
        updated_at=c.updated_at,
        resolved_at=c.resolved_at,
        deadline=c.sla_deadline,
        status_logs=status_logs,
        status_history=status_logs,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Department complaint queue
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaints", response_model=List[ComplaintResponse])
async def get_department_complaints(
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Get complaints assigned to the current officer's department."""
    repo = ComplaintRepository(session)
    user_repo = UserRepository(session)

    # Scoping check: Admins/super-admins see all, officers are strictly scoped to department
    if current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        department_id = None
    else:
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")
        department_id = officer.department_id

    status_enum = None
    if status_filter:
        try:
            status_enum = ComplaintStatus(status_filter.lower().replace(" ", "_"))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid status: {status_filter}")

    offset = (page - 1) * per_page
    complaints, _ = await repo.list_complaints(
        department_id=department_id,
        status=status_enum,
        limit=per_page,
        offset=offset,
    )
    return [_complaint_to_response(c) for c in complaints]


# ──────────────────────────────────────────────────────────────────────────────
# Complaint detail for officers
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaints/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint_detail(
    complaint_id: str,
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Detailed complaint view for officers — includes timeline and media."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Department-scoped access check
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id or complaint.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — complaint belongs to another department")

    return _complaint_to_response(complaint)


# ──────────────────────────────────────────────────────────────────────────────
# Update complaint status
# ──────────────────────────────────────────────────────────────────────────────
@router.put("/complaints/{complaint_id}/status", response_model=ComplaintResponse)
async def update_complaint_status(
    complaint_id: str,
    update_data: ComplaintUpdate,
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Transition a complaint to a new status. Officers are department-scoped."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Department-scoped access
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id or complaint.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — complaint belongs to another department")

    if update_data.status:
        raw = update_data.status.value if hasattr(update_data.status, 'value') else str(update_data.status).strip()
        new_status = STATUS_LABEL_TO_ENUM.get(raw.lower())
        if new_status is None:
            try:
                new_status = ComplaintStatus(raw.lower().replace(" ", "_"))
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Invalid status: {update_data.status}")

        # Enforce state machine transitions for non-admin users
        if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            if not is_valid_transition(complaint.status, new_status):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status transition from '{complaint.status.value}' to '{new_status.value}'"
                )

        status_notes = update_data.remarks or update_data.notes
        await repo.add_status_transition(
            complaint,
            new_status,
            changed_by=current_user.id,
            actor_role=current_user.role.value,
            notes=status_notes,
            remarks=status_notes,
        )

    if update_data.assigned_officer_id:
        try:
            officer_id = uuid.UUID(update_data.assigned_officer_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid officer ID")
        complaint.assigned_officer_id = officer_id

    await session.commit()
    await session.refresh(complaint)
    return _complaint_to_response(complaint)


# ──────────────────────────────────────────────────────────────────────────────
# Upload site inspection proof & resolution proof
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/complaints/{complaint_id}/inspection-proof")
@router.post("/complaints/{complaint_id}/upload-inspection")
@router.post("/tasks/{complaint_id}/inspection-proof")
async def upload_inspection_proof(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload preliminary site inspection proof photos before commencing work (officers only)."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Task not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Task not found")

    # Department-scoped access check
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id or complaint.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — task belongs to another department")

    uploaded, rejected = [], []
    for file in files[:5]:
        if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
            rejected.append({"filename": file.filename, "reason": "Unsupported file type"})
            continue

        try:
            s3_key, file_url, file_size = await process_and_store_image(
                file=file,
                complaint_id=complaint.id,
                media_type=MediaType.INSPECTION_PHOTO,
            )
            await repo.add_media_proof(
                complaint_id=complaint.id,
                media_type=MediaType.INSPECTION_PHOTO,
                s3_key=s3_key,
                file_name=os.path.basename(s3_key),
                file_size_bytes=file_size,
                mime_type=file.content_type or "image/jpeg",
                uploaded_by=current_user.id,
            )
            uploaded.append(file_url)
        except Exception as e:
            rejected.append({"filename": file.filename, "reason": str(e)})

    await session.commit()
    return {"message": f"Uploaded {len(uploaded)} site inspection proof image(s).", "uploaded": uploaded, "rejected": rejected}


@router.post("/complaints/{complaint_id}/resolution-proof")
@router.post("/complaints/{complaint_id}/upload-proof")
@router.post("/tasks/{complaint_id}/resolution-proof")
@router.post("/tasks/{complaint_id}/upload-proof")
async def upload_resolution_proof(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload resolution proof images for a complaint (officers only)."""
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Complaint not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Department-scoped access check
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id or complaint.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — complaint belongs to another department")

    # Load the most recent Inspection ('Before') photo bytes if present for forensic comparison
    from pathlib import Path
    from app.services.media_service import verify_before_after_authenticity, UPLOADS_DIR

    before_bytes = None
    inspection_media = [
        m for m in (complaint.media or [])
        if m.media_type == MediaType.INSPECTION_PHOTO
        or (m.media_type == MediaType.RESOLUTION_PHOTO and "inspection" in (getattr(m, "file_url", "") or getattr(m, "s3_key", "")))
        or (hasattr(m, "s3_key") and "inspection" in m.s3_key)
    ]
    if inspection_media:
        latest_before_url = getattr(inspection_media[-1], "file_url", "") or getattr(inspection_media[-1], "s3_key", "")
        local_rel_path = latest_before_url.lstrip("/")
        if Path(local_rel_path).is_file():
            before_bytes = Path(local_rel_path).read_bytes()
        elif (Path(UPLOADS_DIR) / latest_before_url).is_file():
            before_bytes = (Path(UPLOADS_DIR) / latest_before_url).read_bytes()

    uploaded, rejected = [], []
    for file in files[:5]:
        if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
            rejected.append({"filename": file.filename, "reason": "Unsupported file type"})
            continue

        raw_after_bytes = await file.read()
        await file.seek(0)

        forensic_check = verify_before_after_authenticity(before_bytes, raw_after_bytes)
        if not forensic_check["verified"]:
            raise HTTPException(
                status_code=400,
                detail=f"Forensic Visual Verification Failed: {forensic_check['reason']}",
            )

        try:
            s3_key, file_url, file_size = await process_and_store_image(
                file=file,
                complaint_id=complaint.id,
                media_type=MediaType.RESOLUTION_PHOTO,
            )
            await repo.add_media_proof(
                complaint_id=complaint.id,
                media_type=MediaType.RESOLUTION_PHOTO,
                s3_key=s3_key,
                file_name=os.path.basename(s3_key),
                file_size_bytes=file_size,
                mime_type=file.content_type or "image/jpeg",
                uploaded_by=current_user.id,
            )
            uploaded.append(file_url)
        except HTTPException:
            raise
        except Exception as e:
            rejected.append({"filename": file.filename, "reason": str(e)})

    await session.commit()
    return {"message": f"Uploaded {len(uploaded)} proof image(s).", "uploaded": uploaded, "rejected": rejected}


# ──────────────────────────────────────────────────────────────────────────────
# Department stats (officer-facing)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/stats")
async def get_department_stats(
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Summary stats for the officer's department."""
    user_repo = UserRepository(session)
    if current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        dept_id = None
    else:
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")
        dept_id = officer.department_id

    base_q = select(Complaint)
    if dept_id and current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        base_q = base_q.where(Complaint.department_id == dept_id)

    total_res = await session.execute(select(func.count()).select_from(base_q.subquery()))
    total = total_res.scalar() or 0

    stats = {}
    for s in ComplaintStatus:
        q = select(func.count()).where(Complaint.status == s)
        if dept_id and current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            q = q.where(Complaint.department_id == dept_id)
        res = await session.execute(q)
        stats[s.value] = res.scalar() or 0

    return {"total": total, "by_status": stats, "department_id": str(dept_id) if dept_id else None}


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard metrics (alias used by the Officer Task Desk frontend)
# Returns task-centric counts that map to complaint statuses.
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/dashboard/metrics")
async def get_dashboard_metrics(
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Dashboard summary counts for the officer's department task desk."""
    user_repo = UserRepository(session)
    if current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        dept_id = None
    else:
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")
        dept_id = officer.department_id

    def _count_q(st: ComplaintStatus):
        q = select(func.count()).where(Complaint.status == st)
        if dept_id and current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            q = q.where(Complaint.department_id == dept_id)
        return q

    total_q = select(func.count(Complaint.id))
    if dept_id and current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        total_q = total_q.where(Complaint.department_id == dept_id)

    total = (await session.execute(total_q)).scalar() or 0
    # "Pending" = SUBMITTED + VERIFIED + REOPENED + PENDING_INFO
    submitted = (await session.execute(_count_q(ComplaintStatus.SUBMITTED))).scalar() or 0
    verified = (await session.execute(_count_q(ComplaintStatus.VERIFIED))).scalar() or 0
    reopened = (await session.execute(_count_q(ComplaintStatus.REOPENED))).scalar() or 0
    pending_info = (await session.execute(_count_q(ComplaintStatus.PENDING_INFO))).scalar() or 0
    pending = submitted + verified + reopened + pending_info
    assigned = (await session.execute(_count_q(ComplaintStatus.ASSIGNED))).scalar() or 0
    in_progress = (await session.execute(_count_q(ComplaintStatus.IN_PROGRESS))).scalar() or 0
    resolved = (await session.execute(_count_q(ComplaintStatus.RESOLVED))).scalar() or 0
    closed = (await session.execute(_count_q(ComplaintStatus.CLOSED))).scalar() or 0

    return {
        "total_tasks": total,
        "pending": pending,
        "assigned": assigned,
        "in_progress": in_progress,
        "completed": resolved + closed,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Task aliases — the Officer Task Desk frontend uses /tasks instead of
# /complaints. These endpoints adapt the existing complaint data into a
# task-shaped response the UI expects.
# ──────────────────────────────────────────────────────────────────────────────

def _complaint_to_task(c: Complaint, dept_name: str = "") -> dict:
    """Map a Complaint ORM object to the task-shaped dict the frontend needs."""
    # Map frontend filter labels → ComplaintStatus values
    status_label_map = {
        ComplaintStatus.SUBMITTED: "Pending",
        ComplaintStatus.VERIFIED: "Pending",
        ComplaintStatus.ASSIGNED: "Assigned",
        ComplaintStatus.IN_PROGRESS: "In Progress",
        ComplaintStatus.RESOLVED: "Completed",
        ComplaintStatus.CLOSED: "Completed",
        ComplaintStatus.REJECTED: "Rejected",
        ComplaintStatus.ESCALATED: "In Progress",
        ComplaintStatus.REOPENED: "Pending",
        ComplaintStatus.PENDING_INFO: "Pending",
    }
    proof_images = []
    inspection_images = []
    attachments = []
    if getattr(c, "media", None):
        for m in c.media:
            url = getattr(m, "file_url", None) or (f"/uploads/{m.s3_key}" if m.s3_key and not m.s3_key.startswith("http") else (m.s3_key or ""))
            media_item = {
                "id": str(m.id),
                "url": url,
                "file_name": m.file_name,
                "media_type": m.media_type.value if hasattr(m.media_type, "value") else str(m.media_type),
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            if (
                m.media_type == MediaType.INSPECTION_PHOTO
                or m.media_type == MediaType.PROOF_PHOTO
                or (m.media_type == MediaType.RESOLUTION_PHOTO and "inspection" in (url or "").lower())
            ):
                inspection_images.append(url)
            elif m.media_type == MediaType.RESOLUTION_PHOTO and "inspection" not in (url or "").lower():
                proof_images.append(url)
            attachments.append(media_item)

    return {
        "id": str(c.id),
        "status": status_label_map.get(c.status, c.status.value),
        "raw_status": c.status.value if hasattr(c.status, "value") else str(c.status),
        "category": c.category,
        "complaint_title": c.title,
        "complaint_description": c.description,
        "complaint_location": c.address or (f"{c.latitude},{c.longitude}" if c.latitude else ""),
        "complaint_priority": c.priority.value.capitalize() if c.priority else "Low",
        "department_name": dept_name,
        "notes": c.resolution_remarks or "",
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "completed_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "priority_score": c.priority_score,
        "sla_deadline": c.sla_deadline.isoformat() if c.sla_deadline else None,
        "proof_images": proof_images,
        "inspection_images": inspection_images,
        "attachments": attachments,
    }

_complaint_to_dict = _complaint_to_task



# Status label → ComplaintStatus enum mapping for incoming filter values
_TASK_STATUS_TO_COMPLAINT = {
    "pending": ComplaintStatus.SUBMITTED,
    "assigned": ComplaintStatus.ASSIGNED,
    "in progress": ComplaintStatus.IN_PROGRESS,
    "completed": None,  # handled specially (RESOLVED + CLOSED)
    "rejected": ComplaintStatus.REJECTED,
}


@router.get("/tasks")
async def get_tasks(
    status_filter: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Task queue for the Officer Task Desk.
    Wraps /complaints with a task-shaped response and frontend-compatible
    status label filtering (Pending, Assigned, In Progress, Completed, Rejected).
    """
    user_repo = UserRepository(session)
    dept_repo = DepartmentRepository(session)

    if current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        department_id = None
    else:
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")
        department_id = officer.department_id

    # Resolve department name once
    dept_name = ""
    if department_id:
        dept = await dept_repo.get_by_id(department_id)
        dept_name = dept.name if dept else ""

    repo = ComplaintRepository(session)
    offset = (page - 1) * per_page

    # Map frontend status label to DB enum(s)
    status_enum = None
    if status_filter:
        key = status_filter.lower()
        if key == "completed":
            # "Completed" covers both RESOLVED and CLOSED
            complaints_resolved, _ = await repo.list_complaints(
                department_id=department_id,
                status=ComplaintStatus.RESOLVED,
                limit=per_page,
                offset=offset,
            )
            complaints_closed, _ = await repo.list_complaints(
                department_id=department_id,
                status=ComplaintStatus.CLOSED,
                limit=per_page,
                offset=offset,
            )
            all_complaints = complaints_resolved + complaints_closed
            return [_complaint_to_task(c, dept_name) for c in all_complaints]
        elif key in _TASK_STATUS_TO_COMPLAINT:
            status_enum = _TASK_STATUS_TO_COMPLAINT[key]

    complaints, _ = await repo.list_complaints(
        department_id=department_id,
        status=status_enum,
        limit=per_page,
        offset=offset,
    )
    return [_complaint_to_task(c, dept_name) for c in complaints]


@router.put("/tasks/{task_id}/status")
async def update_task_status(
    task_id: str,
    update_data: ComplaintUpdate,
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Update task status from the Officer Task Desk.
    Translates task-UI status labels back to ComplaintStatus enums.
    """
    # Label → enum mapping (frontend sends label strings like "In Progress")
    label_to_enum = {
        "pending": ComplaintStatus.SUBMITTED,
        "assigned": ComplaintStatus.ASSIGNED,
        "in progress": ComplaintStatus.IN_PROGRESS,
        "completed": ComplaintStatus.RESOLVED,
        "rejected": ComplaintStatus.REJECTED,
    }

    try:
        cid = uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Task not found")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Task not found")

    # Department-scoped access
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id or complaint.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — task belongs to another department")

    if update_data.status:
        raw = update_data.status.value if hasattr(update_data.status, "value") else str(update_data.status).strip()
        new_status = STATUS_LABEL_TO_ENUM.get(raw.lower())
        if new_status is None:
            try:
                new_status = ComplaintStatus(raw.lower().replace(" ", "_"))
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Invalid status: {raw}")

        # Enforce state machine transitions for non-admin users
        if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            if not is_valid_transition(complaint.status, new_status):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status transition from '{complaint.status.value}' to '{new_status.value}'"
                )

        status_notes = update_data.remarks or update_data.notes or f"Status updated to {raw}"
        await repo.add_status_transition(
            complaint,
            new_status,
            changed_by=current_user.id,
            actor_role=current_user.role.value,
            notes=status_notes,
            remarks=update_data.remarks or update_data.notes,
        )

    await session.commit()

    user_repo2 = UserRepository(session)
    dept_repo = DepartmentRepository(session)
    off2 = await user_repo2.get_officer_by_user_id(current_user.id)
    dept_name = ""
    if off2 and off2.department_id:
        dept = await dept_repo.get_by_id(off2.department_id)
        dept_name = dept.name if dept else ""

    await session.refresh(complaint)
    return _complaint_to_task(complaint, dept_name)


@router.post("/tasks/{task_id}/assign")
async def assign_task(
    task_id: str,
    officer_id: str = Query(...),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Assign a task (complaint) to a specific officer in the same department."""
    try:
        cid = uuid.UUID(task_id)
        oid = uuid.UUID(officer_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid task or officer ID")

    repo = ComplaintRepository(session)
    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Task not found")

    user_repo = UserRepository(session)
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id or complaint.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — task belongs to another department")

    # Verify target officer exists and belongs to this complaint's department
    target_officer = await user_repo.get_officer_by_id(oid)
    if not target_officer:
        raise HTTPException(status_code=404, detail="Target officer not found")
    if complaint.department_id and target_officer.department_id != complaint.department_id:
        raise HTTPException(status_code=400, detail="Target officer does not belong to this department")

    complaint.assigned_officer_id = oid
    await session.commit()
    await session.refresh(complaint)
    return {"message": "Task assigned successfully", "task_id": task_id, "officer_id": officer_id}


@router.post("/complaints/{complaint_id}/confirm-triage")
async def confirm_or_override_triage(
    complaint_id: str,
    payload: dict,
    user: User = Depends(require_officer_or_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Nodal officer confirms AI triage or overrides Category / Priority / Department
    with a mandatory reason (logged to AIResult for real Override Rate tracking).
    """
    repo = ComplaintRepository(session)
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid complaint ID")

    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    new_category = payload.get("category", complaint.category)
    curr_priority_val = complaint.priority.value if hasattr(complaint.priority, "value") else str(complaint.priority)
    new_priority = payload.get("priority", curr_priority_val)
    override_reason = (payload.get("override_reason") or "").strip()

    is_override = (
        new_category != complaint.category
        or new_priority.lower() != curr_priority_val.lower()
    )
    if is_override and not override_reason:
        raise HTTPException(
            status_code=400,
            detail="An override_reason is required when overriding AI category or priority.",
        )

    complaint.category = new_category
    try:
        complaint.priority = ComplaintPriority(new_priority.lower())
    except ValueError:
        pass

    # Record human-in-the-loop decision on latest AIResult if exists
    if getattr(complaint, "ai_results", None):
        latest_ai = complaint.ai_results[0]
        if hasattr(latest_ai, "overridden"):
            latest_ai.overridden = is_override
        if is_override and hasattr(latest_ai, "override_reason"):
            latest_ai.override_reason = override_reason

    from_status = complaint.status
    target_status = ComplaintStatus.ASSIGNED if from_status == ComplaintStatus.SUBMITTED else from_status
    user_id = user.id if hasattr(user, "id") else (uuid.UUID(str(user["id"])) if isinstance(user, dict) else user)
    user_role = user.role.value if hasattr(user, "role") and hasattr(user.role, "value") else (user.get("role") if isinstance(user, dict) else str(user))

    await repo.add_status_transition(
        complaint_id=cid,
        from_status=from_status,
        to_status=target_status,
        actor_id=user_id,
        actor_role=user_role,
        notes=(
            f"Nodal Triage Override ({override_reason}): Category={new_category}, Priority={new_priority}"
            if is_override
            else f"Nodal Officer confirmed AI Triage: Category={new_category}, Priority={new_priority}"
        ),
    )
    await session.commit()
    updated = await repo.get_by_id(cid)
    return {"message": "Triage confirmed", "overridden": is_override, "complaint": _complaint_to_dict(updated)}


@router.post("/complaints/{complaint_id}/generate-atr")
async def generate_smart_atr_draft(
    complaint_id: str,
    user: dict = Depends(require_officer_or_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    AI Copilot for Officers: Generates a structured, official Action Taken Report (ATR)
    from complaint metadata, inspection timeline, and uploaded visual proofs.
    """
    repo = ComplaintRepository(session)
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid complaint ID")

    c = await repo.get_by_id(cid)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    dept_name = c.department.name if getattr(c, "department", None) else "Assigned Municipal Department"
    has_inspection = any(m.media_type == MediaType.INSPECTION_PHOTO for m in (c.media or []))
    has_resolution = any(m.media_type == MediaType.RESOLUTION_PHOTO for m in (c.media or []))

    atr_draft = (
        f"OFFICIAL ACTION TAKEN REPORT (ATR) — REF: #{str(c.id)[:8].upper()}\n"
        f"• Department: {dept_name}\n"
        f"• Category & Ward: {c.category} | {c.ward or 'Municipal Zone'}\n"
        f"• Field Inspection: {'Completed with geo-tagged Before-Photo evidence' if has_inspection else 'Site inspected by field team'}.\n"
        f"• Remedial Action: Technical rectification of '{c.title}' has been executed on-site in accordance with municipal SLA guidelines.\n"
        f"• Visual Verification: {'Post-resolution After-Photo uploaded and verified' if has_resolution else 'Pending final photo upload'}.\n"
        f"• Citizen Closure Notice: Grievance is marked RESOLVED. Citizen may verify and close, or file a Level-1 Appeal within 7 days."
    )
    return {"atr_draft": atr_draft}


@router.post("/complaints/{complaint_id}/adjudicate-appeal")
async def adjudicate_citizen_appeal(
    complaint_id: str,
    payload: dict,
    user: dict = Depends(require_officer_or_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Completes the Samadhan Setu Appellate Ladder Protocol (Appeal L1 / L2 -> Final Resolution or Rework):
    - decision = 'reopen_rework': Sends back to field team (IN_PROGRESS) with fresh 24h SLA.
    - decision = 'final_close': Appellate Authority upholds resolution with final binding order (CLOSED).
    """
    repo = ComplaintRepository(session)
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid complaint ID")

    complaint = await repo.get_by_id(cid)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    decision = (payload.get("decision") or "reopen_rework").lower()
    order_notes = (payload.get("notes") or "").strip()
    if len(order_notes) < 10:
        raise HTTPException(status_code=400, detail="Appellate order remarks (min 10 chars) are required.")

    if decision == "final_close":
        target_status = ComplaintStatus.CLOSED
        timeline_note = f"[FINAL APPELLATE RESOLUTION] Appellate Authority issued final closure order: {order_notes}"
    else:
        target_status = ComplaintStatus.IN_PROGRESS
        complaint.sla_breached = False
        complaint.sla_deadline = datetime.now(timezone.utc) + timedelta(hours=24)
        timeline_note = f"[APPEAL UPHELD — REOPENED FOR FIELD REWORK] Appellate Authority ordered immediate rework (24h SLA): {order_notes}"

    user_id = user.id if hasattr(user, "id") else (uuid.UUID(str(user["id"])) if isinstance(user, dict) else user)
    user_role = user.role.value if hasattr(user, "role") and hasattr(user.role, "value") else (user.get("role") if isinstance(user, dict) else str(user))

    await repo.add_status_transition(
        complaint_id=cid,
        from_status=complaint.status,
        to_status=target_status,
        actor_id=user_id,
        actor_role=user_role,
        notes=timeline_note,
    )
    await session.commit()
    updated = await repo.get_by_id(cid)
    return {
        "message": "Appellate order recorded",
        "decision": decision,
        "complaint": _complaint_to_task(updated),
    }


@router.post("/complaints/{complaint_id}/swarm-resolve")
async def swarm_cascade_resolve_duplicates(
    complaint_id: str,
    payload: dict = None,
    user: dict = Depends(require_officer_or_admin),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Samadhan Setu Smart Swarm Resolution:
    Finds all open complaints in the same category and ward/vicinity with high semantic
    similarity to this resolved complaint, links their resolution proof, and cascades
    the Action Taken Report (ATR) in one atomic operation.
    """
    payload = payload or {}
    repo = ComplaintRepository(session)
    try:
        cid = uuid.UUID(complaint_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid complaint ID")

    master = await repo.get_by_id(cid)
    if not master:
        raise HTTPException(status_code=404, detail="Master complaint not found")

    # Find open candidate complaints in the same category
    stmt = (
        select(Complaint)
        .options(selectinload(Complaint.media), selectinload(Complaint.timeline))
        .where(
            Complaint.id != cid,
            Complaint.category == master.category,
            Complaint.status.in_([
                ComplaintStatus.SUBMITTED,
                ComplaintStatus.ASSIGNED,
                ComplaintStatus.IN_PROGRESS,
            ]),
        )
        .limit(50)
    )
    candidates = (await session.execute(stmt)).scalars().all()

    bridge = get_ai_bridge()
    master_text = f"{master.title}. {master.description}"
    cascaded_ids = []

    user_id = user.id if hasattr(user, "id") else (uuid.UUID(str(user["id"])) if isinstance(user, dict) else user)
    user_role = user.role.value if hasattr(user, "role") and hasattr(user.role, "value") else (user.get("role") if isinstance(user, dict) else str(user))

    for cand in candidates:
        # Check ward match or proximity (~1 km bounding box)
        same_ward = bool(master.ward and cand.ward and master.ward.lower() == cand.ward.lower())
        near_coords = (
            abs((master.latitude or 0) - (cand.latitude or 0)) <= 0.01
            and abs((master.longitude or 0) - (cand.longitude or 0)) <= 0.01
        )
        if not (same_ward or near_coords):
            continue

        cand_text = f"{cand.title}. {cand.description}"
        sim_res = bridge.check_Duplicates(
            cand_text,
            [{"id": str(master.id), "text": master_text}],
            threshold=0.60,
        )
        if sim_res.get("is_duplicate") or same_ward:
            cand.resolution_notes = (
                f"[SWARM CASCADE ATR — Linked to Primary Incident {master.complaint_number}]\n"
                f"{master.resolution_notes or 'Resolved via coordinated municipal field operation.'}"
            )
            await repo.add_status_transition(
                complaint_id=cand.id,
                from_status=cand.status,
                to_status=ComplaintStatus.RESOLVED,
                actor_id=user_id,
                actor_role=user_role,
                notes=f"Auto-resolved via Smart Swarm Cascade from Primary Incident {master.complaint_number}.",
            )
            cascaded_ids.append(cand.complaint_number)

    await session.commit()
    return {
        "message": f"Swarm Cascade completed: {len(cascaded_ids)} linked complaints resolved.",
        "master_complaint": master.complaint_number,
        "cascaded_count": len(cascaded_ids),
        "cascaded_complaint_numbers": cascaded_ids,
    }




