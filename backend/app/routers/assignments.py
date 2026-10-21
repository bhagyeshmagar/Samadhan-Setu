"""
Assignments Router — PostgreSQL edition.
Task assignment management: teams, load balancing, manual overrides.
"""
import uuid
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.session import get_async_session
from ..auth import get_current_user, require_officer, require_admin
from ..models.orm import User, Complaint
from ..models.orm.team import Team, TaskAssignment
from ..models.orm.enums import UserRole, ComplaintStatus
from ..repositories.user_repo import UserRepository

router = APIRouter(prefix="/api/assignments", tags=["Assignments"])


class TeamResponse(BaseModel):
    id: str
    name: str
    code: str
    department_id: str
    daily_capacity: int
    active_tasks: int
    load_ratio: float
    is_active: bool

    class Config:
        from_attributes = True


class AssignmentResponse(BaseModel):
    id: str
    complaint_id: str
    team_id: str
    assigned_at: datetime
    deadline: datetime
    load_score: Optional[float] = None
    reason: Optional[str] = None
    is_active: bool
    is_reassigned: bool

    class Config:
        from_attributes = True


class ReassignRequest(BaseModel):
    team_id: str
    reason: str


# ──────────────────────────────────────────────────────────────────────────────
# List teams
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/teams", response_model=List[TeamResponse])
async def list_teams(
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """List all active teams with their current load."""
    user_repo = UserRepository(session)
    query = select(Team).where(Team.is_active == True)
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")
        query = query.where(Team.department_id == officer.department_id)

    res = await session.execute(query.order_by(Team.name))
    teams = res.scalars().all()

    return [
        TeamResponse(
            id=str(t.id),
            name=t.name,
            code=t.code,
            department_id=str(t.department_id),
            daily_capacity=t.daily_capacity,
            active_tasks=t.active_tasks,
            load_ratio=round(t.active_tasks / max(t.daily_capacity, 1), 2),
            is_active=t.is_active,
        )
        for t in teams
    ]


# ──────────────────────────────────────────────────────────────────────────────
# List assignments for officer's department
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/", response_model=List[AssignmentResponse])
async def list_assignments(
    active_only: bool = True,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """List task assignments for the officer's department."""
    user_repo = UserRepository(session)
    query = select(TaskAssignment)
    if active_only:
        query = query.where(TaskAssignment.is_active == True)

    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")
        query = query.join(Team, TaskAssignment.team_id == Team.id).where(
            Team.department_id == officer.department_id
        )

    offset = (page - 1) * per_page
    query = query.order_by(TaskAssignment.assigned_at.desc()).limit(per_page).offset(offset)

    res = await session.execute(query)
    assignments = res.scalars().all()

    return [
        AssignmentResponse(
            id=str(a.id),
            complaint_id=str(a.complaint_id),
            team_id=str(a.team_id),
            assigned_at=a.assigned_at,
            deadline=a.deadline,
            load_score=a.load_score,
            reason=a.reason,
            is_active=a.is_active,
            is_reassigned=a.is_reassigned,
        )
        for a in assignments
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Manual reassign
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/{assignment_id}/reassign", response_model=AssignmentResponse)
async def reassign_complaint(
    assignment_id: str,
    body: ReassignRequest,
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Manually reassign a complaint to a different team in the department."""
    try:
        aid = uuid.UUID(assignment_id)
        new_team_id = uuid.UUID(body.team_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid UUID")

    res = await session.execute(select(TaskAssignment).where(TaskAssignment.id == aid))
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not assignment.is_active:
        raise HTTPException(status_code=400, detail="Assignment is no longer active")

    user_repo = UserRepository(session)
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if not officer or not officer.department_id:
            raise HTTPException(status_code=403, detail="Officer profile or department not assigned")

        res_team = await session.execute(select(Team).where(Team.id == assignment.team_id))
        old_team = res_team.scalar_one_or_none()
        if old_team and old_team.department_id != officer.department_id:
            raise HTTPException(status_code=403, detail="Access denied — assignment belongs to another department")

    # Verify target team exists
    res_new_team = await session.execute(select(Team).where(Team.id == new_team_id))
    new_team = res_new_team.scalar_one_or_none()
    if not new_team:
        raise HTTPException(status_code=404, detail="Target team not found")

    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        officer = await user_repo.get_officer_by_user_id(current_user.id)
        if officer and new_team.department_id != officer.department_id:
            raise HTTPException(status_code=400, detail="Cannot reassign to a team outside your department")

    # Deactivate old assignment
    old_team_id = assignment.team_id
    assignment.is_active = False
    assignment.is_reassigned = True
    assignment.reassigned_at = datetime.now(timezone.utc)
    assignment.reassignment_reason = body.reason

    # Create new assignment
    new_assignment = TaskAssignment(
        id=uuid.uuid4(),
        complaint_id=assignment.complaint_id,
        team_id=new_team_id,
        assigned_at=datetime.now(timezone.utc),
        deadline=assignment.deadline,
        reason=body.reason,
        is_reassigned=True,
        reassigned_from_team_id=old_team_id,
        reassigned_at=datetime.now(timezone.utc),
        reassignment_reason=body.reason,
        is_active=True,
    )
    session.add(new_assignment)
    await session.commit()
    await session.refresh(new_assignment)

    return AssignmentResponse(
        id=str(new_assignment.id),
        complaint_id=str(new_assignment.complaint_id),
        team_id=str(new_assignment.team_id),
        assigned_at=new_assignment.assigned_at,
        deadline=new_assignment.deadline,
        load_score=new_assignment.load_score,
        reason=new_assignment.reason,
        is_active=new_assignment.is_active,
        is_reassigned=new_assignment.is_reassigned,
    )
