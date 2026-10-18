"""
AI Insights Router for Samadhan Setu Phase 2.

Provides endpoints for accessing AI analysis results, similar complaints,
priority explanations, image analysis, routing suggestions, and officer
AI-ranked queues. All AI outputs are advisory — officers decide.
"""
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks

from ..database import get_db
from ..auth import get_current_user, require_officer, require_admin
from ..models import User, UserRole, Complaint, Task, TaskStatus
from ..schemas.ai import (
    AIAnalysisResponse, ModelHealthResponse, OfficerQueueItem,
)
from ..services.ai_pipeline import run_ai_pipeline, get_ai_results
from ..services.similarity_service import get_similarity_links, find_duplicates
from ..services.image_analysis_service import get_image_analysis
from ..services.ai_routing import get_routing_suggestion, override_routing

router = APIRouter(prefix="/api/ai", tags=["AI Insights"])


# ==================== COMPLAINT AI SUMMARY ====================

@router.get("/complaint/{complaint_id}/summary")
async def get_ai_summary(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get complete AI analysis summary for a complaint."""
    _verify_complaint_access(complaint_id, current_user, db)

    results = get_ai_results(complaint_id, db)
    if not results:
        return {"complaint_id": complaint_id, "pipeline_status": "not_run", "message": "AI analysis not yet run"}

    return results


@router.post("/complaint/{complaint_id}/rerun")
async def rerun_ai_analysis(
    complaint_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Re-run AI analysis on a complaint (officer/admin only)."""
    _verify_complaint_exists(complaint_id, db)

    background_tasks.add_task(run_ai_pipeline, complaint_id, db)
    return {"message": "AI analysis re-run scheduled", "complaint_id": complaint_id}


# ==================== SIMILARITY & DUPLICATES ====================

@router.get("/complaint/{complaint_id}/similar")
async def get_similar_complaints(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get similar complaints detected by SBERT."""
    _verify_complaint_access(complaint_id, current_user, db)

    # From stored AI results
    ai_results = get_ai_results(complaint_id, db)
    similar = []
    if ai_results:
        similar = ai_results.get("similar_complaints", [])

    # Also get similarity links
    links = get_similarity_links(complaint_id, db)

    return {
        "complaint_id": complaint_id,
        "similar_complaints": similar,
        "similarity_links": links,
    }


@router.get("/complaint/{complaint_id}/cluster")
async def get_complaint_cluster(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get cluster membership for a complaint."""
    _verify_complaint_access(complaint_id, current_user, db)

    # Search clusters containing this complaint
    clusters = []
    try:
        docs = db.collection("complaint_clusters").get()
        for doc in docs:
            data = doc.to_dict()
            member_ids = data.get("member_ids", [])
            if complaint_id in member_ids:
                data["id"] = doc.id
                clusters.append(data)
    except Exception:
        pass

    return {"complaint_id": complaint_id, "clusters": clusters}


# ==================== PRIORITY & SLA ====================

@router.get("/complaint/{complaint_id}/priority-explanation")
async def get_priority_explanation(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get detailed priority score breakdown with explanation."""
    _verify_complaint_access(complaint_id, current_user, db)

    ai_results = get_ai_results(complaint_id, db)
    if not ai_results:
        return {"complaint_id": complaint_id, "status": "not_available"}

    priority = ai_results.get("priority", {})
    return {
        "complaint_id": complaint_id,
        "score": priority.get("score"),
        "priority": priority.get("priority"),
        "sla_hours": priority.get("sla_hours"),
        "breakdown": priority.get("breakdown", {}),
        "explanation": priority.get("explanation", {}),
    }


@router.get("/complaint/{complaint_id}/sla-risk")
async def get_sla_risk(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get SLA risk assessment for a complaint."""
    _verify_complaint_access(complaint_id, current_user, db)

    ai_results = get_ai_results(complaint_id, db)
    if not ai_results:
        return {"complaint_id": complaint_id, "status": "not_available"}

    priority = ai_results.get("priority", {})
    breakdown = priority.get("breakdown", {})
    explanation = priority.get("explanation", {})
    factors = explanation.get("factors", {})

    sla_data = factors.get("sla_risk", {})

    return {
        "complaint_id": complaint_id,
        "sla_risk_score": breakdown.get("sla_risk", 1.0),
        "sla_risk_level": _risk_label(breakdown.get("sla_risk", 1.0)),
        "sla_hours": priority.get("sla_hours"),
        "details": sla_data,
    }


# ==================== IMAGE ANALYSIS ====================

@router.get("/complaint/{complaint_id}/image-analysis")
async def get_image_analysis_result(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get YOLO image analysis results for a complaint."""
    _verify_complaint_access(complaint_id, current_user, db)

    result = get_image_analysis(complaint_id, db)
    if not result:
        return {"complaint_id": complaint_id, "status": "not_available"}

    return result


# ==================== ROUTING ====================

@router.get("/complaint/{complaint_id}/routing")
async def get_routing(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get AI routing suggestion for a complaint."""
    _verify_complaint_access(complaint_id, current_user, db)

    suggestion = get_routing_suggestion(complaint_id, db)
    if not suggestion:
        return {"complaint_id": complaint_id, "status": "not_available"}

    return suggestion


@router.post("/complaint/{complaint_id}/routing/override")
async def override_ai_routing(
    complaint_id: str,
    reason: str = Query(..., min_length=3, description="Reason for override"),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Officer overrides AI routing suggestion."""
    success = override_routing(complaint_id, current_user.id, reason, db)
    if not success:
        raise HTTPException(status_code=404, detail="No routing suggestion found to override")

    return {"message": "Routing override recorded", "complaint_id": complaint_id}


# ==================== OFFICER AI QUEUE ====================

@router.get("/officer/queue", response_model=List[OfficerQueueItem])
async def get_ai_ranked_queue(
    priority_band: Optional[str] = Query(None, description="Filter: Critical, High, Medium, Low"),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get AI-ranked task queue for the officer."""
    query = db.collection("tasks")
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.where("department_id", "==", current_user.department_id)

    # Only active tasks
    docs = query.get()
    tasks = []
    for doc in docs:
        t = doc.to_dict()
        t["id"] = doc.id
        if t.get("status") in ["Completed", "Rejected"]:
            continue
        tasks.append(t)

    # Enrich with complaint + AI data
    queue_items = []
    for task in tasks:
        comp_doc = db.collection("complaints").document(task["complaint_id"]).get()
        if not comp_doc.exists:
            continue
        comp = comp_doc.to_dict()

        priority_val = comp.get("priority", "Low")
        if priority_band and priority_val != priority_band:
            continue

        # Get AI results if available
        ai_data = get_ai_results(task["complaint_id"], db)
        ai_category = ""
        ai_confidence = 0
        similar_count = 0
        sla_risk_level = "Low"
        urgency_level = "Low"

        if ai_data:
            text_a = ai_data.get("text_analysis", {})
            ai_category = text_a.get("category", "")
            ai_confidence = text_a.get("category_confidence", 0)
            urgency_level = text_a.get("urgency_level", "Low")
            similar_count = len(ai_data.get("similar_complaints", []))
            p = ai_data.get("priority", {})
            bd = p.get("breakdown", {})
            sla_risk_level = _risk_label(bd.get("sla_risk", 1.0))

        queue_items.append(OfficerQueueItem(
            task_id=task["id"],
            complaint_id=task["complaint_id"],
            complaint_title=comp.get("title", ""),
            complaint_description=(comp.get("description", ""))[:200],
            complaint_location=comp.get("location", ""),
            department_name=task.get("department_name", ""),
            task_status=task.get("status", ""),
            priority=priority_val,
            priority_score=comp.get("priority_score", 0.0),
            urgency_level=urgency_level,
            ai_category=ai_category,
            ai_confidence=ai_confidence,
            similar_count=similar_count,
            sla_risk_level=sla_risk_level,
            created_at=str(task.get("created_at", "")),
        ))

    # Sort by priority score descending
    queue_items.sort(key=lambda x: x.priority_score, reverse=True)

    return queue_items


# ==================== ADMIN INSIGHTS ====================

@router.get("/admin/model-health", response_model=ModelHealthResponse)
async def get_model_health(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Get AI model availability and health metrics."""
    from ..ai.sbert_engine import sbert_engine
    from ..ai.yolo_validator import yolo_validator
    from ..ai.distilbert_classifier import _MODEL_AVAILABLE as distilbert_avail

    # Inference logs stats
    total_inferences = 0
    fallback_count = 0
    total_latency = 0.0

    try:
        log_docs = db.collection("inference_logs").limit(100).get()
        total_inferences = len(log_docs)
        for doc in log_docs:
            data = doc.to_dict()
            if data.get("is_fallback"):
                fallback_count += 1
            total_latency += data.get("latency_ms", 0)
    except Exception:
        pass

    return ModelHealthResponse(
        distilbert_available=distilbert_avail is True,
        sbert_available=sbert_engine.is_available,
        yolo_available=yolo_validator.is_available,
        fallback_rate=round(fallback_count / max(1, total_inferences), 3),
        total_inferences=total_inferences,
        avg_latency_ms=round(total_latency / max(1, total_inferences), 1),
    )


@router.get("/admin/hotspots")
async def get_hotspots(
    days: int = Query(30, ge=1, le=365),
    min_size: int = Query(3, ge=2),
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Get active complaint hotspots (high-density clusters)."""
    from ..services.complaint_clustering import get_clustered_complaints
    result = get_clustered_complaints(db, days=days, min_cluster_size=min_size)
    return result


@router.get("/admin/override-stats")
async def get_override_stats(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Get statistics on officer AI suggestion overrides."""
    try:
        docs = db.collection("routing_suggestions").get()
        total = len(docs)
        overridden = sum(1 for d in docs if d.to_dict().get("status") == "overridden")
        accepted = sum(1 for d in docs if d.to_dict().get("status") == "accepted")
        pending = sum(1 for d in docs if d.to_dict().get("status") == "pending")

        return {
            "total_suggestions": total,
            "overridden": overridden,
            "accepted": accepted,
            "pending": pending,
            "override_rate": round(overridden / max(1, total), 3),
        }
    except Exception:
        return {"total_suggestions": 0, "overridden": 0, "accepted": 0, "pending": 0, "override_rate": 0}


# ==================== HELPERS ====================

def _verify_complaint_exists(complaint_id: str, db):
    doc = db.collection("complaints").document(complaint_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")


def _verify_complaint_access(complaint_id: str, current_user: User, db):
    doc = db.collection("complaints").document(complaint_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    data = doc.to_dict()
    if not (
        data.get("user_id") == current_user.id
        or data.get("is_public")
        or current_user.role in [UserRole.OFFICER, UserRole.ADMIN]
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _risk_label(score: float) -> str:
    if score >= 2.5:
        return "Critical"
    elif score >= 2.0:
        return "High"
    elif score >= 1.5:
        return "Medium"
    return "Low"
