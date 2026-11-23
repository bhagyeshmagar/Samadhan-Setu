"""
Multi-Role Departmental Governance Workflow Router (PostgreSQL / FastAPI)
Implements the 8-step grievance redressal lifecycle with strict task isolation:
  - Nodal Officer (/api/workflow/nodal/*)
  - Inspection Officer (/api/workflow/inspector/*) — strictly isolated to assigned complaints
  - Field Team Lead (/api/workflow/team/*) — strictly isolated to own team's complaints
"""
from __future__ import annotations

import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    require_inspection_officer,
    require_nodal_officer,
    require_team_lead,
)
from app.db.session import get_async_session
from app.models.orm import (
    AuditLog,
    Complaint,
    ComplaintMedia,
    ComplaintPriority,
    ComplaintStatus,
    ComplaintTimeline,
    MediaType,
    Officer,
    Team,
    User,
)
from app.services.state_machine import is_valid_transition

router = APIRouter(prefix="/api/workflow", tags=["Multi-Role Workflow"])

MAX_PROOF_BYTES = 5 * 1024 * 1024
MAX_PROOF_FILES = 4
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_GPS_SOURCES = {"live_gps", "exif_gps", "manual_pin", "manual_fallback"}


def _detect_image_magic_type(raw: bytes) -> Optional[str]:
    if not raw or len(raw) < 12:
        return None
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def _validate_gps_metadata(
    latitude: Optional[float],
    longitude: Optional[float],
    gps_accuracy: Optional[float] = None,
    gps_source: Optional[str] = None,
    *,
    required: bool = True,
) -> tuple[Optional[float], Optional[float], Optional[float], str]:
    if latitude is None and longitude is None:
        if required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="GPS latitude and longitude coordinates are required.",
            )
        return None, None, None, "manual_fallback"
    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both latitude and longitude must be provided together.",
        )
    if not (-90.0 <= latitude <= 90.0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Latitude must be between -90 and 90 degrees.",
        )
    if not (-180.0 <= longitude <= 180.0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Longitude must be between -180 and 180 degrees.",
        )

    clean_accuracy: Optional[float] = None
    if gps_accuracy is not None and 0.0 <= gps_accuracy <= 100000.0:
        clean_accuracy = round(gps_accuracy, 1)

    norm_source = (gps_source or "live_gps").strip().lower()
    if norm_source == "gps":
        norm_source = "live_gps"
    if norm_source not in ALLOWED_GPS_SOURCES:
        norm_source = "manual_fallback"

    return round(latitude, 6), round(longitude, 6), clean_accuracy, norm_source


def compute_distance_meters(
    lat1: Optional[float],
    lon1: Optional[float],
    lat2: Optional[float],
    lon2: Optional[float],
) -> Optional[int]:
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))
    return int(round(r * c))


async def _get_officer_profile(session: AsyncSession, user: User) -> Officer:
    res = await session.execute(select(Officer).where(Officer.user_id == user.id))
    officer = res.scalars().first()
    if not officer or not officer.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active departmental officer profile is required.",
        )
    return officer


async def _save_proof_upload(
    session: AsyncSession,
    complaint: Complaint,
    uploader: User,
    media_type: MediaType,
    file: UploadFile,
    latitude: Optional[float],
    longitude: Optional[float],
    device_info: str,
    captured_at: Optional[datetime] = None,
) -> ComplaintMedia:
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid image file (JPEG, PNG, or WEBP) is required as proof.",
        )
    if file.content_type and file.content_type.lower() not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only raster image files (JPEG, PNG, or WEBP) are permitted as proof.",
        )
    raw = await file.read()
    if not raw or len(raw) > MAX_PROOF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Proof photo must be non-empty and under 5 MB.",
        )
    detected_mime = _detect_image_magic_type(raw)
    if not detected_mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File failed image integrity check. Upload a genuine JPEG, PNG, or WEBP photo.",
        )

    mime_to_ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    ext = mime_to_ext.get(detected_mime, ".jpg")

    safe_name = f"{media_type.value}_{complaint.id}_{uuid.uuid4().hex[:8]}{ext}"
    upload_dir = os.path.realpath(
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "uploads",
            "proofs",
        )
    )
    os.makedirs(upload_dir, exist_ok=True)
    disk_path = os.path.realpath(os.path.join(upload_dir, safe_name))
    if not disk_path.startswith(upload_dir + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid upload path.")
    with open(disk_path, "wb") as out:
        out.write(raw)

    media = ComplaintMedia(
        complaint_id=complaint.id,
        media_type=media_type,
        s3_key=f"proofs/{safe_name}",
        file_name=os.path.basename(file.filename or safe_name)[:120],
        file_size_bytes=len(raw),
        mime_type=detected_mime,
        latitude=latitude,
        longitude=longitude,
        captured_at=captured_at or datetime.now(timezone.utc),
        device_info=device_info[:250],
        has_watermark=True,
        uploaded_by=uploader.id,
    )
    session.add(media)
    return media


async def _collect_proof_files(
    files: Optional[list[UploadFile]],
    file: Optional[UploadFile],
) -> list[UploadFile]:
    collected: list[UploadFile] = []
    if files:
        collected.extend(f for f in files if f is not None)
    if file is not None:
        collected.append(file)
    if len(collected) > MAX_PROOF_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can upload at most {MAX_PROOF_FILES} proof photos per submission.",
        )
    return collected


