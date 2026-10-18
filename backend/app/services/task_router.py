"""
Task Routing Service for Samadhan Setu Phase 1.
Generates tasks from complaints based on category-to-department mapping.
Supports multi-department task generation.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from ..models.task import Task, TaskStatus
from ..models.department import CategoryMapping
from .audit_service import write_audit_log


# Multi-category keywords: if a complaint matches these,
# route to additional departments beyond the primary.
MULTI_DEPT_KEYWORDS: Dict[str, List[str]] = {
    "Roads & Transport": ["road", "pothole", "traffic", "bridge", "footpath"],
    "Water Supply": ["water", "pipe", "drain", "sewage", "tap", "leaking"],
    "Electricity": ["power", "electricity", "streetlight", "wire", "transformer", "outage"],
    "Sanitation & Waste": ["garbage", "trash", "waste", "cleaning", "dump", "gutter"],
    "Health & Safety": ["health", "hospital", "disease", "mosquito", "safety", "fire"],
}


def detect_departments_from_text(description: str, primary_category: str) -> List[str]:
    """
    Detect additional departments from complaint text.
    Returns list of category names that the complaint touches.
    Always includes the primary category.
    """
    text_lower = description.lower()
    categories = {primary_category}

    for category, keywords in MULTI_DEPT_KEYWORDS.items():
        if category == primary_category:
            continue
        for keyword in keywords:
            if keyword in text_lower:
                categories.add(category)
                break

    return list(categories)


def generate_tasks_for_complaint(
    db,
    complaint_id: str,
    primary_category: str,
    description: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
) -> List[Task]:
    """
    Generate one or more tasks for a complaint.
    Uses category-to-department mapping to route tasks.
    Returns the list of created tasks.
    """
    categories = detect_departments_from_text(description, primary_category)
    created_tasks = []

    for category in categories:
        # Look up department for this category
        cat_docs = (
            db.collection("category_mappings")
            .where("category", "==", category)
            .limit(1)
            .get()
        )

        department_id = None
        department_name = category  # fallback display name

        if cat_docs:
            mapping = CategoryMapping.from_firestore(cat_docs[0])
            department_id = mapping.department_id

            # Resolve department name
            dept_doc = db.collection("departments").document(department_id).get()
            if dept_doc.exists:
                department_name = dept_doc.to_dict().get("name", category)

        if not department_id:
            continue  # skip if no mapping found

        task = Task(
            complaint_id=complaint_id,
            department_id=department_id,
            department_name=department_name,
            status=TaskStatus.PENDING,
            notes=f"Auto-generated task for {category}",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        doc_ref = db.collection("tasks").document()
        task.id = doc_ref.id
        doc_ref.set(task.to_firestore())
        created_tasks.append(task)

        write_audit_log(
            db,
            action="task_created",
            entity_type="task",
            entity_id=task.id,
            actor_id=actor_id,
            actor_role=actor_role,
            details={
                "complaint_id": complaint_id,
                "department_id": department_id,
                "department_name": department_name,
                "category": category,
            },
        )

    return created_tasks
