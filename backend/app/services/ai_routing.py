"""
AI-Assisted Routing Service for Samadhan Setu Phase 2.

Suggests department routing, officer assignment, and urgency band
for each complaint. All suggestions are advisory — officers decide.
"""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


def suggest_routing(
    complaint_id: str,
    category: str,
    description: str,
    text_analysis: Dict[str, Any],
    similar_complaints: List[Dict],
    db,
) -> Dict[str, Any]:
    """
    Generate AI-assisted routing suggestion for a complaint.

    Returns:
        Dict with: primary_department, secondary_departments,
                   suggested_urgency_band, duplicate_links,
                   suggested_officer, explanation, status
    """
    from ..services.task_router import detect_departments_from_text

    # 1. Department suggestion from AI category
    suggested_category = text_analysis.get("category", category)
    departments = detect_departments_from_text(description, suggested_category)

    # Resolve department IDs and names
    primary_dept = _resolve_department(suggested_category, db)
    secondary_depts = []
    for dept_cat in departments:
        if dept_cat != suggested_category:
            resolved = _resolve_department(dept_cat, db)
            if resolved:
                secondary_depts.append(resolved)

    # 2. Urgency band from text analysis
    urgency_level = text_analysis.get("urgency_level", "Low")
    severity_level = text_analysis.get("severity_level", "Low")

    if urgency_level == "High" or severity_level == "High":
        suggested_band = "High"
    elif urgency_level == "Medium" or severity_level == "Medium":
        suggested_band = "Medium"
    else:
        suggested_band = "Low"

    # 3. Suggested officer (least loaded in primary department)
    suggested_officer = None
    if primary_dept:
        suggested_officer = _find_least_loaded_officer(
            primary_dept.get("department_id"), db
        )

    # 4. Duplicate links
    duplicate_links = [
        {
            "complaint_id": s["complaint_id"],
            "similarity_score": s["similarity_score"],
            "is_likely_duplicate": s.get("is_likely_duplicate", False),
        }
        for s in similar_complaints[:5]
    ]

    # Build explanation
    explanation_parts = []
    explanation_parts.append(
        f"AI suggests category '{suggested_category}' "
        f"(confidence: {text_analysis.get('category_confidence', 0)}%)"
    )
    if secondary_depts:
        names = [d.get("department_name", "Unknown") for d in secondary_depts]
        explanation_parts.append(f"Additional departments detected: {', '.join(names)}")
    if duplicate_links:
        explanation_parts.append(f"{len(duplicate_links)} similar complaint(s) found")
    explanation_parts.append(f"Suggested urgency: {suggested_band}")

    suggestion = {
        "complaint_id": complaint_id,
        "suggested_category": suggested_category,
        "primary_department": primary_dept,
        "secondary_departments": secondary_depts,
        "suggested_urgency_band": suggested_band,
        "duplicate_links": duplicate_links,
        "suggested_officer": suggested_officer,
        "explanation": ". ".join(explanation_parts),
        "status": "pending",  # pending / accepted / overridden
        "officer_override_reason": None,
        "created_at": datetime.utcnow().isoformat(),
    }

    # Store suggestion
    try:
        db.collection("routing_suggestions").document(complaint_id).set(suggestion)
    except Exception as e:
        logger.warning(f"[Routing] Failed to store suggestion: {e}")

    return suggestion


def get_routing_suggestion(complaint_id: str, db) -> Optional[Dict[str, Any]]:
    """Retrieve stored routing suggestion."""
    try:
        doc = db.collection("routing_suggestions").document(complaint_id).get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
    except Exception as e:
        logger.warning(f"[Routing] Failed to fetch: {e}")
    return None


def override_routing(
    complaint_id: str,
    officer_id: str,
    reason: str,
    db,
) -> bool:
    """Officer overrides AI routing suggestion."""
    try:
        doc_ref = db.collection("routing_suggestions").document(complaint_id)
        doc = doc_ref.get()
        if doc.exists:
            doc_ref.update({
                "status": "overridden",
                "officer_override_reason": reason,
                "overridden_by": officer_id,
                "updated_at": datetime.utcnow().isoformat(),
            })
            return True
    except Exception as e:
        logger.warning(f"[Routing] Override failed: {e}")
    return False


def _resolve_department(category: str, db) -> Optional[Dict[str, Any]]:
    """Resolve department ID and name from category."""
    try:
        docs = db.collection("category_mappings").where("category", "==", category).limit(1).get()
        if docs:
            mapping = docs[0].to_dict()
            dept_id = mapping.get("department_id")
            if dept_id:
                dept_doc = db.collection("departments").document(dept_id).get()
                dept_name = dept_doc.to_dict().get("name", category) if dept_doc.exists else category
                return {
                    "department_id": dept_id,
                    "department_name": dept_name,
                    "category": category,
                }
    except Exception as e:
        logger.warning(f"[Routing] Department resolution failed: {e}")
    return {"department_id": None, "department_name": category, "category": category}


def _find_least_loaded_officer(department_id: str, db) -> Optional[Dict[str, Any]]:
    """Find the officer with the fewest active tasks in a department."""
    if not department_id:
        return None

    try:
        # Get officers in this department
        officer_docs = (
            db.collection("users")
            .where("role", "==", "officer")
            .where("department_id", "==", department_id)
            .get()
        )

        if not officer_docs:
            return None

        # Count active tasks per officer
        task_docs = (
            db.collection("tasks")
            .where("department_id", "==", department_id)
            .get()
        )

        active_statuses = {"Pending", "Assigned", "In Progress"}
        officer_loads = {}

        for doc in officer_docs:
            officer_loads[doc.id] = {"id": doc.id, "name": doc.to_dict().get("name", ""), "active_tasks": 0}

        for task_doc in task_docs:
            task = task_doc.to_dict()
            if task.get("status") in active_statuses:
                officer_id = task.get("assigned_officer_id")
                if officer_id and officer_id in officer_loads:
                    officer_loads[officer_id]["active_tasks"] += 1

        if not officer_loads:
            return None

        # Return least loaded
        least_loaded = min(officer_loads.values(), key=lambda x: x["active_tasks"])
        return {
            "officer_id": least_loaded["id"],
            "officer_name": least_loaded["name"],
            "active_tasks": least_loaded["active_tasks"],
        }

    except Exception as e:
        logger.warning(f"[Routing] Officer lookup failed: {e}")
        return None