async def _serialize_complaint(session: AsyncSession, c: Complaint) -> dict:
    media_res = await session.execute(
        select(ComplaintMedia)
        .where(ComplaintMedia.complaint_id == c.id)
        .order_by(ComplaintMedia.created_at.desc())
    )
    media_rows = media_res.scalars().all()
    grouped = {
        "citizen": [],
        "inspection": [],
        "resolution": [],
        "verification": [],
    }
    for m in media_rows:
        item = {
            "id": str(m.id),
            "media_type": m.media_type.value,
            "file_name": m.file_name,
            "s3_key": m.s3_key,
            "latitude": m.latitude,
            "longitude": m.longitude,
            "distance_from_citizen_m": compute_distance_meters(
                c.latitude, c.longitude, m.latitude, m.longitude
            ),
            "captured_at": m.captured_at.isoformat() if m.captured_at else None,
        }
        if m.media_type == MediaType.PROOF_PHOTO:
            grouped["citizen"].append(item)
        elif m.media_type == MediaType.INSPECTION_PHOTO:
            grouped["inspection"].append(item)
        elif m.media_type == MediaType.RESOLUTION_PHOTO:
            grouped["resolution"].append(item)
        elif m.media_type == MediaType.VERIFICATION_PHOTO:
            grouped["verification"].append(item)

    return {
        "id": str(c.id),
        "complaint_number": c.complaint_number,
        "title": c.title,
        "description": c.description,
        "category": c.category,
        "priority": c.priority.value if c.priority else "medium",
        "status": c.status.value if c.status else "submitted",
        "address": c.address,
        "ward": c.ward,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "department_id": str(c.department_id) if c.department_id else None,
        "nodal_officer_id": str(c.nodal_officer_id) if c.nodal_officer_id else None,
        "assigned_inspector_id": str(c.assigned_inspector_id) if c.assigned_inspector_id else None,
        "verification_inspector_id": str(c.verification_inspector_id) if c.verification_inspector_id else None,
        "assigned_team_id": str(c.assigned_team_id) if c.assigned_team_id else None,
        "rework_reason": c.rework_reason,
        "resolution_remarks": c.resolution_remarks,
        "sla_deadline": c.sla_deadline.isoformat() if c.sla_deadline else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "proofs": grouped,
    }


def _record_transition(
    session: AsyncSession,
    complaint: Complaint,
    old_status: str,
    new_status: str,
    actor: User,
    notes: str,
    action: str,
    details: Optional[dict] = None,
) -> None:
    session.add(
        ComplaintTimeline(
            complaint_id=complaint.id,
            status_from=old_status,
            status_to=new_status,
            changed_by=actor.id,
            actor_role=actor.role.value,
            notes=notes,
        )
    )
    session.add(
        AuditLog(
            action=action,
            entity_type="complaint",
            entity_id=str(complaint.id),
            actor_id=actor.id,
            actor_role=actor.role.value,
            details=details or {"from": old_status, "to": new_status},
        )
    )


PRIORITY_SLA_HOURS = {
    "critical": (24, 4.5),
    "high": (48, 3.5),
    "medium": (72, 2.5),
    "low": (168, 1.5),
}


def _apply_assignment_priority(complaint: Complaint, priority_value: Optional[str]) -> Optional[str]:
    if not priority_value:
        return None
    normalized = priority_value.strip().lower()
    if normalized not in PRIORITY_SLA_HOURS:
        raise HTTPException(
            status_code=400,
            detail="Invalid priority level. Must be one of: low, medium, high, critical.",
        )
    sla_hours, score = PRIORITY_SLA_HOURS[normalized]
    complaint.priority = ComplaintPriority(normalized)
    complaint.priority_score = score
    complaint.sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_hours)
    return f" [Priority: {normalized.upper()} · {sla_hours}h SLA]"


# ─── Request Schemas ──────────────────────────────────────────────────────────

class AssignInspectorRequest(BaseModel):
    inspector_id: uuid.UUID
    notes: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high|critical)$")


class ReviewInspectionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approve|rework|reassign)$")
    reason: Optional[str] = None
    new_inspector_id: Optional[uuid.UUID] = None


class AssignTeamRequest(BaseModel):
    team_id: uuid.UUID
    notes: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high|critical)$")


class FinalDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(approve|rework_team|reassign_team|reverify)$")
    reason: Optional[str] = None
    new_team_id: Optional[uuid.UUID] = None
    new_inspector_id: Optional[uuid.UUID] = None


# ─── NODAL OFFICER ENDPOINTS ──────────────────────────────────────────────────

@router.get("/nodal/dashboard")
async def nodal_dashboard(
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    officer = await _get_officer_profile(session, current_user)
    dept_id = officer.department_id

    c_res = await session.execute(
        select(Complaint)
        .where(Complaint.department_id == dept_id)
        .order_by(Complaint.created_at.desc())
    )
    complaints = c_res.scalars().all()
    serialized = [await _serialize_complaint(session, c) for c in complaints]

    insp_res = await session.execute(
        select(Officer, User)
        .join(User, Officer.user_id == User.id)
        .where(
            Officer.department_id == dept_id,
            Officer.is_active.is_(True),
            Officer.officer_role == "inspection_officer",
        )
    )
    inspectors = [
        {
            "id": str(off.id),
            "name": u.name,
            "email": u.email,
            "designation": off.designation,
            "active_tasks": off.current_active_count,
        }
        for off, u in insp_res.all()
    ]

    teams_res = await session.execute(
        select(Team).where(Team.department_id == dept_id, Team.is_active.is_(True))
    )
    teams = [
        {
            "id": str(t.id),
            "name": t.name,
            "code": t.code,
            "active_tasks": t.active_tasks,
            "daily_capacity": t.daily_capacity,
            "ward_coverage": t.ward_coverage or [],
        }
        for t in teams_res.scalars().all()
    ]

    return {
        "department_id": str(dept_id),
        "complaints": serialized,
        "inspectors": inspectors,
        "teams": teams,
    }


@router.get("/nodal/complaints/{complaint_id}/history")
async def nodal_complaint_history(
    complaint_id: uuid.UUID,
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    nodal = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.department_id != nodal.department_id:
        raise HTTPException(status_code=403, detail="Complaint belongs to another department.")

    timeline_res = await session.execute(
        select(ComplaintTimeline)
        .where(ComplaintTimeline.complaint_id == complaint.id)
        .order_by(ComplaintTimeline.created_at.asc())
    )
    audit_res = await session.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "complaint", AuditLog.entity_id == str(complaint.id))
        .order_by(AuditLog.created_at.asc())
    )
    status_history = [
        {
            "id": str(item.id),
            "from_status": item.status_from,
            "to_status": item.status_to,
            "actor_role": item.actor_role,
            "remarks": item.notes or "",
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in timeline_res.scalars().all()
    ]
    audit_logs = [
        {
            "id": str(log.id),
            "action": log.action,
            "actor_role": log.actor_role,
            "details": log.details or {},
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in audit_res.scalars().all()
    ]
    return {
        "complaint_id": str(complaint.id),
        "complaint_number": complaint.complaint_number,
        "title": complaint.title,
        "status": complaint.status.value,
        "priority": complaint.priority.value,
        "sla_deadline": complaint.sla_deadline.isoformat() if complaint.sla_deadline else None,
        "created_at": complaint.created_at.isoformat() if complaint.created_at else None,
        "status_history": status_history,
        "audit_logs": audit_logs,
    }


@router.post("/nodal/complaints/{complaint_id}/assign-inspector")
async def nodal_assign_inspector(
    complaint_id: uuid.UUID,
    payload: AssignInspectorRequest,
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    nodal = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.department_id != nodal.department_id:
        raise HTTPException(status_code=403, detail="Complaint belongs to another department.")

    inspector = await session.get(Officer, payload.inspector_id)
    if (
        not inspector
        or not inspector.is_active
        or inspector.department_id != nodal.department_id
        or inspector.officer_role != "inspection_officer"
    ):
        raise HTTPException(status_code=400, detail="Selected inspection officer is invalid for this department.")

    old_status = complaint.status.value
    new_status = ComplaintStatus.INSPECTION_ASSIGNED.value
    if not is_valid_transition(old_status, new_status):
        raise HTTPException(status_code=400, detail=f"Cannot assign inspector from state '{old_status}'.")

    priority_suffix = _apply_assignment_priority(complaint, payload.priority) or ""
    complaint.status = ComplaintStatus.INSPECTION_ASSIGNED
    complaint.nodal_officer_id = nodal.id
    complaint.assigned_inspector_id = inspector.id
    complaint.rework_reason = None
    _record_transition(
        session,
        complaint,
        old_status,
        new_status,
        current_user,
        (payload.notes or "Assigned site inspection to Inspection Officer.") + priority_suffix,
        "assign_inspector",
        {"inspector_id": str(inspector.id), "priority": complaint.priority.value},
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/nodal/complaints/{complaint_id}/review-inspection")
async def nodal_review_inspection(
    complaint_id: uuid.UUID,
    payload: ReviewInspectionRequest,
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    nodal = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.department_id != nodal.department_id:
        raise HTTPException(status_code=403, detail="Complaint belongs to another department.")

    old_status = complaint.status.value
    if old_status != ComplaintStatus.INSPECTION_SUBMITTED.value:
        raise HTTPException(status_code=400, detail="Inspection proof must be submitted before review.")

    if payload.decision == "approve":
        complaint.status = ComplaintStatus.INSPECTION_VERIFIED
        complaint.rework_reason = None
        note = payload.reason or "Nodal Officer verified site inspection proof."
    elif payload.decision == "rework":
        if not payload.reason or not payload.reason.strip():
            raise HTTPException(status_code=400, detail="A mandatory rework reason is required.")
        complaint.status = ComplaintStatus.INSPECTION_REWORK
        complaint.rework_reason = payload.reason.strip()
        note = f"Inspection returned for rework: {complaint.rework_reason}"
    else:
        if not payload.new_inspector_id:
            raise HTTPException(status_code=400, detail="new_inspector_id is required to reassign.")
        new_insp = await session.get(Officer, payload.new_inspector_id)
        if not new_insp or new_insp.department_id != nodal.department_id or new_insp.officer_role != "inspection_officer":
            raise HTTPException(status_code=400, detail="Invalid replacement inspection officer.")
        complaint.assigned_inspector_id = new_insp.id
        complaint.status = ComplaintStatus.INSPECTION_ASSIGNED
        complaint.rework_reason = payload.reason.strip() if payload.reason else "Reassigned to another inspector."
        note = f"Inspection reassigned: {complaint.rework_reason}"

    _record_transition(
        session,
        complaint,
        old_status,
        complaint.status.value,
        current_user,
        note,
        f"review_inspection_{payload.decision}",
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/nodal/complaints/{complaint_id}/assign-team")
async def nodal_assign_team(
    complaint_id: uuid.UUID,
    payload: AssignTeamRequest,
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    nodal = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.department_id != nodal.department_id:
        raise HTTPException(status_code=403, detail="Complaint belongs to another department.")

    team = await session.get(Team, payload.team_id)
    if not team or not team.is_active or team.department_id != nodal.department_id:
        raise HTTPException(status_code=400, detail="Selected field team is invalid for this department.")

    old_status = complaint.status.value
    new_status = ComplaintStatus.TEAM_ASSIGNED.value
    if not is_valid_transition(old_status, new_status):
        raise HTTPException(status_code=400, detail=f"Cannot dispatch field team from state '{old_status}'.")

    priority_suffix = _apply_assignment_priority(complaint, payload.priority) or ""
    complaint.assigned_team_id = team.id
    complaint.status = ComplaintStatus.TEAM_ASSIGNED
    complaint.rework_reason = None
    _record_transition(
        session,
        complaint,
        old_status,
        new_status,
        current_user,
        (payload.notes or f"Dispatched redressal work order to {team.name}.") + priority_suffix,
        "assign_team",
        {"team_id": str(team.id), "priority": complaint.priority.value},
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/nodal/complaints/{complaint_id}/assign-verifier")
async def nodal_assign_verifier(
    complaint_id: uuid.UUID,
    payload: AssignInspectorRequest,
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    nodal = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.department_id != nodal.department_id:
        raise HTTPException(status_code=403, detail="Complaint belongs to another department.")

    inspector = await session.get(Officer, payload.inspector_id)
    if not inspector or inspector.department_id != nodal.department_id or inspector.officer_role != "inspection_officer":
        raise HTTPException(status_code=400, detail="Invalid verification inspector.")

    old_status = complaint.status.value
    new_status = ComplaintStatus.VERIFICATION_ASSIGNED.value
    if not is_valid_transition(old_status, new_status):
        raise HTTPException(status_code=400, detail=f"Cannot assign verification from state '{old_status}'.")

    priority_suffix = _apply_assignment_priority(complaint, payload.priority) or ""
    complaint.verification_inspector_id = inspector.id
    complaint.status = ComplaintStatus.VERIFICATION_ASSIGNED
    complaint.rework_reason = None
    _record_transition(
        session,
        complaint,
        old_status,
        new_status,
        current_user,
        (payload.notes or "Assigned post-repair verification visit.") + priority_suffix,
        "assign_verifier",
        {"verification_inspector_id": str(inspector.id), "priority": complaint.priority.value},
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/nodal/complaints/{complaint_id}/final-decision")
async def nodal_final_decision(
    complaint_id: uuid.UUID,
    payload: FinalDecisionRequest,
    current_user: User = Depends(require_nodal_officer),
    session: AsyncSession = Depends(get_async_session),
):
    nodal = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.department_id != nodal.department_id:
        raise HTTPException(status_code=403, detail="Complaint belongs to another department.")

    old_status = complaint.status.value
    if old_status != ComplaintStatus.VERIFICATION_SUBMITTED.value:
        raise HTTPException(status_code=400, detail="Post-repair verification proof must be submitted first.")

    if payload.decision == "approve":
        complaint.status = ComplaintStatus.RESOLVED
        complaint.resolved_at = datetime.now(timezone.utc)
        complaint.rework_reason = None
        note = payload.reason or "Nodal Officer approved 3-way proof match and closed grievance."
    elif payload.decision == "rework_team":
        if not payload.reason or not payload.reason.strip():
            raise HTTPException(status_code=400, detail="A mandatory rework reason is required.")
        complaint.status = ComplaintStatus.REDRESSAL_REWORK
        complaint.rework_reason = payload.reason.strip()
        note = f"Returned to field team for rework: {complaint.rework_reason}"
    elif payload.decision == "reassign_team":
        if not payload.new_team_id:
            raise HTTPException(status_code=400, detail="new_team_id is required.")
        new_team = await session.get(Team, payload.new_team_id)
        if not new_team or new_team.department_id != nodal.department_id:
            raise HTTPException(status_code=400, detail="Invalid replacement field team.")
        complaint.assigned_team_id = new_team.id
        complaint.status = ComplaintStatus.TEAM_ASSIGNED
        complaint.rework_reason = payload.reason.strip() if payload.reason else f"Reassigned to {new_team.name}."
        note = f"Redressal reassigned to {new_team.name}: {complaint.rework_reason}"
    else:
        if payload.new_inspector_id:
            new_insp = await session.get(Officer, payload.new_inspector_id)
            if not new_insp or new_insp.department_id != nodal.department_id or new_insp.officer_role != "inspection_officer":
                raise HTTPException(status_code=400, detail="Invalid replacement inspector.")
            complaint.verification_inspector_id = new_insp.id
        complaint.status = ComplaintStatus.VERIFICATION_ASSIGNED
        complaint.rework_reason = payload.reason.strip() if payload.reason else "Re-verification requested by Nodal Officer."
        note = f"Sent back for re-verification: {complaint.rework_reason}"

    _record_transition(
        session,
        complaint,
        old_status,
        complaint.status.value,
        current_user,
        note,
        f"final_decision_{payload.decision}",
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


# ─── INSPECTION OFFICER ENDPOINTS (STRICT ISOLATION) ──────────────────────────

@router.get("/inspector/dashboard")
async def inspector_dashboard(
    current_user: User = Depends(require_inspection_officer),
    session: AsyncSession = Depends(get_async_session),
):
    inspector = await _get_officer_profile(session, current_user)
    c_res = await session.execute(
        select(Complaint)
        .where(
            or_(
                Complaint.assigned_inspector_id == inspector.id,
                Complaint.verification_inspector_id == inspector.id,
            )
        )
        .order_by(Complaint.updated_at.desc())
    )
    complaints = c_res.scalars().all()
    items = [await _serialize_complaint(session, c) for c in complaints]
    return {
        "inspector_id": str(inspector.id),
        "complaints": items,
    }


@router.post("/inspector/complaints/{complaint_id}/site-photos", status_code=status.HTTP_201_CREATED)
async def inspector_upload_site_photos(
    complaint_id: uuid.UUID,
    files: Optional[list[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None),
    latitude: float = Form(...),
    longitude: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    gps_source: Optional[str] = Form("live_gps"),
    stage: str = Form("initial_inspection"),
    notes: Optional[str] = Form(""),
    submit_for_review: bool = Form(False),
    current_user: User = Depends(require_inspection_officer),
    session: AsyncSession = Depends(get_async_session),
):
    inspector = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    is_verification = stage.strip().lower() == "final_verification"
    if is_verification:
        if complaint.verification_inspector_id != inspector.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Task isolation violation: this verification is not assigned to you.",
            )
        if complaint.status != ComplaintStatus.VERIFICATION_ASSIGNED:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot upload verification photos from state '{complaint.status.value}'.",
            )
    else:
        if complaint.assigned_inspector_id != inspector.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Task isolation violation: this inspection is not assigned to you.",
            )
        if complaint.status not in {ComplaintStatus.INSPECTION_ASSIGNED, ComplaintStatus.INSPECTION_REWORK}:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot upload initial site photos from state '{complaint.status.value}'.",
            )

    uploads = await _collect_proof_files(files, file)
    if not uploads:
        raise HTTPException(status_code=400, detail="At least one geotagged site photo is required.")

    lat, lng, acc, src = _validate_gps_metadata(latitude, longitude, gps_accuracy, gps_source, required=True)
    device_meta = f"Inspection Officer Field Desk | gps_source={src}" + (f" | accuracy={acc}m" if acc is not None else "")
    media_type = MediaType.VERIFICATION_PHOTO if is_verification else MediaType.INSPECTION_PHOTO

    saved_media = []
    for upload in uploads:
        saved_media.append(
            await _save_proof_upload(
                session,
                complaint,
                current_user,
                media_type,
                upload,
                lat,
                lng,
                device_meta,
            )
        )

    dist = compute_distance_meters(complaint.latitude, complaint.longitude, lat, lng)
    clean_notes = (notes or "").strip()

    if submit_for_review and not is_verification:
        if not clean_notes:
            raise HTTPException(status_code=400, detail="Inspection observations/notes are required to submit for review.")
        old_status = complaint.status.value
        complaint.status = ComplaintStatus.INSPECTION_SUBMITTED
        complaint.rework_reason = None
        _record_transition(
            session,
            complaint,
            old_status,
            ComplaintStatus.INSPECTION_SUBMITTED.value,
            current_user,
            clean_notes,
            "submit_inspection_proof",
            {"photos": len(saved_media), "latitude": lat, "longitude": lng, "gps_source": src, "distance_meters": dist},
        )
    else:
        session.add(
            AuditLog(
                action="inspector_site_photos_uploaded",
                entity_type="complaint",
                entity_id=str(complaint.id),
                actor_id=current_user.id,
                actor_role=current_user.role.value,
                details={
                    "stage": "final_verification" if is_verification else "initial_inspection",
                    "photos": len(saved_media),
                    "latitude": lat,
                    "longitude": lng,
                    "gps_source": src,
                    "gps_accuracy_m": acc,
                    "distance_meters": dist,
                },
            )
        )

    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/inspector/complaints/{complaint_id}/submit-inspection")
async def inspector_submit_inspection(
    complaint_id: uuid.UUID,
    files: Optional[list[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None),
    notes: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    gps_source: Optional[str] = Form("live_gps"),
    current_user: User = Depends(require_inspection_officer),
    session: AsyncSession = Depends(get_async_session),
):
    inspector = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.assigned_inspector_id != inspector.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Task isolation violation: this inspection is not assigned to you.",
        )

    old_status = complaint.status.value
    new_status = ComplaintStatus.INSPECTION_SUBMITTED.value
    if not is_valid_transition(old_status, new_status):
        raise HTTPException(status_code=400, detail=f"Cannot submit inspection from state '{old_status}'.")

    uploads = await _collect_proof_files(files, file)
    if not uploads:
        existing_res = await session.execute(
            select(ComplaintMedia).where(
                ComplaintMedia.complaint_id == complaint.id,
                ComplaintMedia.media_type == MediaType.INSPECTION_PHOTO,
            )
        )
        if not existing_res.scalars().first():
            raise HTTPException(status_code=400, detail="At least one geotagged inspection photo is required.")

    lat, lng, acc, src = _validate_gps_metadata(latitude, longitude, gps_accuracy, gps_source, required=True)
    device_meta = f"Inspection Officer Field Desk | gps_source={src}" + (f" | accuracy={acc}m" if acc is not None else "")
    for upload in uploads:
        await _save_proof_upload(
            session,
            complaint,
            current_user,
            MediaType.INSPECTION_PHOTO,
            upload,
            lat,
            lng,
            device_meta,
        )

    dist = compute_distance_meters(complaint.latitude, complaint.longitude, lat, lng)
    complaint.status = ComplaintStatus.INSPECTION_SUBMITTED
    complaint.rework_reason = None
    _record_transition(
        session,
        complaint,
        old_status,
        new_status,
        current_user,
        notes.strip(),
        "submit_inspection_proof",
        {
            "photos": len(uploads),
            "latitude": lat,
            "longitude": lng,
            "gps_source": src,
            "gps_accuracy_m": acc,
            "distance_meters": dist,
        },
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/inspector/complaints/{complaint_id}/submit-verification")
async def inspector_submit_verification(
    complaint_id: uuid.UUID,
    files: Optional[list[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None),
    verdict: str = Form(...),
    notes: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    gps_accuracy: Optional[float] = Form(None),
    gps_source: Optional[str] = Form("live_gps"),
    current_user: User = Depends(require_inspection_officer),
    session: AsyncSession = Depends(get_async_session),
):
    inspector = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if complaint.verification_inspector_id != inspector.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Task isolation violation: this verification is not assigned to you.",
        )

    norm_verdict = verdict.strip().lower()
    if norm_verdict == "incomplete":
        norm_verdict = "rework"
    if norm_verdict not in {"verified", "rework"}:
        raise HTTPException(status_code=400, detail="Verdict must be 'verified' or 'rework'.")

    old_status = complaint.status.value
    target = (
        ComplaintStatus.VERIFICATION_SUBMITTED
        if norm_verdict == "verified"
        else ComplaintStatus.REDRESSAL_REWORK
    )
    if not is_valid_transition(old_status, target.value):
        raise HTTPException(status_code=400, detail=f"Cannot submit verification from state '{old_status}'.")

    uploads = await _collect_proof_files(files, file)
    if not uploads:
        raise HTTPException(status_code=400, detail="At least one geotagged verification photo is required.")

    lat, lng, acc, src = _validate_gps_metadata(latitude, longitude, gps_accuracy, gps_source, required=True)
    device_meta = f"Inspection Officer Post-Repair Verification | gps_source={src}" + (
        f" | accuracy={acc}m" if acc is not None else ""
    )
    for upload in uploads:
        await _save_proof_upload(
            session,
            complaint,
            current_user,
            MediaType.VERIFICATION_PHOTO,
            upload,
            lat,
            lng,
            device_meta,
        )

    complaint.status = target
    complaint.rework_reason = None if norm_verdict == "verified" else notes.strip()
    _record_transition(
        session,
        complaint,
        old_status,
        target.value,
        current_user,
        notes.strip(),
        "submit_verification_proof",
        {
            "verdict": norm_verdict,
            "photos": len(uploads),
            "latitude": lat,
            "longitude": lng,
            "gps_source": src,
            "gps_accuracy_m": acc,
        },
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


# ─── FIELD TEAM LEAD ENDPOINTS (STRICT TEAM ISOLATION) ────────────────────────

@router.get("/team/dashboard")
async def team_dashboard(
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_async_session),
):
    lead = await _get_officer_profile(session, current_user)
    if not lead.team_id:
        raise HTTPException(status_code=403, detail="Team Lead is not assigned to an active field team.")

    team = await session.get(Team, lead.team_id)
    c_res = await session.execute(
        select(Complaint)
        .where(Complaint.assigned_team_id == lead.team_id)
        .order_by(Complaint.updated_at.desc())
    )
    complaints = c_res.scalars().all()
    items = [await _serialize_complaint(session, c) for c in complaints]
    return {
        "team": {
            "id": str(team.id),
            "name": team.name,
            "code": team.code,
            "ward_coverage": team.ward_coverage or [],
        } if team else None,
        "complaints": items,
    }


@router.post("/team/complaints/{complaint_id}/start-work")
async def team_start_work(
    complaint_id: uuid.UUID,
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_async_session),
):
    lead = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if not lead.team_id or complaint.assigned_team_id != lead.team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Task isolation violation: this work order belongs to another team.",
        )

    old_status = complaint.status.value
    new_status = ComplaintStatus.WORK_IN_PROGRESS.value
    if not is_valid_transition(old_status, new_status):
        raise HTTPException(status_code=400, detail=f"Cannot start work from state '{old_status}'.")

    complaint.status = ComplaintStatus.WORK_IN_PROGRESS
    _record_transition(
        session,
        complaint,
        old_status,
        new_status,
        current_user,
        "Field team mobilized on site and began redressal work.",
        "team_start_work",
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


async def _handle_team_resolution_upload(
    complaint_id: uuid.UUID,
    files: Optional[list[UploadFile]],
    file: Optional[UploadFile],
    atr_notes: Optional[str],
    remarks: Optional[str],
    materials_used: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    gps_accuracy: Optional[float],
    gps_source: Optional[str],
    submit_for_verification: bool,
    current_user: User,
    session: AsyncSession,
) -> dict:
    lead = await _get_officer_profile(session, current_user)
    complaint = await session.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    if not lead.team_id or complaint.assigned_team_id != lead.team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Task isolation violation: this work order belongs to another team.",
        )

    if complaint.status not in {
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.WORK_IN_PROGRESS,
        ComplaintStatus.REDRESSAL_REWORK,
    }:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot upload resolution proof from state '{complaint.status.value}'.",
        )

    uploads = await _collect_proof_files(files, file)
    if not uploads:
        existing_res = await session.execute(
            select(ComplaintMedia).where(
                ComplaintMedia.complaint_id == complaint.id,
                ComplaintMedia.media_type == MediaType.RESOLUTION_PHOTO,
            )
        )
        if not submit_for_verification or not existing_res.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="At least one after-repair resolution proof photo is required.",
            )

    clean_notes = (atr_notes or remarks or "").strip()
    clean_materials = (materials_used or "").strip()
    if submit_for_verification and not clean_notes:
        raise HTTPException(status_code=400, detail="Action Taken Report (ATR) notes are required.")

    lat, lng, acc, src = _validate_gps_metadata(
        latitude,
        longitude,
        gps_accuracy,
        gps_source,
        required=submit_for_verification,
    )
    device_meta = f"Field Team Lead Execution Desk | gps_source={src}" + (
        f" | accuracy={acc}m" if acc is not None else ""
    )
    for upload in uploads:
        await _save_proof_upload(
            session,
            complaint,
            current_user,
            MediaType.RESOLUTION_PHOTO,
            upload,
            lat,
            lng,
            device_meta,
        )

    old_status = complaint.status.value
    dist = compute_distance_meters(complaint.latitude, complaint.longitude, lat, lng)
    if clean_notes:
        complaint.resolution_remarks = (
            f"{clean_notes} [Materials: {clean_materials}]" if clean_materials else clean_notes
        )

    if not submit_for_verification:
        if complaint.status in {ComplaintStatus.TEAM_ASSIGNED, ComplaintStatus.REDRESSAL_REWORK}:
            complaint.status = ComplaintStatus.WORK_IN_PROGRESS
            _record_transition(
                session,
                complaint,
                old_status,
                ComplaintStatus.WORK_IN_PROGRESS.value,
                current_user,
                clean_notes or f"Uploaded {len(uploads)} resolution proof photo(s) while work is in progress.",
                "team_resolution_proof_staged",
                {"photos": len(uploads), "latitude": lat, "longitude": lng, "materials_used": clean_materials or None},
            )
        else:
            session.add(
                AuditLog(
                    action="team_resolution_proof_staged",
                    entity_type="complaint",
                    entity_id=str(complaint.id),
                    actor_id=current_user.id,
                    actor_role=current_user.role.value,
                    details={"photos": len(uploads), "latitude": lat, "longitude": lng},
                )
            )
        await session.commit()
        return await _serialize_complaint(session, complaint)

    target = (
        ComplaintStatus.VERIFICATION_ASSIGNED
        if complaint.assigned_inspector_id
        else ComplaintStatus.RESOLUTION_SUBMITTED
    )
    complaint.rework_reason = None
    complaint.status = target
    if complaint.assigned_inspector_id and not complaint.verification_inspector_id:
        complaint.verification_inspector_id = complaint.assigned_inspector_id

    _record_transition(
        session,
        complaint,
        old_status,
        target.value,
        current_user,
        clean_notes,
        "team_submit_resolution",
        {
            "photos": len(uploads),
            "latitude": lat,
            "longitude": lng,
            "gps_source": src,
            "gps_accuracy_m": acc,
            "distance_meters": dist,
            "materials_used": clean_materials or None,
        },
    )
    await session.commit()
    return await _serialize_complaint(session, complaint)


@router.post("/team/complaints/{complaint_id}/resolution-proof", status_code=status.HTTP_201_CREATED)
async def team_upload_resolution_proof(
    complaint_id: uuid.UUID,
    files: Optional[list[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None),
    atr_notes: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),
    materials_used: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    gps_accuracy: Optional[float] = Form(None),
    gps_source: Optional[str] = Form("live_gps"),
    submit_for_verification: bool = Form(True),
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_async_session),
):
    return await _handle_team_resolution_upload(
        complaint_id=complaint_id,
        files=files,
        file=file,
        atr_notes=atr_notes,
        remarks=remarks,
        materials_used=materials_used,
        latitude=latitude,
        longitude=longitude,
        gps_accuracy=gps_accuracy,
        gps_source=gps_source,
        submit_for_verification=submit_for_verification,
        current_user=current_user,
        session=session,
    )


@router.post("/team/complaints/{complaint_id}/submit-resolution")
async def team_submit_resolution(
    complaint_id: uuid.UUID,
    files: Optional[list[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None),
    atr_notes: Optional[str] = Form(None),
    remarks: Optional[str] = Form(None),
    materials_used: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    gps_accuracy: Optional[float] = Form(None),
    gps_source: Optional[str] = Form("live_gps"),
    current_user: User = Depends(require_team_lead),
    session: AsyncSession = Depends(get_async_session),
):
    return await _handle_team_resolution_upload(
        complaint_id=complaint_id,
        files=files,
        file=file,
        atr_notes=atr_notes,
        remarks=remarks,
        materials_used=materials_used,
        latitude=latitude,
        longitude=longitude,
        gps_accuracy=gps_accuracy,
        gps_source=gps_source,
        submit_for_verification=True,
        current_user=current_user,
        session=session,
    )
