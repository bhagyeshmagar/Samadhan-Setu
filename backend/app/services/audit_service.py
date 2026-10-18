"""
Audit Service for Samadhan Setu Phase 1.
Writes immutable audit log entries to Firestore.
"""
from datetime import datetime
from typing import Optional, Dict, Any
from ..models.audit import AuditLog


def write_audit_log(
    db,
    action: str,
    entity_type: str,
    entity_id: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> str:
    """Write an audit log entry. Returns the document ID."""
    log = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        actor_role=actor_role,
        details=details or {},
        created_at=datetime.utcnow(),
    )
    doc_ref = db.collection("audit_logs").document()
    log.id = doc_ref.id
    doc_ref.set(log.to_firestore())
    return doc_ref.id
