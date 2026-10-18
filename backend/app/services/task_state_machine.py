"""
Task State Machine for Samadhan Setu Phase 1.
Defines valid task status transitions.
"""
from ..models.task import TaskStatus

VALID_TASK_TRANSITIONS: dict[TaskStatus, list[TaskStatus]] = {
    TaskStatus.PENDING: [
        TaskStatus.ASSIGNED,
        TaskStatus.REJECTED,
    ],
    TaskStatus.ASSIGNED: [
        TaskStatus.IN_PROGRESS,
        TaskStatus.REJECTED,
        TaskStatus.PENDING,  # unassign
    ],
    TaskStatus.IN_PROGRESS: [
        TaskStatus.COMPLETED,
        TaskStatus.ASSIGNED,  # reassign
    ],
    TaskStatus.COMPLETED: [],  # terminal
    TaskStatus.REJECTED: [],   # terminal
}


def is_valid_task_transition(from_status: TaskStatus, to_status: TaskStatus) -> bool:
    allowed = VALID_TASK_TRANSITIONS.get(from_status, [])
    return to_status in allowed


def get_allowed_task_transitions(current_status: TaskStatus) -> list[TaskStatus]:
    return VALID_TASK_TRANSITIONS.get(current_status, [])
