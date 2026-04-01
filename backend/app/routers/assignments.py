"""
Assignments Router
==================
API endpoints for managing AI-driven task assignments.
Provides visibility and override capabilities for department heads.
"""
from typing import List, Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from google.cloud.firestore import Query as FirestoreQuery

from ..database import get_db
from ..auth import get_current_user
from ..models import User, UserRole, Team, TaskAssignment, AssignmentLog, Complaint

router = APIRouter(prefix="/api/assignments", tags=["Assignments"])


# ========== Pydantic Schemas ==========

class TeamResponse(BaseModel):
    id: str
    name: str
    code: str
    department_id: str
    daily_capacity: int
    active_tasks: int
    load_ratio: float
    ward_coverage: Optional[List[str]] = None
    is_active: bool
    
    class Config:
        from_attributes = True


class AssignmentResponse(BaseModel):
    id: str
    complaint_id: str
    team_id: str
    team_name: Optional[str] = None
    assigned_at: datetime
    deadline: datetime
    load_score: Optional[float] = None
    reason: Optional[str] = None
    is_reassigned: bool
    reassigned_from_team_id: Optional[str] = None
    reassignment_reason: Optional[str] = None
    is_active: bool
    
    class Config:
        from_attributes = True


class OverrideRequest(BaseModel):
    new_team_id: str
    reason: str


class ReassignmentCheckResponse(BaseModel):
    checked_at: str
    sla_risk_checked: int
    overload_checked: int
    reassignments: List[dict]


# ========== Endpoints ==========

@router.get("/teams", response_model=List[TeamResponse])
async def get_teams(
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Get all teams, optionally filtered by department.
    Officers see their department's teams, admins see all.
    """
    query = db.collection('teams')
    
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.where('department_id', '==', current_user.department_id)
    elif department_id:
        query = query.where('department_id', '==', department_id)
        
    docs = query.get()
    teams = [Team.from_firestore(doc) for doc in docs]
    
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
    team_id: str,
    active_only: bool = True,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Get all assignments for a specific team.
    """
    team_doc = db.collection('teams').document(team_id).get()
    if not team_doc.exists:
        raise HTTPException(status_code=404, detail="Team not found")
        
    team = Team.from_firestore(team_doc)
    
    # Check access
    if current_user.role == UserRole.OFFICER:
        if current_user.department_id != team.department_id:
            raise HTTPException(status_code=403, detail="Access denied")
            
    query = db.collection('task_assignments').where('team_id', '==', team_id)
    if active_only:
        query = query.where('is_active', '==', True)
        
    docs = query.get()
    assignments = [TaskAssignment.from_firestore(doc) for doc in docs]
    assignments.sort(key=lambda x: x.deadline)
    
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
    assignment_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Get details of a specific assignment.
    """
    doc = db.collection('task_assignments').document(assignment_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    assignment = TaskAssignment.from_firestore(doc)
    
    team_doc = db.collection('teams').document(assignment.team_id).get()
    team_name = None
    if team_doc.exists:
        team_name = team_doc.to_dict().get('name')
        
    return AssignmentResponse(
        id=assignment.id,
        complaint_id=assignment.complaint_id,
        team_id=assignment.team_id,
        team_name=team_name,
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
    assignment_id: str,
    override: OverrideRequest,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Manually override an AI assignment (Admin/Officer only).
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.OFFICER]:
        raise HTTPException(status_code=403, detail="Override requires admin or officer role")
        
    assignment_ref = db.collection('task_assignments').document(assignment_id)
    assignment_doc = assignment_ref.get()
    
    if not assignment_doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    assignment = TaskAssignment.from_firestore(assignment_doc)
    
    new_team_ref = db.collection('teams').document(override.new_team_id)
    new_team_doc = new_team_ref.get()
    if not new_team_doc.exists:
        raise HTTPException(status_code=404, detail="New team not found")
    new_team = Team.from_firestore(new_team_doc)
    
    old_team_ref = db.collection('teams').document(assignment.team_id)
    old_team_doc = old_team_ref.get()
    old_team = Team.from_firestore(old_team_doc) if old_team_doc.exists else None
    
    old_team_id = assignment.team_id
    reassigned_at = datetime.utcnow()
    reason_str = f"Manual override by {current_user.name}: {override.reason}"
    
    # Update assignment
    assignment_ref.update({
        'team_id': new_team.id,
        'is_reassigned': True,
        'reassigned_from_team_id': old_team_id,
        'reassignment_reason': reason_str,
        'reassigned_at': reassigned_at
    })
    
    # Update complaint
    complaint_ref = db.collection('complaints').document(assignment.complaint_id)
    if complaint_ref.get().exists:
        complaint_ref.update({'assigned_team_id': new_team.id})
        
    # Update team task counts
    if old_team:
        old_team_ref.update({'active_tasks': max(0, old_team.active_tasks - 1)})
    
    new_team_ref.update({'active_tasks': new_team.active_tasks + 1})
        
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
    db.collection('assignment_logs').add(log.to_firestore())
    
    return AssignmentResponse(
        id=assignment.id,
        complaint_id=assignment.complaint_id,
        team_id=new_team.id,
        team_name=new_team.name,
        assigned_at=assignment.assigned_at,
        deadline=assignment.deadline,
        load_score=assignment.load_score,
        reason=assignment.reason,
        is_reassigned=True,
        reassigned_from_team_id=old_team_id,
        reassignment_reason=reason_str,
        is_active=assignment.is_active
    )


@router.post("/check-reassignments", response_model=ReassignmentCheckResponse)
async def trigger_reassignment_check(
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Manually trigger the AI reassignment check.
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
