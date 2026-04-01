"""
Auto-Reassignment Service
=========================
Monitors team workloads and SLA deadlines to automatically reassign
tasks that are at risk of breaching SLA or assigned to overloaded teams.

This module is the proactive AI component of Feature 1.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

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
    """
    return team.load_ratio >= OVERLOAD_THRESHOLD


def check_sla_breach_risk(assignment: TaskAssignment) -> bool:
    """
    Check if an assignment is at risk of SLA breach.
    """
    if not assignment.deadline:
        return False
    
    hours_remaining = (assignment.deadline - datetime.utcnow()).total_seconds() / 3600
    return hours_remaining <= SLA_BREACH_RISK_HOURS


def get_at_risk_assignments(db: Any) -> List[TaskAssignment]:
    """
    Get all active assignments that are at risk (SLA breach).
    """
    risk_threshold = datetime.utcnow() + timedelta(hours=SLA_BREACH_RISK_HOURS)
    
    docs = db.collection('task_assignments').where('is_active', '==', True).where('deadline', '<=', risk_threshold).get()
    at_risk = [TaskAssignment.from_firestore(doc) for doc in docs]
    
    return at_risk


def get_overloaded_team_assignments(db: Any) -> List[TaskAssignment]:
    """
    Get assignments from overloaded teams that could be reassigned.
    """
    team_docs = db.collection('teams').where('is_active', '==', True).get()
    teams = [Team.from_firestore(doc) for doc in team_docs]
    
    overloaded_team_ids = [t.id for t in teams if check_team_overload(t)]
    
    if not overloaded_team_ids:
        return []
    
    # Firestore does not support 'in' queries with >10 items cleanly natively for unknown sizes without batching
    # But for a small app, this is fine. We will iterate manually for robust behavior
    assignments_docs = db.collection('task_assignments').where('is_active', '==', True).where('is_reassigned', '==', False).get()
    
    all_assignments = [TaskAssignment.from_firestore(doc) for doc in assignments_docs]
    overloaded_assignments = [a for a in all_assignments if a.team_id in overloaded_team_ids]
    
    return overloaded_assignments


def reassign_task(
    db: Any,
    assignment: TaskAssignment,
    reason: str
) -> Optional[Dict[str, Any]]:
    """
    Reassign a task to a different team.
    """
    complaint_doc = db.collection('complaints').document(assignment.complaint_id).get()
    if not complaint_doc.exists:
        return None
    complaint = Complaint.from_firestore(complaint_doc)
    
    if complaint.status != ComplaintStatus.PENDING:
        return None
    
    current_team_doc = db.collection('teams').document(assignment.team_id).get()
    if not current_team_doc.exists:
        return None
    current_team = Team.from_firestore(current_team_doc)
    
    all_teams = get_available_teams(db, current_team.department_id, complaint.ward)
    alternative_teams = [t for t in all_teams if t.id != current_team.id]
    
    if not alternative_teams:
        return None
    
    new_team, score, new_reason = find_optimal_team(db, complaint, alternative_teams)
    
    if not new_team:
        return None
    
    current_score = calculate_load_score(
        current_team, 
        complaint.priority,
        (assignment.deadline - datetime.utcnow()).total_seconds() / 3600
    )
    
    if score >= current_score:
        return None
    
    # Perform reassignment
    old_team_id = assignment.team_id
    reassigned_at = datetime.utcnow()
    
    db.collection('task_assignments').document(assignment.id).update({
        'team_id': new_team.id,
        'is_reassigned': True,
        'reassigned_from_team_id': old_team_id,
        'reassignment_reason': reason,
        'reassigned_at': reassigned_at,
        'load_score': score
    })
    
    # Update complaint
    db.collection('complaints').document(complaint.id).update({
        'assigned_team_id': new_team.id
    })
    
    # Update team task counts
    current_team.active_tasks = max(0, current_team.active_tasks - 1)
    db.collection('teams').document(current_team.id).update({'active_tasks': current_team.active_tasks})
    
    new_team.active_tasks += 1
    db.collection('teams').document(new_team.id).update({'active_tasks': new_team.active_tasks})
    
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
    db.collection('assignment_logs').add(log.to_firestore())
    
    return {
        "assignment_id": assignment.id,
        "complaint_id": complaint.id,
        "from_team": current_team.name,
        "to_team": new_team.name,
        "reason": reason,
        "new_score": score
    }


def run_reassignment_check(db: Any) -> Dict[str, Any]:
    """
    Run a full reassignment check cycle.
    """
    results = {
        "checked_at": datetime.utcnow().isoformat(),
        "sla_risk_checked": 0,
        "overload_checked": 0,
        "reassignments": []
    }
    
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
            
    overload_assignments = get_overloaded_team_assignments(db)
    results["overload_checked"] = len(overload_assignments)
    
    for assignment in overload_assignments:
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
    db: Any,
    assignment: TaskAssignment,
    action: str,
    details: Dict[str, Any]
) -> None:
    """
    Stub for notifying department head of AI actions.
    """
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
    db.collection('assignment_logs').add(log.to_firestore())

