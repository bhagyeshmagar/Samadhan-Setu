"""
Admin Router for Samadhan Setu
Handles system administration: stats, departments, mappings, SLA
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

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
    db: Session = Depends(get_db)
):
    """
    Get comprehensive statistics for admin dashboard
    """
    # Total counts
    total = db.query(Complaint).count()
    pending = db.query(Complaint).filter(Complaint.status == ComplaintStatus.PENDING).count()
    in_progress = db.query(Complaint).filter(Complaint.status == ComplaintStatus.IN_PROGRESS).count()
    resolved = db.query(Complaint).filter(Complaint.status == ComplaintStatus.RESOLVED).count()
    rejected = db.query(Complaint).filter(Complaint.status == ComplaintStatus.REJECTED).count()
    
    # By category
    category_stats = db.query(
        Complaint.category,
        func.count(Complaint.id)
    ).group_by(Complaint.category).all()
    by_category = {cat: count for cat, count in category_stats}
    
    # By priority
    priority_stats = db.query(
        Complaint.priority,
        func.count(Complaint.id)
    ).group_by(Complaint.priority).all()
    by_priority = {str(priority.value): count for priority, count in priority_stats}
    
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
    db: Session = Depends(get_db)
):
    """
    Quick summary stats for dashboard cards
    """
    total = db.query(Complaint).count()
    pending = db.query(Complaint).filter(
        Complaint.status.in_([ComplaintStatus.PENDING, ComplaintStatus.IN_PROGRESS])
    ).count()
    resolved = db.query(Complaint).filter(Complaint.status == ComplaintStatus.RESOLVED).count()
    users = db.query(User).filter(User.role == UserRole.CITIZEN).count()
    
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
    db: Session = Depends(get_db)
):
    """
    Get AI-generated summaries of recurring patterns using clustering.
    Analytical tool for admins (Task #8).
    """
    # 1. Fetch relevant complaints (e.g., last 100 or all pending)
    complaints = db.query(Complaint).order_by(Complaint.created_at.desc()).limit(200).all()
    
    if not complaints or len(complaints) < 2:
        return []
    
    # 2. Prepare data for AI Bridge
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
    
    # 3. Call AI Service via Bridge
    insights = ai_bridge.get_complaint_patterns(complaint_data)
    
    return insights


# --- Department Management ---

@router.get("/departments", response_model=List[DepartmentResponse])
async def get_all_departments(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all departments
    """
    departments = db.query(Department).all()
    return [DepartmentResponse.model_validate(d) for d in departments]


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    dept_data: DepartmentCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new department
    """
    # Check if code exists
    existing = db.query(Department).filter(Department.code == dept_data.code).first()
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
    
    db.add(new_dept)
    db.commit()
    db.refresh(new_dept)
    
    return DepartmentResponse.model_validate(new_dept)


@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: int,
    dept_data: DepartmentUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update a department
    """
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
    
    if dept_data.name:
        dept.name = dept_data.name
    if dept_data.description:
        dept.description = dept_data.description
    if dept_data.keywords is not None:
        dept.keywords = dept_data.keywords
    if dept_data.contact_email:
        dept.contact_email = dept_data.contact_email
    if dept_data.contact_phone:
        dept.contact_phone = dept_data.contact_phone
    
    db.commit()
    db.refresh(dept)
    
    return DepartmentResponse.model_validate(dept)


# --- Category Mapping ---

@router.get("/mappings", response_model=List[CategoryMappingResponse])
async def get_category_mappings(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all category-to-department mappings
    """
    mappings = db.query(CategoryMapping).all()
    return [CategoryMappingResponse.model_validate(m) for m in mappings]


@router.post("/mappings", response_model=CategoryMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_category_mapping(
    mapping_data: CategoryMappingCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create or update a category-to-department mapping
    """
    # Check if mapping exists
    existing = db.query(CategoryMapping).filter(
        CategoryMapping.category == mapping_data.category
    ).first()
    
    if existing:
        # Update existing
        existing.department_id = mapping_data.department_id
        existing.priority_boost = mapping_data.priority_boost
        db.commit()
        db.refresh(existing)
        return CategoryMappingResponse.model_validate(existing)
    
    # Create new
    new_mapping = CategoryMapping(
        category=mapping_data.category,
        department_id=mapping_data.department_id,
        priority_boost=mapping_data.priority_boost
    )
    
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    
    return CategoryMappingResponse.model_validate(new_mapping)


# --- SLA Rules ---

@router.get("/sla", response_model=List[SLARuleResponse])
async def get_sla_rules(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all SLA rules
    """
    rules = db.query(SLARule).all()
    return [SLARuleResponse.model_validate(r) for r in rules]


@router.post("/sla", response_model=SLARuleResponse, status_code=status.HTTP_201_CREATED)
async def create_sla_rule(
    sla_data: SLARuleCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new SLA rule
    """
    new_rule = SLARule(
        category=sla_data.category,
        priority=sla_data.priority,
        resolution_hours=sla_data.resolution_hours,
        escalation_hours=sla_data.escalation_hours
    )
    
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    
    return SLARuleResponse.model_validate(new_rule)


# --- User Management ---

@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    role: Optional[UserRole] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all users, optionally filtered by role
    """
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    
    users = query.all()
    return [UserResponse.model_validate(u) for u in users]


@router.get("/officers", response_model=List[UserResponse])
async def get_officers(
    department_id: Optional[int] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all department officers
    """
    query = db.query(User).filter(User.role == UserRole.OFFICER)
    
    if department_id:
        query = query.filter(User.department_id == department_id)
    
    officers = query.all()
    return [UserResponse.model_validate(o) for o in officers]
