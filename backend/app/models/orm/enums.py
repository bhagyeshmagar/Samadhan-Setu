from enum import Enum
from sqlalchemy.dialects.postgresql import ENUM

class UserRole(str, Enum):
    CITIZEN = "citizen"
    OFFICER = "officer"
    NODAL_OFFICER = "nodal_officer"
    INSPECTION_OFFICER = "inspection_officer"
    TEAM_LEAD = "team_lead"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"

class ComplaintStatus(str, Enum):
    SUBMITTED = "submitted"
    VERIFIED = "verified"
    ASSIGNED = "assigned"
    INSPECTION_ASSIGNED = "inspection_assigned"
    INSPECTION_SUBMITTED = "inspection_submitted"
    INSPECTION_REWORK = "inspection_rework"
    INSPECTION_VERIFIED = "inspection_verified"
    TEAM_ASSIGNED = "team_assigned"
    WORK_IN_PROGRESS = "work_in_progress"
    IN_PROGRESS = "in_progress"
    RESOLUTION_SUBMITTED = "resolution_submitted"
    VERIFICATION_ASSIGNED = "verification_assigned"
    VERIFICATION_SUBMITTED = "verification_submitted"
    REDRESSAL_REWORK = "redressal_rework"
    PENDING_INFO = "pending_info"
    RESOLVED = "resolved"
    CLOSED = "closed"
    REOPENED = "reopened"
    REJECTED = "rejected"
    ESCALATED = "escalated"
    APPEALED = "appealed"
    APPEALED_L1 = "appealed_l1"
    APPEALED_L2 = "appealed_l2"

class ComplaintPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class VoteType(str, Enum):
    UPVOTE = "upvote"
    ME_TOO = "me_too"

class MediaType(str, Enum):
    PROOF_PHOTO = "proof_photo"
    INSPECTION_PHOTO = "inspection_photo"
    RESOLUTION_PHOTO = "resolution_photo"
    VERIFICATION_PHOTO = "verification_photo"
    ADDITIONAL_DOC = "additional_doc"

class NotificationType(str, Enum):
    STATUS_CHANGE = "status_change"
    ASSIGNMENT = "assignment"
    ESCALATION = "escalation"
    FEEDBACK_REQUEST = "feedback_request"
    SLA_WARNING = "sla_warning"
    COMMUNITY_VOTE = "community_vote"

def pg_enum(enum_cls, name: str):
    """Generate PostgreSQL ENUM with lowercase enum values."""
    return ENUM(
        enum_cls,
        name=name,
        values_callable=lambda x: [e.value for e in x],
    )
