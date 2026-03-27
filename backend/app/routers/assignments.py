"""
Assignments Router
==================
API endpoints for managing AI-driven task assignments.
Provides visibility and override capabilities for department heads.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..auth import get_current_user
from ..models import User, UserRole, Team, TaskAssignment, AssignmentLog, Complaint

router = APIRouter(prefix="/api/assignments", tags=["Assignments"])


# ========== Pydantic Schemas ==========

class TeamResponse(BaseModel):
    id: int
    name: str
    code: str
    department_id: int
    daily_capacity: int
    active_tasks: int
    load_ratio: float
    ward_coverage: Optional[List[str]] = None
    is_active: bool
    
    class Config:
        from_attributes = True


class AssignmentResponse(BaseModel):
    id: int
    complaint_id: int
    team_id: int
    team_name: Optional[str] = None
    assigned_at: datetime
    deadline: datetime
    load_score: Optional[float] = None
    reason: Optional[str] = None
    is_reassigned: bool
    reassigned_from_team_id: Optional[int] = None
    reassignment_reason: Optional[str] = None
    is_active: bool
    
    class Config:
        from_attributes = True


class OverrideRequest(BaseModel):
    new_team_id: int
    reason: str


class ReassignmentCheckResponse(BaseModel):
    checked_at: str
    sla_risk_checked: int
    overload_checked: int
    reassignments: List[dict]


# ========== Endpoints ==========

@router.get("/teams", response_model=List[TeamResponse])
async def get_teams(
    department_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all teams, optionally filtered by department.
    Officers see their department's teams, admins see all.
    """
    query = db.query(Team)
    
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.filter(Team.department_id == current_user.department_id)
    elif department_id:
        query = query.filter(Team.department_id == department_id)
    
    teams = query.all()
    
    return [
        TeamResponse(
            id=t.id,
            name=t.name,
            code=t.code,
            department_id=t.department_id,
            daily_capacity=t.daily_capacity,
            active_tasks=t.active_tasks,
            load_ratio=t.load_ratio,
            ward_coverage=t.ward_coverage,
            is_active=t.is_active
        )
        for t in teams
    ]


@router.get("/team/{team_id}", response_model=List[AssignmentResponse])
async def get_team_assignments(
    team_id: int,
    active_only: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all assignments for a specific team.
    """
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Check access
    if current_user.role == UserRole.OFFICER:
        if current_user.department_id != team.department_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    query = db.query(TaskAssignment).filter(TaskAssignment.team_id == team_id)
    
    if active_only:
        query = query.filter(TaskAssignment.is_active == True)
    
    assignments = query.order_by(TaskAssignment.deadline.asc()).all()
    
    return [
        AssignmentResponse(
            id=a.id,
            complaint_id=a.complaint_id,
            team_id=a.team_id,
            team_name=team.name,
            assigned_at=a.assigned_at,
            deadline=a.deadline,
            load_score=a.load_score,
            reason=a.reason,
            is_reassigned=a.is_reassigned,
            reassigned_from_team_id=a.reassigned_from_team_id,
            reassignment_reason=a.reassignment_reason,
            is_active=a.is_active
        )
        for a in assignments
    ]


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get details of a specific assignment.
    """
    assignment = db.query(TaskAssignment).filter(
        TaskAssignment.id == assignment_id
    ).first()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    team = db.query(Team).filter(Team.id == assignment.team_id).first()
    
    return AssignmentResponse(
        id=assignment.id,
        complaint_id=assignment.complaint_id,
        team_id=assignment.team_id,
        team_name=team.name if team else None,
        assigned_at=assignment.assigned_at,
        deadline=assignment.deadline,
        load_score=assignment.load_score,
        reason=assignment.reason,
        is_reassigned=assignment.is_reassigned,
        reassigned_from_team_id=assignment.reassigned_from_team_id,
        reassignment_reason=assignment.reassignment_reason,
        is_active=assignment.is_active
    )


@router.post("/{assignment_id}/override", response_model=AssignmentResponse)
async def override_assignment(
    assignment_id: int,
    override: OverrideRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually override an AI assignment (Admin/Officer only).
    This is the human-in-the-loop control for governance compliance.
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.OFFICER]:
        raise HTTPException(status_code=403, detail="Override requires admin or officer role")
    
    assignment = db.query(TaskAssignment).filter(
        TaskAssignment.id == assignment_id
    ).first()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    new_team = db.query(Team).filter(Team.id == override.new_team_id).first()
    if not new_team:
        raise HTTPException(status_code=404, detail="New team not found")
    
    old_team = db.query(Team).filter(Team.id == assignment.team_id).first()
    
    # Update assignment
    old_team_id = assignment.team_id
    assignment.team_id = new_team.id
    assignment.is_reassigned = True
    assignment.reassigned_from_team_id = old_team_id
    assignment.reassignment_reason = f"Manual override by {current_user.name}: {override.reason}"
    assignment.reassigned_at = datetime.utcnow()
    
    # Update complaint
    complaint = db.query(Complaint).filter(
        Complaint.id == assignment.complaint_id
    ).first()
    if complaint:
        complaint.assigned_team_id = new_team.id
    
    # Update team task counts
    if old_team:
        old_team.active_tasks = max(0, old_team.active_tasks - 1)
    new_team.active_tasks += 1
    
    # Log the override
    log = AssignmentLog(
        assignment_id=assignment.id,
        event_type="OVERRIDDEN",
        details={
            "from_team_id": old_team_id,
            "to_team_id": new_team.id,
            "reason": override.reason,
            "overridden_by": current_user.id
        },
        triggered_by="ADMIN"
    )
    db.add(log)
    db.commit()
    db.refresh(assignment)
    
    return AssignmentResponse(
        id=assignment.id,
        complaint_id=assignment.complaint_id,
        team_id=assignment.team_id,
        team_name=new_team.name,
        assigned_at=assignment.assigned_at,
        deadline=assignment.deadline,
        load_score=assignment.load_score,
        reason=assignment.reason,
        is_reassigned=True,
        reassigned_from_team_id=old_team_id,
        reassignment_reason=assignment.reassignment_reason,
        is_active=assignment.is_active
    )


@router.post("/check-reassignments", response_model=ReassignmentCheckResponse)
async def trigger_reassignment_check(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger the AI reassignment check.
    In production, this runs on a schedule. This endpoint is for testing/admin use.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    from ..services.auto_reassigner import run_reassignment_check
    
    results = run_reassignment_check(db)
    
    return ReassignmentCheckResponse(
        checked_at=results["checked_at"],
        sla_risk_checked=results["sla_risk_checked"],
        overload_checked=results["overload_checked"],
        reassignments=results["reassignments"]
    )
