"""
Admin Router for Samadhan Setu
Handles system administration: stats, departments, mappings, SLA
"""
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Query as FirestoreQuery

from ..database import get_db
from ..auth import get_current_user, require_admin
from ..models import (
    User, UserRole, Complaint, ComplaintStatus, ComplaintPriority,
    Department, CategoryMapping, SLARule
)
from ..schemas import (
    SLARuleCreate, SLARuleResponse, UserResponse, ComplaintStats,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse,
    CategoryMappingCreate, CategoryMappingResponse
)
from ..services.ai_bridge import ai_bridge

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/stats", response_model=ComplaintStats)
async def get_dashboard_stats(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    """
    Get comprehensive statistics for admin dashboard
    """
    # Note: For scale, we'd use AggregateQuery, but this is simpler for test-scale
    docs = db.collection('complaints').get()
    
    total = len(docs)
    pending = 0
    in_progress = 0
    resolved = 0
    rejected = 0
    
    by_category = {}
    by_priority = {}
    
    for doc in docs:
        data = doc.to_dict()
        
        # Status counts
        status = data.get('status')
        if status == ComplaintStatus.PENDING.value: pending += 1
        elif status == ComplaintStatus.IN_PROGRESS.value: in_progress += 1
        elif status == ComplaintStatus.RESOLVED.value: resolved += 1
        elif status == ComplaintStatus.REJECTED.value: rejected += 1
            
        # Category counts
        cat = data.get('category', 'Unknown')
        by_category[cat] = by_category.get(cat, 0) + 1
        
        # Priority counts
        pri = data.get('priority', 'Low')
        by_priority[pri] = by_priority.get(pri, 0) + 1
        
    return ComplaintStats(
        total=total,
        pending=pending,
        in_progress=in_progress,
        resolved=resolved,
        rejected=rejected,
        by_category=by_category,
        by_priority=by_priority
    )


@router.get("/stats/summary")
async def get_quick_stats(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    """
    Quick summary stats for dashboard cards
    """
    complaint_docs = db.collection('complaints').get()
    user_docs = db.collection('users').where('role', '==', UserRole.CITIZEN.value).get()
    
    total = len(complaint_docs)
    pending = 0
    resolved = 0
    
    for doc in complaint_docs:
        status = doc.to_dict().get('status')
        if status in [ComplaintStatus.PENDING.value, ComplaintStatus.IN_PROGRESS.value]:
            pending += 1
        elif status == ComplaintStatus.RESOLVED.value:
            resolved += 1
            
    users = len(user_docs)
    resolution_rate = round((resolved / total * 100), 1) if total > 0 else 0
    
    return {
        "total_complaints": total,
        "pending_action": pending,
        "resolved": resolved,
        "active_users": users,
        "resolution_rate": resolution_rate
    }


@router.get("/insights/clusters")
async def get_ai_insights(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    """
    Get AI-generated summaries of recurring patterns using clustering.
    Analytical tool for admins (Task #8).
    """
    docs = db.collection('complaints').order_by('created_at', direction=FirestoreQuery.DESCENDING).limit(200).get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]
    
    if not complaints or len(complaints) < 2:
        return []
    
    complaint_data = [
        {
            "id": c.id,
            "text": c.description,
            "ward": c.ward,
            "category": c.category,
            "location": c.location
        }
        for c in complaints
    ]
    
    insights = ai_bridge.get_complaint_patterns(complaint_data)
    
    return insights


# --- Department Management ---

@router.get("/departments", response_model=List[DepartmentResponse])
async def get_all_departments(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    docs = db.collection('departments').get()
    departments = [Department.from_firestore(doc) for doc in docs]
    return [DepartmentResponse.model_validate(d) for d in departments]


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    dept_data: DepartmentCreate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    existing = db.collection('departments').where('code', '==', dept_data.code).limit(1).get()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department code already exists"
        )
    
    new_dept = Department(
        name=dept_data.name,
        code=dept_data.code,
        description=dept_data.description,
        keywords=dept_data.keywords,
        contact_email=dept_data.contact_email,
        contact_phone=dept_data.contact_phone
    )
    
    doc_ref = db.collection('departments').document()
    new_dept.id = doc_ref.id
    doc_ref.set(new_dept.to_firestore())
    
    return DepartmentResponse.model_validate(new_dept)


@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    dept_data: DepartmentUpdate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    doc_ref = db.collection('departments').document(dept_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
    
    updates = {}
    if dept_data.name: updates['name'] = dept_data.name
    if dept_data.description: updates['description'] = dept_data.description
    if dept_data.keywords is not None: updates['keywords'] = dept_data.keywords
    if dept_data.contact_email: updates['contact_email'] = dept_data.contact_email
    if dept_data.contact_phone: updates['contact_phone'] = dept_data.contact_phone
    
    if updates:
        doc_ref.update(updates)
        
    updated_doc = doc_ref.get()
    dept = Department.from_firestore(updated_doc)
    
    return DepartmentResponse.model_validate(dept)


# --- Category Mapping ---

@router.get("/mappings", response_model=List[CategoryMappingResponse])
async def get_category_mappings(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    docs = db.collection('category_mappings').get()
    mappings = [CategoryMapping.from_firestore(doc) for doc in docs]
    return [CategoryMappingResponse.model_validate(m) for m in mappings]


@router.post("/mappings", response_model=CategoryMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_category_mapping(
    mapping_data: CategoryMappingCreate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    existing = db.collection('category_mappings').where('category', '==', mapping_data.category).limit(1).get()
    
    if existing:
        doc_ref = existing[0].reference
        doc_ref.update({
            'department_id': mapping_data.department_id,
            'priority_boost': mapping_data.priority_boost
        })
        updated_doc = doc_ref.get()
        mapping = CategoryMapping.from_firestore(updated_doc)
        return CategoryMappingResponse.model_validate(mapping)
    
    new_mapping = CategoryMapping(
        category=mapping_data.category,
        department_id=mapping_data.department_id,
        priority_boost=mapping_data.priority_boost
    )
    
    doc_ref = db.collection('category_mappings').document()
    new_mapping.id = doc_ref.id
    doc_ref.set(new_mapping.to_firestore())
    
    return CategoryMappingResponse.model_validate(new_mapping)


# --- SLA Rules ---

@router.get("/sla", response_model=List[SLARuleResponse])
async def get_sla_rules(
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    docs = db.collection('sla_rules').get()
    rules = [SLARule.from_firestore(doc) for doc in docs]
    return [SLARuleResponse.model_validate(r) for r in rules]


@router.post("/sla", response_model=SLARuleResponse, status_code=status.HTTP_201_CREATED)
async def create_sla_rule(
    sla_data: SLARuleCreate,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    new_rule = SLARule(
        category=sla_data.category,
        priority=sla_data.priority,
        resolution_hours=sla_data.resolution_hours,
        escalation_hours=sla_data.escalation_hours
    )
    
    doc_ref = db.collection('sla_rules').document()
    new_rule.id = doc_ref.id
    doc_ref.set(new_rule.to_firestore())
    
    return SLARuleResponse.model_validate(new_rule)


# --- User Management ---

@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    role: Optional[UserRole] = None,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    query = db.collection('users')
    if role:
        query = query.where('role', '==', role.value)
        
    docs = query.get()
    users = [User.from_firestore(doc) for doc in docs]
    return [UserResponse.model_validate(u) for u in users]


@router.get("/officers", response_model=List[UserResponse])
async def get_officers(
    department_id: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: Any = Depends(get_db)
):
    query = db.collection('users').where('role', '==', UserRole.OFFICER.value)
    if department_id:
        query = query.where('department_id', '==', department_id)
        
    docs = query.get()
    officers = [User.from_firestore(doc) for doc in docs]
    return [UserResponse.model_validate(o) for o in officers]
