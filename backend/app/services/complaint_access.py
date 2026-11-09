"""
complaint_access.py — Single Authorization Chokepoint & Serializer for Samadhan Setu.

Guarantees:
1. Every complaint read/write verifies tenant & ownership rules.
2. Returns 404 instead of 403 to prevent ID enumeration.
3. Completely isolates PII on public feeds (rounded GPS coordinates, zero citizen contact info).
4. Provides role-tailored representations: ComplaintPublic, ComplaintOwner, ComplaintStaff.
"""
import uuid
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Complaint, User, UserRole, Officer, MediaType
from app.repositories.user_repo import UserRepository


async def get_visible_complaint(
    complaint_id: str | uuid.UUID,
    user: Optional[User],
    session: AsyncSession,
    allow_public: bool = True,
) -> Complaint:
    """
    Central authorization chokepoint for complaint access.
    Returns the Complaint ORM object or raises 404 (never 403 to avoid enumeration).
    """
    if isinstance(complaint_id, str):
        try:
            cid = uuid.UUID(complaint_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
    else:
        cid = complaint_id

    query = (
        select(Complaint)
        .options(
            selectinload(Complaint.citizen),
            selectinload(Complaint.department),
            selectinload(Complaint.assigned_officer).selectinload(Officer.user),
            selectinload(Complaint.media),
            selectinload(Complaint.timeline),
            selectinload(Complaint.feedback),
            selectinload(Complaint.task_assignments),
        )
        .where(Complaint.id == cid)
    )
    res = await session.execute(query)
    c = res.scalar_one_or_none()

    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    # 1. Admins have system-wide visibility
    if user and user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return c

    # 2. Officers / Supervisors have visibility over their department or assigned complaints
    if user and user.role in (UserRole.OFFICER, UserRole.SUPERVISOR):
        user_repo = UserRepository(session)
        officer = await user_repo.get_active_officer(user.id)
        if officer and (officer.department_id == c.department_id or c.assigned_officer_id == officer.id):
            return c
        # If not matching their department, they can only view if it's public
        if allow_public and c.is_public:
            return c
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    # 3. Citizen owner has full visibility
    if user and c.citizen_id == user.id:
        return c

    # 4. Public access (unauthenticated or another citizen)
    if allow_public and c.is_public:
        return c

    # Deny private complaint to unauthorized readers
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")


def _format_media_url(media: Any) -> str:
    """Format safe API media endpoint URL."""
    if not media:
        return ""
    if isinstance(media, str):
        if media.startswith(("http://", "https://")):
            return media
        clean = media.lstrip("/")
        if clean.startswith("api/media/"):
            return f"/{clean}"
        if clean.startswith("uploads/"):
            clean = clean[len("uploads/"):]
        return f"/api/media/{clean}"
    media_id = getattr(media, "id", None)
    if media_id:
        return f"/api/media/{media_id}"
    s3_key = getattr(media, "s3_key", None)
    if s3_key:
        clean = s3_key.lstrip("/")
        if clean.startswith("uploads/"):
            clean = clean[len("uploads/"):]
        return f"/api/media/{clean}"
    return ""


def serialize_public(c: Complaint) -> Dict[str, Any]:
    """
    Public View: Strictly ZERO PII.
    Hides citizen ID, name, email, phone, street address.
    Rounds coordinates to 3 decimals (~110m accuracy) to protect citizen residence.
    """
    lat = round(c.latitude, 3) if c.latitude is not None else None
    lng = round(c.longitude, 3) if c.longitude is not None else None

    # H4 FIX: Separate citizen evidence, officer inspection photos, and resolution proofs
    citizen_evidence = [
        _format_media_url(m)
        for m in (c.media or [])
        if m.media_type in (MediaType.PROOF_PHOTO, MediaType.ADDITIONAL_DOC)
    ]
    inspection_images = [
        _format_media_url(m)
        for m in (c.media or [])
        if m.media_type == MediaType.INSPECTION_PHOTO
    ]
    resolution_proof = [
        _format_media_url(m)
        for m in (c.media or [])
        if m.media_type == MediaType.RESOLUTION_PHOTO
    ]

    if c.ward:
        ward_text = c.ward if c.ward.strip().lower().startswith("ward") else f"Ward {c.ward.strip()}"
    else:
        ward_text = c.city or "Mumbai"

    return {
        "id": str(c.id),
        "complaint_number": c.complaint_number,
        "title": c.title,
        "category": c.category,
        "subcategory": c.sub_category,
        "description": c.description,
        "location": ward_text,
        "ward": c.ward,
        "city": c.city or "Mumbai",
        "latitude": lat,
        "longitude": lng,
        "priority": c.priority.value if hasattr(c.priority, "value") else str(c.priority),
        "status": c.status.value if hasattr(c.status, "value") else str(c.status),
        "department_id": str(c.department_id) if c.department_id else None,
        "department_name": c.department.name if c.department else None,
        "upvotes": c.vote_count or 0,
        "attachments": citizen_evidence,
        "citizen_evidence": citizen_evidence,
        "inspection_images": inspection_images,
        "resolution_proof": resolution_proof,
        "resolution_remarks": c.resolution_remarks,
        "action_taken_report": c.action_taken_report,
        "satisfaction_status": c.satisfaction_status,
        "appeal_level": c.appeal_level or 0,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "deadline": c.sla_deadline.isoformat() if c.sla_deadline else None,
        "is_public": c.is_public,
        "user_id": None,
        "user": None,
        "status_logs": [],
        "status_history": [],
    }


def serialize_owner(c: Complaint) -> Dict[str, Any]:
    """
    Citizen Owner View: Full tracking, exact location, feedback, ATR, appeal options.
    """
    data = serialize_public(c)
    status_logs = [
        {
            "id": str(t.id),
            "from_status": t.status_from or "",
            "to_status": t.status_to,
            "remarks": t.notes,
            "notes": t.notes,
            "actor_role": t.actor_role,
            "timestamp": t.created_at.isoformat() if t.created_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in (c.timeline or [])
    ]
    data.update({
        "citizen_id": str(c.citizen_id),
        "user_id": str(c.citizen_id),
        "citizen_name": c.citizen.name if c.citizen else None,
        "location": c.address or (f"Ward {c.ward}" if c.ward else (c.city or "Mumbai")),
        "address": c.address or "",
        "latitude": c.latitude,
        "longitude": c.longitude,
        "is_public": c.is_public,
        "is_anonymous": c.is_anonymous,
        "priority_score": c.priority_score or 0.0,
        "urgency_score": c.urgency_score or 0,
        "ai_confidence": c.ai_confidence or 0.0,
        "citizen_rating": c.citizen_rating,
        "feedback_text": c.feedback_text,
        "appeal_remarks": c.appeal_remarks,
        "atr_submitted_at": c.atr_submitted_at.isoformat() if c.atr_submitted_at else None,
        "status_logs": status_logs,
        "status_history": status_logs,
    })
    return data


def serialize_staff(c: Complaint) -> Dict[str, Any]:
    """
    Staff / Officer / Admin View: Includes departmental metrics, SLA status, citizen identity (unless anonymous),
    audit and task assignment details.
    """
    data = serialize_owner(c)

    user_info = None
    if c.citizen and not c.is_anonymous:
        user_info = {
            "id": str(c.citizen.id),
            "name": c.citizen.name,
            "email": c.citizen.email,
            "phone": c.citizen.phone,
        }
    elif c.is_anonymous:
        user_info = {
            "name": "Anonymous Citizen",
            "is_anonymous": True,
        }

    status_logs_with_actors = [
        {
            "id": str(t.id),
            "from_status": t.status_from or "",
            "to_status": t.status_to,
            "remarks": t.notes,
            "notes": t.notes,
            "actor_id": str(t.changed_by) if t.changed_by else None,
            "updated_by": str(t.changed_by) if t.changed_by else None,
            "actor_role": t.actor_role,
            "timestamp": t.created_at.isoformat() if t.created_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in (c.timeline or [])
    ]

    data.update({
        "user": user_info,
        "assigned_officer_id": str(c.assigned_officer_id) if c.assigned_officer_id else None,
        "assigned_officer_name": c.assigned_officer.user.name if (c.assigned_officer and c.assigned_officer.user) else None,
        "sla_breached": c.sla_breached,
        "escalation_count": c.escalation_count,
        "status_logs": status_logs_with_actors,
        "status_history": status_logs_with_actors,
        "tasks": [
            {
                "id": str(t.id),
                "team_id": str(t.team_id),
                "is_active": t.is_active,
                "notes": t.reason,
                "assigned_at": t.assigned_at.isoformat() if t.assigned_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            for t in (c.task_assignments or [])
        ],
    })
    return data


async def serialize_complaint(c: Complaint, user: Optional[User], session: AsyncSession) -> Dict[str, Any]:
    """Helper to serialize complaint based on the caller's role and ownership."""
    if not user:
        return serialize_public(c)

    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return serialize_staff(c)

    if user.role in (UserRole.OFFICER, UserRole.SUPERVISOR):
        user_repo = UserRepository(session)
        officer = await user_repo.get_active_officer(user.id)
        if officer and (officer.department_id == c.department_id or c.assigned_officer_id == officer.id):
            return serialize_staff(c)
        return serialize_public(c)

    if c.citizen_id == user.id:
        return serialize_owner(c)

    return serialize_public(c)
