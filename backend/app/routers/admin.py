"""
Admin Router for Samadhan Setu Phase 1.
Handles system administration: stats, departments, mappings, SLA, audit logs.
"""
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from google.cloud.firestore import Query as FirestoreQuery

from ..database import get_db
from ..auth import get_current_user, require_admin
from ..models import (
    User, UserRole, Complaint, ComplaintStatus, ComplaintPriority,
    Department, CategoryMapping, SLARule, Task, TaskStatus, AuditLog,
)
from ..schemas import (
    SLARuleCreate, SLARuleResponse, UserResponse, ComplaintStats,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse,
    CategoryMappingCreate, CategoryMappingResponse,
    TaskResponse, AuditLogResponse, ComplaintResponse,
)
from ..services.audit_service import write_audit_log

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ==================== DASHBOARD STATS ====================

@router.get("/stats", response_model=ComplaintStats)
async def get_dashboard_stats(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Comprehensive complaint statistics."""
    docs = db.collection("complaints").get()

    total = len(docs)
    counts = {s.value: 0 for s in ComplaintStatus}
    by_category = {}
    by_priority = {}

    for doc in docs:
        data = doc.to_dict()
        s = data.get("status", "")
        if s in counts:
            counts[s] += 1

        cat = data.get("category", "Unknown")
        by_category[cat] = by_category.get(cat, 0) + 1

        pri = data.get("priority", "Low")
        by_priority[pri] = by_priority.get(pri, 0) + 1

    return ComplaintStats(
        total=total,
        submitted=counts.get(ComplaintStatus.SUBMITTED.value, 0),
        verified=counts.get(ComplaintStatus.VERIFIED.value, 0),
        assigned=counts.get(ComplaintStatus.ASSIGNED.value, 0),
        in_progress=counts.get(ComplaintStatus.IN_PROGRESS.value, 0),
        resolved=counts.get(ComplaintStatus.RESOLVED.value, 0),
        closed=counts.get(ComplaintStatus.CLOSED.value, 0),
        reopened=counts.get(ComplaintStatus.REOPENED.value, 0),
        appealed=counts.get(ComplaintStatus.APPEALED.value, 0),
        by_category=by_category,
        by_priority=by_priority,
    )


@router.get("/stats/summary")
async def get_quick_stats(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Quick summary stats for dashboard cards."""
    complaint_docs = db.collection("complaints").get()
    user_docs = db.collection("users").where("role", "==", UserRole.CITIZEN.value).get()
    task_docs = db.collection("tasks").get()

    total = len(complaint_docs)
    active = sum(
        1
        for d in complaint_docs
        if d.to_dict().get("status") in [
            ComplaintStatus.SUBMITTED.value,
            ComplaintStatus.VERIFIED.value,
            ComplaintStatus.ASSIGNED.value,
            ComplaintStatus.IN_PROGRESS.value,
        ]
    )
    resolved = sum(1 for d in complaint_docs if d.to_dict().get("status") == ComplaintStatus.RESOLVED.value)
    total_tasks = len(task_docs)
    tasks_completed = sum(1 for d in task_docs if d.to_dict().get("status") == TaskStatus.COMPLETED.value)
    resolution_rate = round((resolved / total * 100), 1) if total > 0 else 0

    return {
        "total_complaints": total,
        "active_complaints": active,
        "resolved_complaints": resolved,
        "active_citizens": len(user_docs),
        "resolution_rate": resolution_rate,
        "total_tasks": total_tasks,
        "tasks_completed": tasks_completed,
    }


# ==================== COMPLAINT OVERVIEW ====================

@router.get("/complaints", response_model=List[ComplaintResponse])
async def get_all_complaints(
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin overview of all complaints."""
    query = db.collection("complaints")
    if status_filter:
        query = query.where("status", "==", status_filter)
    if category:
        query = query.where("category", "==", category)

    docs = query.get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]
    complaints.sort(key=lambda x: x.created_at, reverse=True)

    offset = (page - 1) * per_page
    paginated = complaints[offset : offset + per_page]

    return [ComplaintResponse.model_validate(c) for c in paginated]


# ==================== TASK OVERVIEW ====================

@router.get("/tasks", response_model=List[TaskResponse])
async def get_all_tasks(
    status_filter: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin overview of all tasks."""
    query = db.collection("tasks")
    if status_filter:
        query = query.where("status", "==", status_filter)
    if department_id:
        query = query.where("department_id", "==", department_id)

    docs = query.get()
    tasks = [Task.from_firestore(doc) for doc in docs]
    tasks.sort(key=lambda x: x.created_at, reverse=True)

    return [TaskResponse.model_validate(t) for t in tasks]


# ==================== AUDIT LOGS ====================

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Get audit logs with optional filters."""
    query = db.collection("audit_logs")
    if entity_type:
        query = query.where("entity_type", "==", entity_type)
    if entity_id:
        query = query.where("entity_id", "==", entity_id)
    if action:
        query = query.where("action", "==", action)

    docs = query.limit(limit).get()
    logs = [AuditLog.from_firestore(doc) for doc in docs]
    logs.sort(key=lambda x: x.created_at, reverse=True)

    return [AuditLogResponse.model_validate(l) for l in logs]


# ==================== DEPARTMENT MANAGEMENT ====================

@router.get("/departments", response_model=List[DepartmentResponse])
async def get_all_departments(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    docs = db.collection("departments").get()
    departments = [Department.from_firestore(doc) for doc in docs]
    return [DepartmentResponse.model_validate(d) for d in departments]


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    dept_data: DepartmentCreate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    existing = db.collection("departments").where("code", "==", dept_data.code).limit(1).get()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department code already exists")

    new_dept = Department(
        name=dept_data.name,
        code=dept_data.code,
        description=dept_data.description,
        keywords=dept_data.keywords,
        contact_email=dept_data.contact_email,
        contact_phone=dept_data.contact_phone,
    )

    doc_ref = db.collection("departments").document()
    new_dept.id = doc_ref.id
    doc_ref.set(new_dept.to_firestore())

    return DepartmentResponse.model_validate(new_dept)


@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    dept_data: DepartmentUpdate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    doc_ref = db.collection("departments").document(dept_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    updates = {}
    if dept_data.name:
        updates["name"] = dept_data.name
    if dept_data.description:
        updates["description"] = dept_data.description
    if dept_data.keywords is not None:
        updates["keywords"] = dept_data.keywords
    if dept_data.contact_email:
        updates["contact_email"] = dept_data.contact_email
    if dept_data.contact_phone:
        updates["contact_phone"] = dept_data.contact_phone

    if updates:
        doc_ref.update(updates)

    updated_doc = doc_ref.get()
    dept = Department.from_firestore(updated_doc)

    return DepartmentResponse.model_validate(dept)


# ==================== CATEGORY MAPPINGS ====================

@router.get("/mappings", response_model=List[CategoryMappingResponse])
async def get_category_mappings(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    docs = db.collection("category_mappings").get()
    mappings = [CategoryMapping.from_firestore(doc) for doc in docs]
    return [CategoryMappingResponse.model_validate(m) for m in mappings]


@router.post("/mappings", response_model=CategoryMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_category_mapping(
    mapping_data: CategoryMappingCreate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    existing = db.collection("category_mappings").where("category", "==", mapping_data.category).limit(1).get()

    if existing:
        doc_ref = existing[0].reference
        doc_ref.update({
            "department_id": mapping_data.department_id,
            "priority_boost": mapping_data.priority_boost,
        })
        updated_doc = doc_ref.get()
        mapping = CategoryMapping.from_firestore(updated_doc)

        write_audit_log(
            db,
            action="mapping_updated",
            entity_type="category_mapping",
            entity_id=updated_doc.id,
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            details={"category": mapping_data.category, "department_id": mapping_data.department_id},
        )

        return CategoryMappingResponse.model_validate(mapping)

    new_mapping = CategoryMapping(
        category=mapping_data.category,
        department_id=mapping_data.department_id,
        priority_boost=mapping_data.priority_boost,
    )

    doc_ref = db.collection("category_mappings").document()
    new_mapping.id = doc_ref.id
    doc_ref.set(new_mapping.to_firestore())

    write_audit_log(
        db,
        action="mapping_updated",
        entity_type="category_mapping",
        entity_id=new_mapping.id,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={"category": mapping_data.category, "department_id": mapping_data.department_id},
    )

    return CategoryMappingResponse.model_validate(new_mapping)


# ==================== SLA RULES ====================

@router.get("/sla", response_model=List[SLARuleResponse])
async def get_sla_rules(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    docs = db.collection("sla_rules").get()
    rules = [SLARule.from_firestore(doc) for doc in docs]
    return [SLARuleResponse.model_validate(r) for r in rules]


@router.post("/sla", response_model=SLARuleResponse, status_code=status.HTTP_201_CREATED)
async def create_sla_rule(
    sla_data: SLARuleCreate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    new_rule = SLARule(
        category=sla_data.category,
        priority=sla_data.priority,
        resolution_hours=sla_data.resolution_hours,
        escalation_hours=sla_data.escalation_hours,
    )

    doc_ref = db.collection("sla_rules").document()
    new_rule.id = doc_ref.id
    doc_ref.set(new_rule.to_firestore())

    return SLARuleResponse.model_validate(new_rule)


# ==================== USER MANAGEMENT ====================

@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    role: Optional[UserRole] = None,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    query = db.collection("users")
    if role:
        query = query.where("role", "==", role.value)

    docs = query.get()
    users = [User.from_firestore(doc) for doc in docs]
    return [UserResponse.model_validate(u) for u in users]


@router.get("/officers", response_model=List[UserResponse])
async def get_officers(
    department_id: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db),
):
    query = db.collection("users").where("role", "==", UserRole.OFFICER.value)
    if department_id:
        query = query.where("department_id", "==", department_id)

    docs = query.get()
    officers = [User.from_firestore(doc) for doc in docs]
    return [UserResponse.model_validate(o) for o in officers]
