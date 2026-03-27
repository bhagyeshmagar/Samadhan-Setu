"""
AI Assignment Optimizer Service
===============================
Implements intelligent, load-balanced task assignment for grievances.
Uses a scoring algorithm to find the optimal team based on:
- Current workload vs. capacity
- Task priority weight
- SLA deadline pressure

This module is the AI brain for Feature 1: Auto-Assignment.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..models import (
    Team, TaskAssignment, AssignmentLog, Complaint, 
    ComplaintPriority, SLARule, Department
)


# Priority weights for load scoring (higher = more urgent)
PRIORITY_WEIGHTS = {
    ComplaintPriority.HIGH: 0.3,
    ComplaintPriority.MEDIUM: 0.15,
    ComplaintPriority.LOW: 0.05
}

# Default SLA hours if no rule found
DEFAULT_SLA_HOURS = {
    ComplaintPriority.HIGH: 24,
    ComplaintPriority.MEDIUM: 48,
    ComplaintPriority.LOW: 72
}


def calculate_load_score(
    team: Team,
    priority: ComplaintPriority,
    hours_to_deadline: float
) -> float:
    """
    Calculate the load score for a team.
    
    Load Score = (Active Tasks / Daily Capacity) + Priority Weight + Deadline Pressure
    
    Lower score = better candidate for assignment.
    
    Args:
        team: The team to evaluate
        priority: Priority of the incoming complaint
        hours_to_deadline: Hours remaining until SLA deadline
        
    Returns:
        Float score (lower is better)
    """
    # Base load ratio (0 to 1+)
    load_ratio = team.load_ratio if team.daily_capacity > 0 else float('inf')
    
    # Priority weight (0.05 to 0.3)
    priority_weight = PRIORITY_WEIGHTS.get(priority, 0.1)
    
    # Deadline pressure (inverse of hours remaining, normalized)
    # More pressure if deadline is soon
    if hours_to_deadline <= 0:
        deadline_pressure = 1.0  # Maximum pressure
    elif hours_to_deadline > 72:
        deadline_pressure = 0.0  # No pressure
    else:
        deadline_pressure = 1.0 - (hours_to_deadline / 72)
    
    # Combined score
    score = load_ratio + priority_weight + (deadline_pressure * 0.2)
    
    return round(score, 4)


def get_sla_deadline(
    db: Session,
    category: str,
    priority: ComplaintPriority
) -> Tuple[datetime, int]:
    """
    Get the SLA deadline for a complaint based on category and priority.
    
    Returns:
        Tuple of (deadline datetime, resolution hours)
    """
    # Try to find a specific rule
    rule = db.query(SLARule).filter(
        and_(
            SLARule.category == category,
            SLARule.priority == priority
        )
    ).first()
    
    if not rule:
        # Try category-only rule
        rule = db.query(SLARule).filter(
            and_(
                SLARule.category == category,
                SLARule.priority.is_(None)
            )
        ).first()
    
    if not rule:
        # Try priority-only rule
        rule = db.query(SLARule).filter(
            and_(
                SLARule.category.is_(None),
                SLARule.priority == priority
            )
        ).first()
    
    if rule:
        resolution_hours = rule.resolution_hours
    else:
        resolution_hours = DEFAULT_SLA_HOURS.get(priority, 72)
    
    deadline = datetime.utcnow() + timedelta(hours=resolution_hours)
    return deadline, resolution_hours


def find_optimal_team(
    db: Session,
    complaint: Complaint,
    teams: List[Team]
) -> Tuple[Optional[Team], float, str]:
    """
    Find the optimal team for a complaint using AI load scoring.
    
    Args:
        db: Database session
        complaint: The complaint to assign
        teams: List of available teams (pre-filtered by department/ward)
        
    Returns:
        Tuple of (optimal team, load score, reason)
    """
    if not teams:
        return None, 0.0, "No teams available for assignment"
    
    deadline, sla_hours = get_sla_deadline(db, complaint.category, complaint.priority)
    hours_to_deadline = sla_hours  # Full SLA window for new complaints
    
    # Calculate scores for all teams
    team_scores: List[Tuple[Team, float]] = []
    
    for team in teams:
        if not team.is_active:
            continue
            
        # Check geographic coverage if ward is specified
        if complaint.ward and team.ward_coverage:
            ward_normalized = complaint.ward.lower().strip()
            coverage = [w.lower().strip() for w in team.ward_coverage]
            if ward_normalized not in coverage:
                continue  # Skip teams that don't cover this ward
        
        score = calculate_load_score(team, complaint.priority, hours_to_deadline)
        team_scores.append((team, score))
    
    if not team_scores:
        # Fallback: no teams match ward coverage, use any team from department
        for team in teams:
            if team.is_active:
                score = calculate_load_score(team, complaint.priority, hours_to_deadline)
                team_scores.append((team, score))
    
    if not team_scores:
        return None, 0.0, "No active teams available"
    
    # Sort by score (lower is better)
    team_scores.sort(key=lambda x: x[1])
    
    best_team, best_score = team_scores[0]
    
    # Generate explainable reason
    reason = _generate_assignment_reason(best_team, best_score, complaint.priority)
    
    return best_team, best_score, reason


def _generate_assignment_reason(
    team: Team,
    score: float,
    priority: ComplaintPriority
) -> str:
    """Generate a human-readable explanation for the assignment decision."""
    load_percent = int(team.load_ratio * 100)
    
    if load_percent <= 50:
        load_status = "low workload"
    elif load_percent <= 80:
        load_status = "moderate workload"
    else:
        load_status = "high workload (consider reassignment if SLA at risk)"
    
    return (
        f"AI assigned to {team.name} (Load Score: {score:.2f}). "
        f"Team has {load_status} ({team.active_tasks}/{team.daily_capacity} tasks). "
        f"Priority: {priority.value}."
    )


def create_assignment(
    db: Session,
    complaint: Complaint,
    team: Team,
    score: float,
    reason: str
) -> TaskAssignment:
    """
    Create a new task assignment record.
    
    Args:
        db: Database session
        complaint: The complaint being assigned
        team: The team to assign to
        score: The calculated load score
        reason: Human-readable reason
        
    Returns:
        The created TaskAssignment
    """
    deadline, _ = get_sla_deadline(db, complaint.category, complaint.priority)
    
    assignment = TaskAssignment(
        complaint_id=complaint.id,
        team_id=team.id,
        deadline=deadline,
        load_score=score,
        reason=reason,
        is_reassigned=False,
        is_active=True
    )
    
    db.add(assignment)
    
    # Update complaint with team assignment
    complaint.assigned_team_id = team.id
    
    # Increment team's active task count
    team.active_tasks += 1
    
    # Create assignment log
    log = AssignmentLog(
        assignment_id=assignment.id,
        event_type="CREATED",
        details={
            "load_score": score,
            "team_capacity": team.daily_capacity,
            "team_active_tasks": team.active_tasks,
            "priority": complaint.priority.value
        },
        triggered_by="AI"
    )
    
    db.add(log)
    db.commit()
    db.refresh(assignment)
    
    return assignment


def get_available_teams(
    db: Session,
    department_id: int,
    ward: Optional[str] = None
) -> List[Team]:
    """
    Get all available teams for a department, optionally filtered by ward coverage.
    
    Args:
        db: Database session
        department_id: The department ID
        ward: Optional ward filter
        
    Returns:
        List of Team objects
    """
    query = db.query(Team).filter(
        Team.department_id == department_id,
        Team.is_active == True
    )
    
    teams = query.all()
    
    # If ward is specified, prioritize teams that cover it
    if ward:
        ward_normalized = ward.lower().strip()
        prioritized = []
        others = []
        
        for team in teams:
            if team.ward_coverage:
                coverage = [w.lower().strip() for w in team.ward_coverage]
                if ward_normalized in coverage:
                    prioritized.append(team)
                else:
                    others.append(team)
            else:
                others.append(team)
        
        return prioritized + others
    
    return teams


def assign_complaint(
    db: Session,
    complaint: Complaint
) -> Dict[str, Any]:
    """
    Main entry point: Assign a complaint to the optimal team.
    
    This is the function to call from the complaint submission flow.
    
    Args:
        db: Database session
        complaint: The complaint to assign
        
    Returns:
        Dict with assignment details for the API response
    """
    if not complaint.department_id:
        return {
            "success": False,
            "error": "Complaint has no department assigned",
            "team_id": None,
            "deadline": None,
            "reason": None
        }
    
    # Get available teams
    teams = get_available_teams(db, complaint.department_id, complaint.ward)
    
    if not teams:
        return {
            "success": False,
            "error": "No teams available for this department",
            "team_id": None,
            "deadline": None,
            "reason": None
        }
    
    # Find optimal team
    team, score, reason = find_optimal_team(db, complaint, teams)
    
    if not team:
        return {
            "success": False,
            "error": reason,
            "team_id": None,
            "deadline": None,
            "reason": None
        }
    
    # Create assignment
    assignment = create_assignment(db, complaint, team, score, reason)
    
    return {
        "success": True,
        "error": None,
        "team_id": team.id,
        "team_name": team.name,
        "deadline": assignment.deadline.isoformat(),
        "reason": reason,
        "load_score": score,
        "is_reassigned": False
    }
