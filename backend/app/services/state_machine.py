"""
Complaint State Machine for Samadhan Setu.
Defines valid status transitions across the complaint lifecycle and enforces them.

SINGLE SOURCE OF TRUTH: Only VALID_TRANSITIONS is used.
STRING_VALID_TRANSITIONS was removed — it had wider gaps that allowed skipping
steps (e.g. submitted → closed, assigned → resolved).
"""
from typing import Union, List
from ..models.orm.enums import ComplaintStatus

# Valid transitions between ORM ComplaintStatus values.
# This is the ONLY authoritative table. No other transition table may exist.
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

