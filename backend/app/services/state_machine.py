"""
Complaint State Machine for Samadhan Setu.
Defines valid status transitions across the complaint lifecycle and enforces them.
Uses PostgreSQL ORM ComplaintStatus enum.
"""
from typing import Union, List
from ..models.orm.enums import ComplaintStatus

# Valid transitions between ORM ComplaintStatus values
VALID_TRANSITIONS: dict[ComplaintStatus, list[ComplaintStatus]] = {
    ComplaintStatus.SUBMITTED: [
        ComplaintStatus.VERIFIED,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.VERIFIED: [
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.ASSIGNED: [
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.VERIFIED,
        ComplaintStatus.REJECTED,
    ],
    ComplaintStatus.IN_PROGRESS: [
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
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.APPEALED_L2,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.APPEALED_L1: [
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.APPEALED_L2,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.APPEALED_L2: [
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.RESOLVED,
        ComplaintStatus.CLOSED,
    ],
    ComplaintStatus.REOPENED: [
        ComplaintStatus.ASSIGNED,
        ComplaintStatus.IN_PROGRESS,
        ComplaintStatus.VERIFIED,
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
    """Check if a status transition is allowed, case-insensitively."""
    from_norm = _normalize_status(from_status)
    to_norm = _normalize_status(to_status)

    # Legacy support for "appealed" in tests / transition checks
    if from_norm == "appealed" and to_norm in ("in_progress", "closed"):
        return True
    if from_norm == "resolved" and to_norm == "appealed":
        return True

    # Find matching ComplaintStatus
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

