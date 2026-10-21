"""
Admin Router — PostgreSQL edition.
System administration: stats, departments, officers, users, category mappings, SLA rules, audit logs.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.session import get_async_session
from ..auth import get_current_user, require_admin, get_password_hash
from ..models.orm import User, Complaint, Department, CategoryMapping, Officer
from ..models.orm.department import SLARule
from ..models.orm.enums import ComplaintStatus, ComplaintPriority, UserRole
from ..repositories.user_repo import UserRepository
from ..repositories.department_repo import DepartmentRepository
from ..schemas import (
    UserResponse, ComplaintStats,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse,
    CategoryMappingCreate, CategoryMappingResponse,
    SLARuleCreate, SLARuleResponse,
    OfficerCreate, OfficerResponse,
    ComplaintResponse, TaskResponse, AuditLogResponse,
)

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _dept_to_response(d: Department) -> DepartmentResponse:
    return DepartmentResponse(
        id=str(d.id),
        name=d.name,
        code=d.code,
        description=d.description,
        contact_email=d.contact_email,
        contact_phone=d.contact_phone,
        keywords=[],
        created_at=d.created_at,
    )


def _user_to_response(u: User) -> UserResponse:
    return UserResponse(
        id=str(u.id),
        email=u.email,
        name=u.name,
        phone=u.phone,
        role=u.role,
        created_at=u.created_at,
    )


def _officer_to_response(o: Officer) -> OfficerResponse:
    return OfficerResponse(
        id=str(o.id),
        user_id=str(o.user_id),
        email=o.user.email if o.user else "",
        name=o.user.name if o.user else "",
        phone=o.user.phone if o.user else None,
        department_id=str(o.department_id),
        department_name=o.department.name if o.department else None,
        employee_id=o.employee_id,
        designation=o.designation,
        is_active=o.is_active,
        total_resolved=o.total_resolved,
        avg_resolution_hours=o.avg_resolution_hours,
        rating=o.rating,
        created_at=o.created_at,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard stats
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=ComplaintStats)
async def get_dashboard_stats(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Comprehensive complaint statistics for admin dashboard."""
    total_res = await session.execute(select(func.count(Complaint.id)))
    total = total_res.scalar() or 0

    counts = {}
    for s in ComplaintStatus:
        res = await session.execute(select(func.count()).where(Complaint.status == s))
        counts[s.value] = res.scalar() or 0

    # Category breakdown
    cat_res = await session.execute(
        select(Complaint.category, func.count().label("n"))
        .group_by(Complaint.category)
        .order_by(func.count().desc())
    )
    by_category = {row.category: row.n for row in cat_res}

    # Priority breakdown
    pri_res = await session.execute(
        select(Complaint.priority, func.count().label("n"))
        .group_by(Complaint.priority)
    )
    by_priority = {row.priority.value: row.n for row in pri_res}

    return ComplaintStats(
        total=total,
        submitted=counts.get("submitted", 0),
        verified=counts.get("verified", 0),
        assigned=counts.get("assigned", 0),
        in_progress=counts.get("in_progress", 0),
        resolved=counts.get("resolved", 0),
        closed=counts.get("closed", 0),
        reopened=counts.get("reopened", 0),
        appealed=0,
        by_category=by_category,
        by_priority=by_priority,
    )


