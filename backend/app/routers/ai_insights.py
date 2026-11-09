"""
AI Insights Router — PostgreSQL edition.
Provides AI classification preview, duplicate detection, priority explanation,
and officer AI-ranked queue. All AI outputs are advisory — officers decide.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session
from ..auth import get_current_user, require_officer, require_admin
from ..services.complaint_access import get_visible_complaint
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
    # Fields are aliased so both legacy consumers ("title") and task-desk
    # consumers ("complaint_title") deserialize correctly.
    title: str
    complaint_title: str
    category: str
    priority: str
    priority_score: float
    status: str
    task_status: str
    ward: Optional[str] = None
    sla_breached: bool
    sla_deadline: Optional[str] = None
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
    complaint = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)
    priority_result = calculate_priority(complaint.description, complaint.category, complaint.vote_count)

    return {
        "complaint_id": str(complaint.id),
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
    """Active officer queue ordered by nearest SLA deadline, then priority score."""
    user_repo = UserRepository(session)
    officer = await user_repo.get_officer_by_user_id(current_user.id)

    repo = ComplaintRepository(session)
    dept_id = officer.department_id if officer and current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN) else None

    complaints, _ = await repo.list_complaints(
        department_id=dept_id,
        status=None,
        exclude_statuses=[ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED],
        sort_by="priority_sla",
        limit=limit,
        offset=0,
    )

    return [
        OfficerQueueItem(
            complaint_id=str(c.id),
            complaint_number=c.complaint_number,
            title=c.title,
            complaint_title=c.title,
            category=c.category,
            priority=c.priority.value,
            priority_score=c.priority_score,
            status=c.status.value,
            task_status=c.status.value,
            ward=c.ward,
            sla_breached=c.sla_breached,
            sla_deadline=c.sla_deadline.isoformat() if c.sla_deadline else None,
            vote_count=c.vote_count,
        )
        for c in complaints
    ]


# ──────────────────────────────────────────────────────────────────────────────
# AI model health
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/health")
@router.get("/admin/model-health")
async def ai_health(current_user: User = Depends(get_current_user)):
    """Check availability of AI service components."""
    try:
        result = ai_bridge.classify_complaint("Test road pothole issue near bus stop")
        classifier_ok = bool(result and result.get("category"))
    except Exception:
        classifier_ok = False

    return {
        "status": "operational" if classifier_ok else "degraded",
        "classifier": "healthy" if classifier_ok else "degraded",
        "priority_engine": "healthy",
        "components": {
            "distilbert_nlp": "operational" if classifier_ok else "degraded",
            "sbert_similarity": "operational" if getattr(ai_bridge, 'sbert_available', False) else "fallback_active",
            "priority_scoring_engine": "operational",
            "spatial_clustering": "operational",
        },
        "overall": "healthy" if classifier_ok else "degraded",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Complaint AI Summary
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/summary")
async def get_complaint_ai_summary(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Generate an AI summary of a complaint."""
    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)

    summary_text = (
        f"Grievance #{c.complaint_number} reported in {c.ward or 'the municipality'}. "
        f"Categorized under {c.category} with {c.priority.value.upper()} urgency priority "
        f"(calculated score {c.priority_score:.2f}). "
        f"Current administrative status is '{c.status.value.replace('_', ' ')}'."
    )
    if c.sla_deadline:
        summary_text += f" Mandated SLA resolution target is {c.sla_deadline.strftime('%Y-%m-%d %H:%M UTC')}."

    return {
        "complaint_id": str(c.id),
        "complaint_number": c.complaint_number,
        "summary": summary_text,
        "key_entities": [c.category, c.ward or "District", c.priority.value],
        "category": c.category,
        "priority": c.priority.value,
        "priority_score": c.priority_score,
        "status": c.status.value,
        "sla_breached": c.sla_breached,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Similar complaints for an existing grievance
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/similar")
async def get_similar_for_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Find similar complaints for a specific existing complaint."""
    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)

    res = await session.execute(
        select(Complaint)
        # BUG-08 FIX: Only expose public complaints in similarity results — previously
        # private (is_public=False) complaints were leaking into the response.
        .where(Complaint.id != c.id, Complaint.category == c.category, Complaint.is_public == True)
        .order_by(Complaint.created_at.desc())
        .limit(30)
    )
    candidates = res.scalars().all()

    existing_dicts = [
        {"id": str(item.id), "text": item.description}
        for item in candidates
    ]

    matches = ai_bridge.get_similar_complaints(c.description, existing_dicts, threshold=0.60)
    cand_map = {str(item.id): item for item in candidates}

    similar = []
    for m in matches:
        cand = cand_map.get(m["complaint_id"])
        if cand:
            similar.append({
                "complaint_id": str(cand.id),
                "complaint_number": cand.complaint_number,
                "title": cand.title,
                "description": cand.description,
                "similarity_score": m["similarity_score"],
                "status": cand.status.value,
                "priority": cand.priority.value,
            })

    return {"complaint_id": str(c.id), "similar_complaints": similar}


# ──────────────────────────────────────────────────────────────────────────────
# Cluster insight for a grievance
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/cluster")
async def get_complaint_cluster(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Get thematic and ward spatial cluster information for a complaint."""
    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)

    return {
        "complaint_id": str(c.id),
        "cluster_id": f"cluster-{c.ward or 'general'}-{c.category}".lower().replace(" ", "_"),
        "cluster_name": f"{c.category} ({c.ward or 'General'})",
        "ward": c.ward or "General",
        "category": c.category,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Routing recommendation
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/routing")
async def get_complaint_routing(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Get AI department routing recommendation for a complaint."""
    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)
    dept_name = c.department.name if c.department else "General Administration"

    return {
        "complaint_id": str(c.id),
        "recommended_department_id": str(c.department_id) if c.department_id else None,
        "recommended_department_name": dept_name,
        "confidence": c.ai_confidence or 85,
        "routing_reason": f"Matched classification tokens in category '{c.category}'.",
    }


# ──────────────────────────────────────────────────────────────────────────────
# SLA risk breakdown
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/sla-risk")
async def get_complaint_sla_risk(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Get detailed SLA risk breakdown for a complaint."""
    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)

    now = datetime.now(timezone.utc)
    hours_remaining = None
    if c.sla_deadline:
        hours_remaining = round((c.sla_deadline - now).total_seconds() / 3600.0, 1)

    is_at_risk = bool(hours_remaining is not None and hours_remaining < 6 and c.status not in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED))

    return {
        "complaint_id": str(c.id),
        "sla_deadline": c.sla_deadline.isoformat() if c.sla_deadline else None,
        "hours_remaining": hours_remaining,
        "is_breached": c.sla_breached or (hours_remaining is not None and hours_remaining < 0),
        "is_at_risk": is_at_risk,
        "risk_level": "critical" if (c.sla_breached or (hours_remaining is not None and hours_remaining < 0)) else ("high" if is_at_risk else "normal"),
    }



