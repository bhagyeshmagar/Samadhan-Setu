"""
Complaint State Machine for Samadhan Setu Phase 1.
Defines valid status transitions and enforces them.
"""
from ..models.complaint import ComplaintStatus

# Valid transitions: from_status -> [allowed_to_statuses]
VALID_TRANSITIONS: dict[ComplaintStatus, list[ComplaintStatus]] = {
    ComplaintStatus.SUBMITTED: [
        ComplaintStatus.VERIFIED,
        ComplaintStatus.ASSIGNED,  # direct assignment allowed for simple workflows
    ],
    ComplaintStatus.VERIFIED: [
        ComplaintStatus.ASSIGNED,
    ],
    ComplaintStatus.ASSIGNED: [
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.VERIFIED,  # return to verified if reassignment needed
    ],
    ComplaintStatus.IN_PROGRESS: [
        ComplaintStatus.RESOLVED,
        ComplaintStatus.ASSIGNED,  # reassign to different officer/dept
    ],
    ComplaintStatus.RESOLVED: [
        ComplaintStatus.CLOSED,
        ComplaintStatus.REOPENED,
        ComplaintStatus.APPEALED,
    ],
    ComplaintStatus.CLOSED: [
        ComplaintStatus.REOPENED,
    ],
    ComplaintStatus.REOPENED: [
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
    ],
    ComplaintStatus.APPEALED: [
        ComplaintStatus.IN_PROGRESS,  # admin sends it back for rework
        ComplaintStatus.CLOSED,       # admin closes the appeal
    ],
}


def is_valid_transition(from_status: ComplaintStatus, to_status: ComplaintStatus) -> bool:
    """Check if a status transition is allowed."""
    allowed = VALID_TRANSITIONS.get(from_status, [])
    return to_status in allowed


def get_allowed_transitions(current_status: ComplaintStatus) -> list[ComplaintStatus]:
    """Get all statuses a complaint can transition to from current status."""
    return VALID_TRANSITIONS.get(current_status, [])
