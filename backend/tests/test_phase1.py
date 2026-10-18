"""
Phase 1 Tests for Samadhan Setu.
Tests state machine, task generation, priority calculation, and audit logging.
"""
import pytest
from datetime import datetime

# State machine tests
from app.models.complaint import ComplaintStatus
from app.models.task import TaskStatus
from app.services.state_machine import is_valid_transition, get_allowed_transitions
from app.services.task_state_machine import is_valid_task_transition, get_allowed_task_transitions
from app.ai.priority import PriorityCalculator


class TestComplaintStateMachine:
    """Test complaint status transitions."""

    def test_submitted_to_verified(self):
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.VERIFIED) is True

    def test_submitted_to_assigned(self):
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.ASSIGNED) is True

    def test_submitted_to_resolved_invalid(self):
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.RESOLVED) is False

    def test_submitted_to_closed_invalid(self):
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.CLOSED) is False

    def test_assigned_to_in_progress(self):
        assert is_valid_transition(ComplaintStatus.ASSIGNED, ComplaintStatus.IN_PROGRESS) is True

    def test_in_progress_to_resolved(self):
        assert is_valid_transition(ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED) is True

    def test_resolved_to_closed(self):
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED) is True

    def test_resolved_to_reopened(self):
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.REOPENED) is True

    def test_resolved_to_appealed(self):
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.APPEALED) is True

    def test_closed_to_reopened(self):
        assert is_valid_transition(ComplaintStatus.CLOSED, ComplaintStatus.REOPENED) is True

    def test_closed_to_in_progress_invalid(self):
        assert is_valid_transition(ComplaintStatus.CLOSED, ComplaintStatus.IN_PROGRESS) is False

    def test_reopened_to_assigned(self):
        assert is_valid_transition(ComplaintStatus.REOPENED, ComplaintStatus.ASSIGNED) is True

    def test_appealed_to_in_progress(self):
        assert is_valid_transition(ComplaintStatus.APPEALED, ComplaintStatus.IN_PROGRESS) is True

    def test_appealed_to_closed(self):
        assert is_valid_transition(ComplaintStatus.APPEALED, ComplaintStatus.CLOSED) is True

    def test_get_allowed_from_submitted(self):
        allowed = get_allowed_transitions(ComplaintStatus.SUBMITTED)
        assert ComplaintStatus.VERIFIED in allowed
        assert ComplaintStatus.ASSIGNED in allowed
        assert ComplaintStatus.RESOLVED not in allowed


class TestTaskStateMachine:
    """Test task status transitions."""

    def test_pending_to_assigned(self):
        assert is_valid_task_transition(TaskStatus.PENDING, TaskStatus.ASSIGNED) is True

    def test_pending_to_rejected(self):
        assert is_valid_task_transition(TaskStatus.PENDING, TaskStatus.REJECTED) is True

    def test_pending_to_completed_invalid(self):
        assert is_valid_task_transition(TaskStatus.PENDING, TaskStatus.COMPLETED) is False

    def test_assigned_to_in_progress(self):
        assert is_valid_task_transition(TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS) is True

    def test_in_progress_to_completed(self):
        assert is_valid_task_transition(TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED) is True

    def test_completed_is_terminal(self):
        assert get_allowed_task_transitions(TaskStatus.COMPLETED) == []

    def test_rejected_is_terminal(self):
        assert get_allowed_task_transitions(TaskStatus.REJECTED) == []