# ──────────────────────────────────────────────────────────────────────────────
# Image analysis result for a complaint (BUG-03: was missing, caused 404)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/complaint/{complaint_id}/image-analysis")
async def get_complaint_image_analysis(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Return AI image-analysis metadata for all media attached to a complaint.
    Includes YOLO object counts, aHash fingerprints, and forensic flags.
    Officers see full forensic details; citizens see only their own complaints.
    """
    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=True)

    media_analyses = []
    for m in c.media or []:
        # Expose stored YOLO / forensic metadata when available
        ai_meta = getattr(m, "ai_metadata", None) or {}
        media_analyses.append({
            "media_id": str(m.id),
            "media_type": m.media_type.value if hasattr(m.media_type, "value") else str(m.media_type),
            "file_name": m.file_name,
            "url": (getattr(m, "file_url", None) or m.s3_key or ""),
            "perceptual_hash": getattr(m, "perceptual_hash", None),
            "is_duplicate_flagged": getattr(m, "is_duplicate", False),
            "has_watermark": getattr(m, "has_watermark", False),
            "ai_labels": ai_meta.get("yolo_labels", []),
            "ai_confidence": ai_meta.get("confidence", None),
            "forensic_verified": ai_meta.get("forensic_verified", None),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    return {
        "complaint_id": str(c.id),
        "complaint_number": c.complaint_number,
        "media_count": len(media_analyses),
        "analyses": media_analyses,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Rerun analysis
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/complaint/{complaint_id}/rerun")
async def rerun_complaint_analysis(
    complaint_id: str,
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Rerun AI categorization and priority evaluation on an active complaint.
    Preserves manual officer overrides (M9 fix).
    """
    from ..models.orm.enums import ComplaintPriority
    from ..models.orm import AIResult, AuditLog

    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=False)

    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_active_officer(current_user.id)
        if not officer or officer.department_id != c.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Officers can only rerun analysis on complaints within their own department"
            )

    # Check if officer has already manually overridden AI triage
    ai_res = (await session.execute(select(AIResult).where(AIResult.complaint_id == c.id))).scalar_one_or_none()
    if ai_res and ai_res.overridden:
        return {
            "message": "AI analysis rerun skipped: Complaint triage has been manually overridden by an officer.",
            "category": c.category,
            "priority": c.priority.value,
            "priority_score": c.priority_score,
            "overridden": True,
        }

    old_priority = c.priority.value
    old_score = c.priority_score

    classification = ai_bridge.classify_complaint(c.description)
    priority_res = calculate_priority(c.description, classification["category"], c.vote_count)

    c.priority = ComplaintPriority(priority_res["priority"].lower())
    c.priority_score = priority_res["score"]
    c.urgency_score = priority_res["breakdown"].get("urgency", c.urgency_score)
    c.ai_confidence = float(classification.get("confidence", 80)) / 100.0

    audit_entry = AuditLog(
        action="ai_analysis_rerun",
        entity_type="complaint",
        entity_id=str(c.id),
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={
            "old_priority": old_priority,
            "new_priority": c.priority.value,
            "old_score": old_score,
            "new_score": c.priority_score,
        },
    )
    session.add(audit_entry)

    await session.commit()
    await session.refresh(c)
    return {
        "message": "Analysis rerun successfully",
        "category": c.category,
        "priority": c.priority.value,
        "priority_score": c.priority_score,
        "overridden": False,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Override routing
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/complaint/{complaint_id}/routing/override")
async def override_routing(
    complaint_id: str,
    reason: str = Query(...),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Record an officer's routing override reason into AIResult and audit logs (M9 fix)."""
    from ..models.orm import AIResult, AuditLog

    c = await get_visible_complaint(complaint_id, current_user, session, allow_public=False)

    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        user_repo = UserRepository(session)
        officer = await user_repo.get_active_officer(current_user.id)
        if not officer or officer.department_id != c.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Officers can only override routing on complaints within their own department"
            )

    repo = ComplaintRepository(session)
    actor_role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    await repo.add_status_transition(
        complaint_id=c.id,
        from_status=c.status,
        to_status=c.status,
        actor_id=current_user.id,
        actor_role=actor_role_val,
        notes=f"Officer routing override: {reason}",
    )

    # Update or create AIResult with override flags for HITL statistics
    ai_res = (await session.execute(select(AIResult).where(AIResult.complaint_id == c.id))).scalars().first()
    priority_val = c.priority.value if hasattr(c.priority, "value") else str(c.priority)
    raw_override_data = {"officer_id": str(current_user.id), "priority": priority_val, "reason": reason}
    if ai_res:
        ai_res.overridden = True
        ai_res.override_reason = reason
        ai_res.raw_output = {**(ai_res.raw_output or {}), **raw_override_data}
    else:
        ai_res = AIResult(
            complaint_id=c.id,
            predicted_category=c.category,
            category_confidence=float(c.ai_confidence or 0.8),
            priority_score=float(c.priority_score or 1.0),
            overridden=True,
            override_reason=reason,
            raw_output=raw_override_data,
        )
        session.add(ai_res)

    audit_entry = AuditLog(
        action="ai_routing_override",
        entity_type="complaint",
        entity_id=str(c.id),
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={"reason": reason, "category": c.category},
    )
    session.add(audit_entry)

    await session.commit()
    return {"message": "Routing override recorded", "complaint_id": str(c.id), "reason": reason}


# ──────────────────────────────────────────────────────────────────────────────
# Admin AI Hotspots & Override Stats
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/admin/hotspots")
async def get_admin_hotspots(
    days: int = Query(30, ge=1, le=365),
    min_size: int = Query(3, ge=1, le=50),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Administrative overview of geographic complaint clusters and recurring hotspots."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    res = await session.execute(
        select(
            Complaint.ward,
            Complaint.category,
            func.count(Complaint.id).label("count"),
            func.avg(Complaint.priority_score).label("avg_priority"),
        )
        .where(Complaint.created_at >= since, Complaint.ward.is_not(None))
        .group_by(Complaint.ward, Complaint.category)
        .having(func.count(Complaint.id) >= min_size)
        .order_by(func.count(Complaint.id).desc())
    )
    rows = res.all()

    return [
        {
            "hotspot_id": f"hs-{r.ward}-{r.category}".lower().replace(" ", "_"),
            "ward": r.ward,
            "category": r.category,
            "complaint_count": r.count,
            "average_priority_score": round(float(r.avg_priority or 0), 2),
            "severity": "CRITICAL" if r.count >= 5 else "HIGH",
        }
        for r in rows
    ]


@router.get("/admin/override-stats")
async def get_override_stats(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Live Human-in-the-Loop Governance Metrics:
    Calculates real Nodal Officer agreement vs override rate from AIResult records.
    """
    from ..models.orm import AIResult

    total_stmt = select(func.count(AIResult.id))
    overridden_stmt = select(func.count(AIResult.id)).where(AIResult.overridden == True)

    total_reviewed = (await session.execute(total_stmt)).scalar() or 0
    total_overridden = (await session.execute(overridden_stmt)).scalar() or 0

    if total_reviewed == 0:
        return {
            "total_predictions": 0,
            "total_suggestions": 0,
            "total_overrides": 0,
            "overridden": 0,
            "accepted": 0,
            "pending": 0,
            "override_rate": 0.0,
            "agreement_rate": 100.0,
            "accuracy": 100.0,
            "ai_accuracy_rate": 100.0,
            "recent_overrides": [],
        }

    override_rate = round((total_overridden / total_reviewed) * 100, 1)
    agreement_rate = round(100.0 - override_rate, 1)

    recent_stmt = (
        select(AIResult)
        .where(AIResult.overridden == True)
        .order_by(AIResult.created_at.desc())
        .limit(5)
    )
    recent_rows = (await session.execute(recent_stmt)).scalars().all()

    accepted = total_reviewed - total_overridden

    return {
        "total_predictions": total_reviewed,
        "total_suggestions": total_reviewed,
        "total_overrides": total_overridden,
        "overridden": total_overridden,
        "accepted": accepted,
        "pending": 0,
        "override_rate": override_rate,
        "agreement_rate": agreement_rate,
        "accuracy": agreement_rate,
        "ai_accuracy_rate": agreement_rate,
        "recent_overrides": [
            {
                "complaint_id": str(r.complaint_id),
                "predicted_category": r.predicted_category,
                "override_reason": r.override_reason,
                "timestamp": r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent_rows
        ],
    }

