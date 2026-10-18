"""
AI Pipeline Orchestrator for Samadhan Setu Phase 2.

Runs the complete AI analysis pipeline on a complaint:
1. Text intelligence (DistilBERT classification + urgency/severity)
2. SBERT similarity detection + auto-linking
3. YOLOv8 image analysis (if images exist)
4. Multi-modal severity fusion
5. Enhanced priority calculation
6. AI routing suggestion
7. Store all results
8. Log inference run

Each step is independent — partial failures don't crash the pipeline.
Idempotent: re-running produces consistent results.
"""
import logging
import time
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def run_ai_pipeline(complaint_id: str, db) -> Dict[str, Any]:
    """
    Execute the full AI analysis pipeline for a complaint.

    Args:
        complaint_id: Firestore complaint ID
        db: Firestore client

    Returns:
        Dict with all AI analysis results
    """
    start_time = time.time()
    pipeline_id = f"pipe_{complaint_id}_{int(start_time)}"

    logger.info(f"[Pipeline] Starting for complaint {complaint_id}")

    # Load complaint
    try:
        doc = db.collection("complaints").document(complaint_id).get()
        if not doc.exists:
            logger.error(f"[Pipeline] Complaint {complaint_id} not found")
            return {"status": "error", "error": "Complaint not found"}
        complaint_data = doc.to_dict()
        complaint_data["id"] = doc.id
    except Exception as e:
        logger.error(f"[Pipeline] Failed to load complaint: {e}")
        return {"status": "error", "error": str(e)}

    text = complaint_data.get("description", "")
    category = complaint_data.get("category", "General")
    attachments = complaint_data.get("attachments", [])
    upvotes = complaint_data.get("upvotes", 0)
    ward = complaint_data.get("ward")
    created_at_raw = complaint_data.get("created_at")
    deadline_raw = complaint_data.get("deadline")

    # Parse dates
    created_at = _parse_datetime(created_at_raw)
    deadline = _parse_datetime(deadline_raw)

    results = {
        "complaint_id": complaint_id,
        "pipeline_id": pipeline_id,
        "status": "completed",
        "steps": {},
    }

    # ── Step 1: Text Intelligence ──
    text_analysis = _run_text_analysis(text, results)

    # ── Step 2: SBERT Similarity ──
    similar_complaints = _run_similarity(complaint_id, text, db, results)

    # ── Step 3: Image Analysis ──
    image_analysis = _run_image_analysis(complaint_id, attachments, category, db, results)

    # ── Step 4: Multi-Modal Fusion ──
    fused_severity = _run_fusion(text_analysis, image_analysis, text, results)

    # ── Step 5: Context Gathering ──
    context = _gather_context(complaint_id, category, ward, db)

    # ── Step 6: Priority Calculation ──
    priority_result = _run_priority(
        text, category, upvotes, text_analysis, fused_severity,
        context, created_at, deadline, results
    )

    # ── Step 7: Routing Suggestion ──
    routing = _run_routing(
        complaint_id, category, text, text_analysis,
        similar_complaints, db, results
    )

    # ── Step 8: Store Results ──
    elapsed_ms = round((time.time() - start_time) * 1000, 1)

    ai_result = {
        "complaint_id": complaint_id,
        "pipeline_id": pipeline_id,
        "text_analysis": text_analysis or {},
        "similar_complaints": similar_complaints or [],
        "image_analysis": image_analysis or {},
        "fused_severity": fused_severity or {},
        "priority": priority_result or {},
        "routing_suggestion": routing or {},
        "pipeline_status": "completed",
        "latency_ms": elapsed_ms,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    try:
        db.collection("complaint_ai_results").document(complaint_id).set(
            _serialize_for_firestore(ai_result)
        )
    except Exception as e:
        logger.warning(f"[Pipeline] Failed to store AI results: {e}")

    # ── Step 9: Log Inference ──
    _log_inference(complaint_id, pipeline_id, elapsed_ms, results, db)

    logger.info(f"[Pipeline] Completed for {complaint_id} in {elapsed_ms}ms")
    return ai_result


def get_ai_results(complaint_id: str, db) -> Optional[Dict[str, Any]]:
    """Retrieve stored AI analysis results."""
    try:
        doc = db.collection("complaint_ai_results").document(complaint_id).get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
    except Exception as e:
        logger.warning(f"[Pipeline] Failed to fetch results: {e}")
    return None


# ── Pipeline Step Implementations ──

def _run_text_analysis(text: str, results: Dict) -> Optional[Dict]:
    try:
        from ..ai.text_intelligence import text_intelligence
        analysis = text_intelligence.analyze(text)
        results["steps"]["text_analysis"] = "success"
        return analysis
    except Exception as e:
        logger.warning(f"[Pipeline] Text analysis failed: {e}")
        results["steps"]["text_analysis"] = f"failed: {e}"
        return None


def _run_similarity(complaint_id, text, db, results) -> list:
    try:
        from ..services.similarity_service import find_duplicates, store_embedding, auto_link_similar
        store_embedding(complaint_id, text, db)
        similar = find_duplicates(complaint_id, text, db)
        if similar:
            auto_link_similar(complaint_id, text, db)
        results["steps"]["similarity"] = "success"
        return similar
    except Exception as e:
        logger.warning(f"[Pipeline] Similarity analysis failed: {e}")
        results["steps"]["similarity"] = f"failed: {e}"
        return []


def _run_image_analysis(complaint_id, attachments, category, db, results) -> Optional[Dict]:
    if not attachments:
        results["steps"]["image_analysis"] = "skipped_no_images"
        return None
    try:
        from ..services.image_analysis_service import analyze_complaint_images
        analysis = analyze_complaint_images(complaint_id, attachments, category, db)
        results["steps"]["image_analysis"] = "success"
        return analysis
    except Exception as e:
        logger.warning(f"[Pipeline] Image analysis failed: {e}")
        results["steps"]["image_analysis"] = f"failed: {e}"
        return None


def _run_fusion(text_analysis, image_analysis, text, results) -> Optional[Dict]:
    try:
        from ..ai.fusion import fuse_severity

        text_severity = text_analysis.get("severity_score", 0) if text_analysis else 0
        image_severity = None
        image_relevance = 0.0
        has_image = False

        if image_analysis and image_analysis.get("status") == "completed":
            agg = image_analysis.get("aggregate", {})
            image_severity = agg.get("max_visual_severity")
            image_relevance = agg.get("avg_relevance_score", 0.0)
            has_image = agg.get("analyzed_images", 0) > 0

        fusion = fuse_severity(
            text_severity=text_severity,
            image_severity=image_severity,
            text_length=len(text),
            has_image=has_image,
            image_relevance=image_relevance,
        )
        results["steps"]["fusion"] = "success"
        return fusion
    except Exception as e:
        logger.warning(f"[Pipeline] Fusion failed: {e}")
        results["steps"]["fusion"] = f"failed: {e}"
        return None


def _gather_context(complaint_id, category, ward, db) -> Dict[str, Any]:
    """Gather contextual data for priority calculation."""
    context = {
        "same_ward_count": 0,
        "similar_count": 0,
        "dept_pending_count": 0,
        "ward_complaint_count": 0,
        "repeat_count": 0,
    }

    try:
        # Ward complaint count (last 30 days)
        if ward:
            from datetime import timedelta
            cutoff = datetime.utcnow() - timedelta(days=30)
            ward_docs = (
                db.collection("complaints")
                .where("ward", "==", ward)
                .where("created_at", ">=", cutoff)
                .get()
            )
            context["ward_complaint_count"] = len(ward_docs)
            context["same_ward_count"] = sum(
                1 for d in ward_docs
                if d.to_dict().get("category") == category and d.id != complaint_id
            )

        # Department pending task count
        cat_docs = db.collection("category_mappings").where("category", "==", category).limit(1).get()
        if cat_docs:
            dept_id = cat_docs[0].to_dict().get("department_id")
            if dept_id:
                pending_tasks = (
                    db.collection("tasks")
                    .where("department_id", "==", dept_id)
                    .where("status", "in", ["Pending", "Assigned", "In Progress"])
                    .get()
                )
                context["dept_pending_count"] = len(pending_tasks)

        # Repeat count (same ward + category in 90 days)
        if ward:
            from datetime import timedelta
            cutoff90 = datetime.utcnow() - timedelta(days=90)
            repeat_docs = (
                db.collection("complaints")
                .where("ward", "==", ward)
                .where("category", "==", category)
                .where("created_at", ">=", cutoff90)
                .get()
            )
            context["repeat_count"] = max(0, len(repeat_docs) - 1)

        # Similar complaint count
        sim_docs = db.collection("similarity_links").where("complaint_id_a", "==", complaint_id).get()
        sim_docs2 = db.collection("similarity_links").where("complaint_id_b", "==", complaint_id).get()
        context["similar_count"] = len(sim_docs) + len(sim_docs2)

    except Exception as e:
        logger.warning(f"[Pipeline] Context gathering partial failure: {e}")

    return context


def _run_priority(
    text, category, upvotes, text_analysis, fused_severity,
    context, created_at, deadline, results
) -> Optional[Dict]:
    try:
        from ..ai.priority import calculate_priority

        ai_urgency = text_analysis.get("urgency_score") if text_analysis else None
        fused_sev_val = fused_severity.get("fused_severity") if fused_severity else None

        priority = calculate_priority(
            text=text,
            category=category,
            upvotes=upvotes,
            ai_urgency_score=ai_urgency,
            fused_severity=fused_sev_val,
            same_ward_count=context.get("same_ward_count", 0),
            similar_count=context.get("similar_count", 0),
            created_at=created_at,
            deadline=deadline,
            dept_pending_count=context.get("dept_pending_count", 0),
            ward_complaint_count=context.get("ward_complaint_count", 0),
            repeat_count=context.get("repeat_count", 0),
        )
        results["steps"]["priority"] = "success"
        return priority
    except Exception as e:
        logger.warning(f"[Pipeline] Priority calculation failed: {e}")
        results["steps"]["priority"] = f"failed: {e}"
        return None


def _run_routing(complaint_id, category, text, text_analysis, similar, db, results) -> Optional[Dict]:
    try:
        from ..services.ai_routing import suggest_routing
        routing = suggest_routing(
            complaint_id=complaint_id,
            category=category,
            description=text,
            text_analysis=text_analysis or {},
            similar_complaints=similar or [],
            db=db,
        )
        results["steps"]["routing"] = "success"
        return routing
    except Exception as e:
        logger.warning(f"[Pipeline] Routing failed: {e}")
        results["steps"]["routing"] = f"failed: {e}"
        return None


def _log_inference(complaint_id, pipeline_id, latency_ms, results, db):
    """Log inference run for observability."""
    try:
        log_entry = {
            "complaint_id": complaint_id,
            "pipeline_run_id": pipeline_id,
            "steps": results.get("steps", {}),
            "latency_ms": latency_ms,
            "is_fallback": any("failed" in str(v) for v in results.get("steps", {}).values()),
            "created_at": datetime.utcnow(),
        }
        db.collection("inference_logs").add(log_entry)
    except Exception as e:
        logger.warning(f"[Pipeline] Inference logging failed: {e}")


def _parse_datetime(val) -> Optional[datetime]:
    """Parse datetime from Firestore value."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if hasattr(val, 'timestamp'):
        return datetime.fromtimestamp(val.timestamp())
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            pass
    return None


def _serialize_for_firestore(data: Any) -> Any:
    """Recursively serialize data for Firestore storage."""
    try:
        import numpy as np
        HAS_NUMPY = True
    except ImportError:
        HAS_NUMPY = False

    if isinstance(data, dict):
        return {k: _serialize_for_firestore(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_serialize_for_firestore(v) for v in data]
    elif HAS_NUMPY and isinstance(data, (np.integer,)):
        return int(data)
    elif HAS_NUMPY and isinstance(data, (np.floating,)):
        return float(data)
    elif HAS_NUMPY and isinstance(data, np.ndarray):
        return data.tolist()
    elif isinstance(data, datetime):
        return data
    return data