class TestPriorityCalculator:
    """Test the 6-factor priority calculation."""

    def setup_method(self):
        self.calc = PriorityCalculator()

    def test_empty_text_low_priority(self):
        result = self.calc.calculate_priority("", "General", 0)
        assert result["priority"] == "Low"
        assert result["score"] > 0  # non-zero because severity/crowd/sla/location/history have defaults

    def test_high_urgency_keywords(self):
        result = self.calc.calculate_priority(
            "Fire in building, people dying, explosion heard",
            "Health & Safety",
            0,
        )
        assert result["priority"] == "High"
        assert result["score"] >= 2.0

    def test_medium_urgency(self):
        result = self.calc.calculate_priority(
            "Water pipe is broken and flooding the area",
            "Water Supply",
            0,
        )
        assert result["priority"] in ["Medium", "High"]

    def test_low_urgency(self):
        result = self.calc.calculate_priority(
            "Small issue with road surface",
            "General",
            0,
        )
        assert result["priority"] in ["Low", "Medium"]

    def test_upvotes_do_not_change_priority_drastically(self):
        result_no_votes = self.calc.calculate_priority("Small pothole on road", "General", 0)
        result_many_votes = self.calc.calculate_priority("Small pothole on road", "General", 100)
        # Crowd impact weight is only 0.15, so even max crowd (3) adds 0.45
        # This should not jump from Low to High by itself
        assert abs(result_many_votes["score"] - result_no_votes["score"]) <= 0.5

    def test_breakdown_contains_all_factors(self):
        result = self.calc.calculate_priority("Road is damaged", "Roads & Transport", 5)
        breakdown = result["breakdown"]
        assert "urgency" in breakdown
        assert "severity" in breakdown
        assert "crowd_impact" in breakdown
        assert "sla_risk" in breakdown
        assert "location_criticality" in breakdown
        assert "history" in breakdown

    def test_sla_hours_mapping(self):
        high_result = self.calc.calculate_priority(
            "Fire emergency explosion danger death", "Health & Safety", 0
        )
        assert high_result["sla_hours"] == 24

    def test_keywords_found(self):
        keywords = self.calc.get_urgency_keywords_found("fire and explosion near the road")
        assert "fire" in keywords
        assert "explosion" in keywords


class TestTaskRouting:
    """Test multi-department detection logic."""

    def test_single_category(self):
        from app.services.task_router import detect_departments_from_text
        cats = detect_departments_from_text("The pothole is very deep", "Roads & Transport")
        assert "Roads & Transport" in cats
        assert len(cats) == 1

    def test_multi_department_detection(self):
        from app.services.task_router import detect_departments_from_text
        cats = detect_departments_from_text(
            "Road is damaged and water pipe is leaking near the electricity transformer",
            "Roads & Transport",
        )
        assert "Roads & Transport" in cats
        assert "Water Supply" in cats
        assert "Electricity" in cats
        assert len(cats) == 3

    def test_primary_always_included(self):
        from app.services.task_router import detect_departments_from_text
        cats = detect_departments_from_text("random text no keywords", "General")
        assert "General" in cats


class TestComplaintModel:
    """Test complaint model serialization."""

    def test_complaint_creation(self):
        complaint = Complaint(
            user_id="test_user",
            title="Test Complaint Title",
            category="Roads & Transport",
            description="Test description",
            location="Test Location",
        )
        assert complaint.status == ComplaintStatus.SUBMITTED
        assert complaint.priority == ComplaintPriority.LOW
        assert complaint.title == "Test Complaint Title"

    def test_complaint_to_firestore(self):
        from app.models.complaint import Complaint, ComplaintPriority
        complaint = Complaint(
            user_id="test_user",
            title="Test",
            category="General",
            description="Test",
            location="Test",
        )
        data = complaint.to_firestore()
        assert "id" not in data
        assert data["title"] == "Test"
        assert data["status"] == "Submitted"


class TestAuditLog:
    """Test audit log model."""

    def test_audit_log_creation(self):
        from app.models.audit import AuditLog
        log = AuditLog(
            action="complaint_created",
            entity_type="complaint",
            entity_id="test_id",
            actor_id="user_1",
            actor_role="citizen",
            details={"category": "Roads & Transport"},
        )
        assert log.action == "complaint_created"
        data = log.to_firestore()
        assert "id" not in data
        assert data["actor_role"] == "citizen"


# Import after other tests so module loading doesn't fail test collection
from app.models.complaint import Complaint, ComplaintPriority


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