@router.get("/stats/summary")
async def get_stats_summary(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """High-level summary metrics used by admin dashboard cards."""
    total_res = await session.execute(select(func.count(Complaint.id)))
    total = total_res.scalar() or 0

    resolved_res = await session.execute(
        select(func.count()).where(Complaint.status == ComplaintStatus.RESOLVED)
    )
    resolved = resolved_res.scalar() or 0

    closed_res = await session.execute(
        select(func.count()).where(Complaint.status == ComplaintStatus.CLOSED)
    )
    closed = closed_res.scalar() or 0

    active_res = await session.execute(
        select(func.count()).where(
            Complaint.status.in_([
                ComplaintStatus.SUBMITTED,
                ComplaintStatus.VERIFIED,
                ComplaintStatus.ASSIGNED,
                ComplaintStatus.IN_PROGRESS,
            ])
        )
    )
    active = active_res.scalar() or 0

    total_resolved_closed = resolved + closed
    resolution_rate = round((total_resolved_closed / total * 100) if total else 0)

    # Task counts from assignments table
    try:
        from ..models.orm.team import Assignment
        tasks_total_res = await session.execute(select(func.count(Assignment.id)))
        tasks_total = tasks_total_res.scalar() or 0
        tasks_done_res = await session.execute(
            select(func.count()).where(Assignment.status == "completed")
        )
        tasks_done = tasks_done_res.scalar() or 0
    except Exception:
        tasks_total = 0
        tasks_done = 0

    return {
        "total_complaints": total,
        "active_complaints": active,
        "resolved_complaints": total_resolved_closed,
        "resolution_rate": resolution_rate,
        "total_tasks": tasks_total,
        "tasks_completed": tasks_done,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Complaints (admin view — all complaints)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/complaints")
async def list_all_complaints(
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """List all complaints system-wide. Admin only."""
    query = select(Complaint).order_by(Complaint.created_at.desc())

    if status_filter:
        try:
            s_enum = ComplaintStatus(status_filter)
            query = query.where(Complaint.status == s_enum)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid status: {status_filter}")

    if category:
        query = query.where(Complaint.category.ilike(f"%{category}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total_res = await session.execute(count_q)
    total = total_res.scalar() or 0

    offset = (page - 1) * per_page
    query = query.limit(per_page).offset(offset)
    res = await session.execute(query)
    complaints = res.scalars().all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "complaints": [
            {
                "id": str(c.id),
                "title": c.title,
                "category": c.category,
                "status": c.status.value,
                "priority": c.priority.value,
                "location": c.location,
                "ward": c.ward,
                "user_id": str(c.user_id),
                "department_id": str(c.department_id) if c.department_id else None,
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
            }
            for c in complaints
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Tasks (admin view — all tasks)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_all_tasks(
    status_filter: Optional[str] = None,
    department_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """List all tasks/assignments system-wide. Admin only."""
    try:
        from ..models.orm.team import Assignment
    except ImportError:
        return {"total": 0, "page": page, "per_page": per_page, "tasks": []}

    query = (
        select(Assignment)
        .options(selectinload(Assignment.complaint), selectinload(Assignment.department))
        .order_by(Assignment.created_at.desc())
    )

    if status_filter:
        query = query.where(Assignment.status == status_filter)
    if department_id:
        try:
            dept_uuid = uuid.UUID(department_id)
            query = query.where(Assignment.department_id == dept_uuid)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid department_id UUID")

    count_q = select(func.count()).select_from(query.subquery())
    total_res = await session.execute(count_q)
    total = total_res.scalar() or 0

    offset = (page - 1) * per_page
    query = query.limit(per_page).offset(offset)
    res = await session.execute(query)
    tasks = res.scalars().all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "tasks": [
            {
                "id": str(t.id),
                "complaint_id": str(t.complaint_id),
                "department_id": str(t.department_id),
                "department_name": t.department.name if t.department else None,
                "status": t.status,
                "notes": t.notes,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in tasks
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Audit Logs
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
async def list_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """List audit log entries. Admin only."""
    try:
        from ..models.orm.audit import AuditLog
    except ImportError:
        return []

    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)

    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    if action:
        query = query.where(AuditLog.action == action)

    res = await session.execute(query)
    logs = res.scalars().all()

    return [
        {
            "id": str(log.id),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_role": log.actor_role,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Officer management (full CRUD)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/officers", response_model=List[OfficerResponse])
async def list_officers(
    department_id: Optional[str] = None,
    active_only: bool = Query(True),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """List all officers with optional department filter."""
    query = (
        select(Officer)
        .options(selectinload(Officer.user), selectinload(Officer.department))
        .order_by(Officer.created_at.desc())
    )

    if active_only:
        query = query.where(Officer.is_active == True)
    if department_id:
        try:
            dept_uuid = uuid.UUID(department_id)
            query = query.where(Officer.department_id == dept_uuid)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid department_id UUID")

    offset = (page - 1) * per_page
    query = query.limit(per_page).offset(offset)
    res = await session.execute(query)
    officers = res.scalars().all()
    return [_officer_to_response(o) for o in officers]


@router.post("/officers", response_model=OfficerResponse, status_code=201)
async def create_officer(
    officer_data: OfficerCreate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a new officer account. Creates both the User and Officer profile."""
    # Validate department
    try:
        dept_uuid = uuid.UUID(officer_data.department_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid department_id UUID")

    dept_res = await session.execute(select(Department).where(Department.id == dept_uuid))
    dept = dept_res.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check email uniqueness
    email_clean = officer_data.email.strip().lower()
    email_res = await session.execute(select(User).where(User.email == email_clean))
    if email_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check employee_id uniqueness
    emp_clean = officer_data.employee_id.strip()
    emp_res = await session.execute(
        select(Officer).where(Officer.employee_id == emp_clean)
    )
    if emp_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee ID already in use")

    phone_clean = officer_data.phone.strip() if officer_data.phone and officer_data.phone.strip() else None
    if phone_clean:
        phone_res = await session.execute(select(User).where(User.phone == phone_clean))
        if phone_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Phone number already registered to another user")

    # Create user
    new_user = User(
        id=uuid.uuid4(),
        email=email_clean,
        name=officer_data.name.strip(),
        phone=phone_clean,
        password_hash=get_password_hash(officer_data.password),
        role=UserRole.OFFICER,
    )
    session.add(new_user)
    await session.flush()  # get new_user.id without committing

    # Create officer profile
    new_officer = Officer(
        id=uuid.uuid4(),
        user_id=new_user.id,
        department_id=dept_uuid,
        employee_id=emp_clean,
        designation=officer_data.designation.strip() if officer_data.designation else None,
        jurisdiction_wards=officer_data.jurisdiction_wards,
    )
    session.add(new_officer)
    await session.commit()

    # Re-fetch with relationships
    officer_res = await session.execute(
        select(Officer)
        .options(selectinload(Officer.user), selectinload(Officer.department))
        .where(Officer.id == new_officer.id)
    )
    officer = officer_res.scalar_one()
    return _officer_to_response(officer)


@router.put("/officers/{officer_id}", response_model=OfficerResponse)
async def update_officer(
    officer_id: str,
    department_id: Optional[str] = None,
    designation: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Update an officer's department, designation, or active status."""
    try:
        oid = uuid.UUID(officer_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid officer_id UUID")

    officer_res = await session.execute(
        select(Officer)
        .options(selectinload(Officer.user), selectinload(Officer.department))
        .where(Officer.id == oid)
    )
    officer = officer_res.scalar_one_or_none()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")

    if department_id is not None:
        try:
            dept_uuid = uuid.UUID(department_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid department_id UUID")
        dept_res = await session.execute(select(Department).where(Department.id == dept_uuid))
        if not dept_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Department not found")
        officer.department_id = dept_uuid

    if designation is not None:
        officer.designation = designation
    if is_active is not None:
        officer.is_active = is_active

    await session.commit()

    officer_res2 = await session.execute(
        select(Officer)
        .options(selectinload(Officer.user), selectinload(Officer.department))
        .where(Officer.id == oid)
    )
    officer = officer_res2.scalar_one()
    return _officer_to_response(officer)


@router.delete("/officers/{officer_id}")
async def deactivate_officer(
    officer_id: str,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Deactivate an officer (soft delete). Sets is_active=False."""
    try:
        oid = uuid.UUID(officer_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid officer_id UUID")

    officer_res = await session.execute(select(Officer).where(Officer.id == oid))
    officer = officer_res.scalar_one_or_none()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")

    officer.is_active = False
    await session.commit()
    return {"message": f"Officer {officer_id} deactivated"}


@router.post("/users/{user_id}/make-officer", response_model=OfficerResponse)
async def promote_to_officer(
    user_id: str,
    department_id: str,
    employee_id: str,
    designation: Optional[str] = None,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Promote an existing citizen user to officer role."""
    try:
        uid = uuid.UUID(user_id)
        dept_id = uuid.UUID(department_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    repo = UserRepository(session)
    user = await repo.get_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check employee_id uniqueness
    existing = await session.execute(select(Officer).where(Officer.employee_id == employee_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Employee ID already in use")

    user.role = UserRole.OFFICER
    new_officer = Officer(
        id=uuid.uuid4(),
        user_id=uid,
        department_id=dept_id,
        employee_id=employee_id,
        designation=designation,
    )
    session.add(new_officer)
    await session.commit()

    officer_res = await session.execute(
        select(Officer)
        .options(selectinload(Officer.user), selectinload(Officer.department))
        .where(Officer.id == new_officer.id)
    )
    officer = officer_res.scalar_one()
    return _officer_to_response(officer)


# ──────────────────────────────────────────────────────────────────────────────
# User management
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """List all users with optional role filter."""
    query = select(User).order_by(User.created_at.desc())
    if role:
        try:
            role_enum = UserRole(role)
            query = query.where(User.role == role_enum)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid role: {role}")

    offset = (page - 1) * per_page
    query = query.limit(per_page).offset(offset)
    res = await session.execute(query)
    return [_user_to_response(u) for u in res.scalars().all()]


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Deactivate a user account (soft delete)."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    repo = UserRepository(session)
    user = await repo.get_by_id(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    user.is_active = False
    await session.commit()
    return {"message": f"User {user.email} deactivated"}


# ──────────────────────────────────────────────────────────────────────────────
# Department management
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """List all active departments. Available to any authenticated user."""
    repo = DepartmentRepository(session)
    departments = await repo.list_all(active_only=False)
    return [_dept_to_response(d) for d in departments]


@router.post("/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(
    dept_data: DepartmentCreate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a new government department."""
    repo = DepartmentRepository(session)
    existing = await repo.get_by_code(dept_data.code.upper())
    if existing:
        raise HTTPException(status_code=400, detail=f"Department code '{dept_data.code}' already exists")

    dept = Department(
        id=uuid.uuid4(),
        name=dept_data.name,
        code=dept_data.code.upper(),
        description=dept_data.description,
        contact_email=dept_data.contact_email,
        contact_phone=dept_data.contact_phone,
    )
    session.add(dept)
    await session.commit()
    await session.refresh(dept)
    return _dept_to_response(dept)


@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: str,
    update_data: DepartmentUpdate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Update a department's metadata."""
    try:
        did = uuid.UUID(dept_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    repo = DepartmentRepository(session)
    dept = await repo.get_by_id(did)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if update_data.name is not None:
        dept.name = update_data.name
    if update_data.description is not None:
        dept.description = update_data.description
    if update_data.contact_email is not None:
        dept.contact_email = update_data.contact_email
    if update_data.contact_phone is not None:
        dept.contact_phone = update_data.contact_phone

    await session.commit()
    await session.refresh(dept)
    return _dept_to_response(dept)


@router.delete("/departments/{dept_id}")
async def delete_department(
    dept_id: str,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Soft-delete (deactivate) a department."""
    try:
        did = uuid.UUID(dept_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    repo = DepartmentRepository(session)
    dept = await repo.get_by_id(did)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check if department has active officers
    officer_res = await session.execute(
        select(func.count()).where(Officer.department_id == did, Officer.is_active == True)
    )
    active_officers = officer_res.scalar() or 0
    if active_officers > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {active_officers} active officer(s). Reassign officers first."
        )

    dept.is_active = False
    await session.commit()
    return {"message": f"Department '{dept.name}' deactivated"}


# ──────────────────────────────────────────────────────────────────────────────
# Category mappings
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/mappings", response_model=List[CategoryMappingResponse])
async def list_category_mappings(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """List all category → department mappings."""
    res = await session.execute(select(CategoryMapping).order_by(CategoryMapping.category))
    mappings = res.scalars().all()
    return [
        CategoryMappingResponse(
            id=str(m.id),
            category=m.category,
            department_id=str(m.department_id),
            priority_boost=0,
        )
        for m in mappings
    ]


@router.post("/mappings", response_model=CategoryMappingResponse, status_code=201)
async def create_category_mapping(
    mapping_data: CategoryMappingCreate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Map a complaint category to a department."""
    try:
        dept_id = uuid.UUID(mapping_data.department_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid department UUID")

    existing = await session.execute(
        select(CategoryMapping).where(CategoryMapping.category.ilike(mapping_data.category))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Category '{mapping_data.category}' already mapped")

    mapping = CategoryMapping(
        id=uuid.uuid4(),
        category=mapping_data.category,
        department_id=dept_id,
    )
    session.add(mapping)
    await session.commit()
    await session.refresh(mapping)

    return CategoryMappingResponse(
        id=str(mapping.id),
        category=mapping.category,
        department_id=str(mapping.department_id),
        priority_boost=0,
    )


@router.delete("/mappings/{mapping_id}")
async def delete_category_mapping(
    mapping_id: str,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete a category → department mapping."""
    try:
        mid = uuid.UUID(mapping_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    res = await session.execute(select(CategoryMapping).where(CategoryMapping.id == mid))
    mapping = res.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")

    await session.delete(mapping)
    await session.commit()
    return {"message": "Mapping deleted"}


# ──────────────────────────────────────────────────────────────────────────────
# SLA Rules
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/sla", response_model=List[SLARuleResponse])
async def list_sla_rules(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """List all SLA resolution rules."""
    res = await session.execute(select(SLARule).order_by(SLARule.created_at))
    rules = res.scalars().all()
    return [
        SLARuleResponse(
            id=str(r.id),
            category=r.category,
            priority=r.priority,
            resolution_hours=r.resolution_hours,
            escalation_hours=r.escalation_hours,
            created_at=r.created_at,
        )
        for r in rules
    ]


@router.post("/sla", response_model=SLARuleResponse, status_code=201)
async def create_sla_rule(
    rule_data: SLARuleCreate,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a new SLA resolution rule."""
    rule = SLARule(
        id=uuid.uuid4(),
        category=rule_data.category,
        priority=rule_data.priority,
        resolution_hours=rule_data.resolution_hours,
        escalation_hours=rule_data.escalation_hours or int(rule_data.resolution_hours * 1.5),
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)

    return SLARuleResponse(
        id=str(rule.id),
        category=rule.category,
        priority=rule.priority,
        resolution_hours=rule.resolution_hours,
        escalation_hours=rule.escalation_hours,
        created_at=rule.created_at,
    )
