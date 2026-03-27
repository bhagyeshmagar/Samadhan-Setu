"""
Auto-Reassignment Service
=========================
Monitors team workloads and SLA deadlines to automatically reassign
tasks that are at risk of breaching SLA or assigned to overloaded teams.

This module is the proactive AI component of Feature 1.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models import (
    Team, TaskAssignment, AssignmentLog, Complaint,
    ComplaintPriority, ComplaintStatus
)
from .assignment_optimizer import (
    calculate_load_score, get_available_teams, 
    find_optimal_team, get_sla_deadline
)


# Threshold configurations
OVERLOAD_THRESHOLD = 0.9  # Team is overloaded at 90% capacity
SLA_BREACH_RISK_HOURS = 4  # Consider reassignment if <4 hours to deadline


def check_team_overload(team: Team) -> bool:
    """
    Check if a team is overloaded.
    
    Args:
        team: The team to check
        
    Returns:
        True if team is overloaded
    """
    return team.load_ratio >= OVERLOAD_THRESHOLD


def check_sla_breach_risk(assignment: TaskAssignment) -> bool:
    """
    Check if an assignment is at risk of SLA breach.
    
    Args:
        assignment: The task assignment to check
        
    Returns:
        True if SLA breach is imminent
    """
    if not assignment.deadline:
        return False
    
    hours_remaining = (assignment.deadline - datetime.utcnow()).total_seconds() / 3600
    return hours_remaining <= SLA_BREACH_RISK_HOURS


def get_at_risk_assignments(db: Session) -> List[TaskAssignment]:
    """
    Get all active assignments that are at risk (SLA breach or overloaded team).
    
    Args:
        db: Database session
        
    Returns:
        List of at-risk TaskAssignments
    """
    # Get active assignments with deadlines approaching
    risk_threshold = datetime.utcnow() + timedelta(hours=SLA_BREACH_RISK_HOURS)
    
    at_risk = db.query(TaskAssignment).filter(
        TaskAssignment.is_active == True,
        TaskAssignment.deadline <= risk_threshold
    ).all()
    
    return at_risk


def get_overloaded_team_assignments(db: Session) -> List[TaskAssignment]:
    """
    Get assignments from overloaded teams that could be reassigned.
    
    Args:
        db: Database session
        
    Returns:
        List of TaskAssignments from overloaded teams
    """
    # Get all overloaded teams
    overloaded_teams = db.query(Team).filter(
        Team.is_active == True
    ).all()
    
    overloaded_team_ids = [t.id for t in overloaded_teams if check_team_overload(t)]
    
    if not overloaded_team_ids:
        return []
    
    # Get active assignments from these teams
    assignments = db.query(TaskAssignment).filter(
        TaskAssignment.team_id.in_(overloaded_team_ids),
        TaskAssignment.is_active == True,
        TaskAssignment.is_reassigned == False  # Avoid double-reassignment
    ).all()
    
    return assignments


def reassign_task(
    db: Session,
    assignment: TaskAssignment,
    reason: str
) -> Optional[Dict[str, Any]]:
    """
    Reassign a task to a different team.
    
    Args:
        db: Database session
        assignment: The assignment to reassign
        reason: Reason for reassignment
        
    Returns:
        Dict with reassignment details, or None if no alternative found
    """
    complaint = db.query(Complaint).filter(
        Complaint.id == assignment.complaint_id
    ).first()
    
    if not complaint or complaint.status != ComplaintStatus.PENDING:
        return None  # Only reassign pending complaints
    
    current_team = db.query(Team).filter(Team.id == assignment.team_id).first()
    
    if not current_team:
        return None
    
    # Get alternative teams (exclude current team)
    all_teams = get_available_teams(db, current_team.department_id, complaint.ward)
    alternative_teams = [t for t in all_teams if t.id != current_team.id]
    
    if not alternative_teams:
        return None  # No alternatives available
    
    # Find optimal alternative
    new_team, score, new_reason = find_optimal_team(db, complaint, alternative_teams)
    
    if not new_team:
        return None
    
    # Check if new team is actually better
    current_score = calculate_load_score(
        current_team, 
        complaint.priority,
        (assignment.deadline - datetime.utcnow()).total_seconds() / 3600
    )
    
    if score >= current_score:
        return None  # New team is not better
    
    # Perform reassignment
    old_team_id = assignment.team_id
    assignment.team_id = new_team.id
    assignment.is_reassigned = True
    assignment.reassigned_from_team_id = old_team_id
    assignment.reassignment_reason = reason
    assignment.reassigned_at = datetime.utcnow()
    assignment.load_score = score
    
    # Update complaint
    complaint.assigned_team_id = new_team.id
    
    # Update team task counts
    current_team.active_tasks = max(0, current_team.active_tasks - 1)
    new_team.active_tasks += 1
    
    # Log the reassignment
    log = AssignmentLog(
        assignment_id=assignment.id,
        event_type="REASSIGNED",
        details={
            "from_team_id": old_team_id,
            "to_team_id": new_team.id,
            "reason": reason,
            "old_score": current_score,
            "new_score": score
        },
        triggered_by="AI"
    )
    db.add(log)
    db.commit()
    
    return {
        "assignment_id": assignment.id,
        "complaint_id": complaint.id,
        "from_team": current_team.name,
        "to_team": new_team.name,
        "reason": reason,
        "new_score": score
    }


def run_reassignment_check(db: Session) -> Dict[str, Any]:
    """
    Run a full reassignment check cycle.
    This should be called periodically (e.g., every 5 minutes) by a background job.
    
    Args:
        db: Database session
        
    Returns:
        Summary of reassignment actions taken
    """
    results = {
        "checked_at": datetime.utcnow().isoformat(),
        "sla_risk_checked": 0,
        "overload_checked": 0,
        "reassignments": []
    }
    
    # Check SLA-at-risk assignments
    sla_risk_assignments = get_at_risk_assignments(db)
    results["sla_risk_checked"] = len(sla_risk_assignments)
    
    for assignment in sla_risk_assignments:
        result = reassign_task(
            db, 
            assignment, 
            f"SLA breach risk: less than {SLA_BREACH_RISK_HOURS} hours to deadline"
        )
        if result:
            results["reassignments"].append(result)
    
    # Check overloaded team assignments
    overload_assignments = get_overloaded_team_assignments(db)
    results["overload_checked"] = len(overload_assignments)
    
    for assignment in overload_assignments:
        # Skip if already reassigned in SLA check
        if any(r["assignment_id"] == assignment.id for r in results["reassignments"]):
            continue
        
        result = reassign_task(
            db,
            assignment,
            f"Team overloaded: exceeds {int(OVERLOAD_THRESHOLD * 100)}% capacity"
        )
        if result:
            results["reassignments"].append(result)
    
    return results


def notify_department_head(
    db: Session,
    assignment: TaskAssignment,
    action: str,
    details: Dict[str, Any]
) -> None:
    """
    Stub for notifying department head of AI actions.
    In production, this would send an email/notification.
    
    Args:
        db: Database session
        assignment: The affected assignment
        action: What happened (e.g., "REASSIGNED")
        details: Action details
    """
    # TODO: Implement actual notification (email, push, etc.)
    # For now, just log the event
    log = AssignmentLog(
        assignment_id=assignment.id,
        event_type="NOTIFICATION_SENT",
        details={
            "action": action,
            "notification_type": "dept_head_alert",
            **details
        },
        triggered_by="SYSTEM"
    )
    db.add(log)
    db.commit()
