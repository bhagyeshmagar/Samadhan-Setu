"""
Image Analysis Service for Samadhan Setu Phase 2.

Orchestrates YOLOv8 image analysis for complaint evidence images.
Stores results in Firestore. Handles graceful degradation.
"""
import os
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from ..ai.yolo_validator import yolo_validator

logger = logging.getLogger(__name__)

UPLOAD_BASE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)


def analyze_complaint_images(
    complaint_id: str,
    image_paths: List[str],
    category: str,
    db,
) -> Dict[str, Any]:
    """
    Run YOLO analysis on all images for a complaint.

    Args:
        complaint_id: Firestore complaint ID
        image_paths: List of relative image paths (e.g., /uploads/citizen/xxx.jpg)
        category: Complaint category for relevance scoring
        db: Firestore client

    Returns:
        Dict with per-image analysis and aggregate summary
    """
    if not image_paths:
        return _store_result(complaint_id, db, {
            "status": "no_images",
            "images": [],
            "aggregate": _empty_aggregate(),
            "model_name": "yolov8n",
            "created_at": datetime.utcnow().isoformat(),
        })

    if not yolo_validator.is_available:
        result = {
            "status": "model_unavailable",
            "images": [{"path": p, "status": "skipped", "reason": "YOLO unavailable"} for p in image_paths],
            "aggregate": _empty_aggregate(),
            "model_name": "yolov8n",
            "is_fallback": True,
            "created_at": datetime.utcnow().isoformat(),
        }
        return _store_result(complaint_id, db, result)

    image_results = []
    total_objects = 0
    relevance_scores = []
    severity_scores = []

    for img_path in image_paths:
        # Resolve absolute path
        abs_path = _resolve_image_path(img_path)
        if not abs_path or not os.path.exists(abs_path):
            image_results.append({
                "path": img_path,
                "status": "file_not_found",
            })
            continue

        # Run YOLO detection
        detection_result = yolo_validator.analyze_image(abs_path)

        if detection_result["status"] == "error":
            image_results.append({
                "path": img_path,
                "status": "analysis_failed",
                "error": detection_result.get("error", "Unknown error"),
            })
            continue

        # Score relevance
        relevance = yolo_validator.score_relevance(
            detection_result["detections"], category
        )

        # Estimate visual severity
        severity = yolo_validator.estimate_visual_severity(
            detection_result["detections"]
        )

        image_results.append({
            "path": img_path,
            "status": "analyzed",
            "object_count": detection_result["object_count"],
            "detected_classes": detection_result["detected_classes"],
            "confidence_avg": detection_result["confidence_avg"],
            "quality_flag": detection_result["quality_flag"],
            "relevance_score": relevance["relevance_score"],
            "relevant_objects": relevance["relevant_objects"],
            "relevance_explanation": relevance["explanation"],
            "visual_severity": severity["visual_severity"],
            "severity_label": severity["severity_label"],
            "severity_explanation": severity["explanation"],
        })

        total_objects += detection_result["object_count"]
        relevance_scores.append(relevance["relevance_score"])
        severity_scores.append(severity["visual_severity"])

    # Aggregate
    analyzed_count = len([r for r in image_results if r.get("status") == "analyzed"])
    aggregate = {
        "total_images": len(image_paths),
        "analyzed_images": analyzed_count,
        "total_objects_detected": total_objects,
        "avg_relevance_score": (
            round(sum(relevance_scores) / len(relevance_scores), 3)
            if relevance_scores else 0.0
        ),
        "max_visual_severity": max(severity_scores) if severity_scores else 1,
        "has_relevant_evidence": any(s >= 0.4 for s in relevance_scores),
    }

    result = {
        "status": "completed",
        "images": image_results,
        "aggregate": aggregate,
        "model_name": "yolov8n",
        "is_fallback": False,
        "created_at": datetime.utcnow().isoformat(),
    }

    return _store_result(complaint_id, db, result)


def get_image_analysis(complaint_id: str, db) -> Optional[Dict[str, Any]]:
    """Retrieve stored image analysis for a complaint."""
    try:
        doc = db.collection("image_analysis_results").document(complaint_id).get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
    except Exception as e:
        logger.warning(f"[ImageAnalysis] Failed to fetch: {e}")
    return None


def _store_result(complaint_id: str, db, result: Dict) -> Dict[str, Any]:
    """Store image analysis result in Firestore."""
    try:
        db.collection("image_analysis_results").document(complaint_id).set(result)
    except Exception as e:
        logger.warning(f"[ImageAnalysis] Failed to store result: {e}")
    return result


def _resolve_image_path(relative_path: str) -> Optional[str]:
    """Convert relative upload path to absolute filesystem path."""
    if not relative_path:
        return None

    # Strip leading slash and 'uploads/' prefix
    clean = relative_path.lstrip("/")
    if clean.startswith("uploads/"):
        clean = clean[len("uploads/"):]

    abs_path = os.path.join(UPLOAD_BASE, clean)
    return abs_path


def _empty_aggregate() -> Dict[str, Any]:
    return {
        "total_images": 0,
        "analyzed_images": 0,
        "total_objects_detected": 0,
        "avg_relevance_score": 0.0,
        "max_visual_severity": 1,
        "has_relevant_evidence": False,
    }
