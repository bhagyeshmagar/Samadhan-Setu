"""
Complaint State Machine for Samadhan Setu.
Defines valid status transitions across the complaint lifecycle and enforces them.

SINGLE SOURCE OF TRUTH: Only VALID_TRANSITIONS is used.
STRING_VALID_TRANSITIONS was removed — it had wider gaps that allowed skipping
steps (e.g. submitted → closed, assigned → resolved).
"""
from typing import Union
from ..models.orm.enums import ComplaintStatus

# Valid transitions between ORM ComplaintStatus values.
# This is the ONLY authoritative table. No other transition table may exist.
VALID_TRANSITIONS: dict[ComplaintStatus, list[ComplaintStatus]] = {
    ComplaintStatus.SUBMITTED: [
        ComplaintStatus.INSPECTION_ASSIGNED,
        ComplaintStatus.VERIFIED,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.VERIFIED: [
        ComplaintStatus.INSPECTION_ASSIGNED,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.ASSIGNED: [
        ComplaintStatus.INSPECTION_ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.VERIFIED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.INSPECTION_ASSIGNED: [
        ComplaintStatus.INSPECTION_SUBMITTED,
        ComplaintStatus.INSPECTION_ASSIGNED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.INSPECTION_SUBMITTED: [
        ComplaintStatus.INSPECTION_VERIFIED,
        ComplaintStatus.INSPECTION_REWORK,
        ComplaintStatus.INSPECTION_ASSIGNED,
    ],
    ComplaintStatus.INSPECTION_REWORK: [
        ComplaintStatus.INSPECTION_SUBMITTED,
        ComplaintStatus.INSPECTION_ASSIGNED,
    ],
    ComplaintStatus.INSPECTION_VERIFIED: [
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.TEAM_ASSIGNED: [
        ComplaintStatus.WORK_IN_PROGRESS,
        ComplaintStatus.TEAM_ASSIGNED,
    ],
    ComplaintStatus.WORK_IN_PROGRESS: [
        ComplaintStatus.RESOLUTION_SUBMITTED,
        ComplaintStatus.VERIFICATION_ASSIGNED,
        ComplaintStatus.TEAM_ASSIGNED,
    ],
    ComplaintStatus.RESOLUTION_SUBMITTED: [
        ComplaintStatus.VERIFICATION_ASSIGNED,
    ],
    ComplaintStatus.VERIFICATION_ASSIGNED: [
        ComplaintStatus.VERIFICATION_SUBMITTED,
        ComplaintStatus.REDRESSAL_REWORK,
        ComplaintStatus.VERIFICATION_ASSIGNED,
    ],
    ComplaintStatus.VERIFICATION_SUBMITTED: [
        ComplaintStatus.RESOLVED,
        ComplaintStatus.REDRESSAL_REWORK,
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.VERIFICATION_ASSIGNED,
    ],
    ComplaintStatus.REDRESSAL_REWORK: [
        ComplaintStatus.WORK_IN_PROGRESS,
        ComplaintStatus.TEAM_ASSIGNED,
    ],
    ComplaintStatus.IN_PROGRESS: [
        ComplaintStatus.VERIFICATION_ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.PENDING_INFO,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.ESCALATED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.PENDING_INFO: [
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.SUBMITTED,
        ComplaintStatus.REJECTED,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.ESCALATED: [
        ComplaintStatus.INSPECTION_ASSIGNED,
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.RESOLVED: [
        ComplaintStatus.CLOSED,
        ComplaintStatus.REOPENED,
        ComplaintStatus.ESCALATED,
        ComplaintStatus.APPEALED,
        ComplaintStatus.APPEALED_L1,
    ],
    ComplaintStatus.CLOSED: [
        ComplaintStatus.REOPENED,
        ComplaintStatus.APPEALED,
        ComplaintStatus.APPEALED_L1,
    ],
    ComplaintStatus.APPEALED: [
        ComplaintStatus.REDRESSAL_REWORK,
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.APPEALED_L2,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.APPEALED_L1: [
        ComplaintStatus.REDRESSAL_REWORK,
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.APPEALED_L2,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.APPEALED_L2: [
        ComplaintStatus.REDRESSAL_REWORK,
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.REOPENED: [
        ComplaintStatus.INSPECTION_ASSIGNED,
        ComplaintStatus.TEAM_ASSIGNED,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.VERIFIED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.CLOSED,
        ComplaintStatus.ESCALATED,
    ],
    ComplaintStatus.REJECTED: [
        ComplaintStatus.REOPENED,
        ComplaintStatus.APPEALED,
        ComplaintStatus.APPEALED_L1,
    ],
}


def _normalize_status(st: Union[ComplaintStatus, str]) -> str:
    """Normalize status enum or string to lowercase snake_case string."""
    if hasattr(st, "value"):
        st = st.value
    st_str = str(st).lower().strip()
    return st_str.replace(" ", "_")


def is_valid_transition(
    from_status: Union[ComplaintStatus, str],
    to_status: Union[ComplaintStatus, str]
) -> bool:
    """Check if a status transition is allowed using the single authoritative table."""
    from_norm = _normalize_status(from_status)
    to_norm = _normalize_status(to_status)

    if from_norm == to_norm:
        return True

    for orig_from, allowed_list in VALID_TRANSITIONS.items():
        if orig_from.value == from_norm:
            allowed_values = {s.value for s in allowed_list}
            return to_norm in allowed_values

    return False


def get_allowed_transitions(current_status: Union[ComplaintStatus, str]) -> list[ComplaintStatus]:
    """Get all statuses a complaint can transition to from current status."""
    norm = _normalize_status(current_status)
    for orig_from, allowed_list in VALID_TRANSITIONS.items():
        if orig_from.value == norm:
            return list(allowed_list)
    return []

