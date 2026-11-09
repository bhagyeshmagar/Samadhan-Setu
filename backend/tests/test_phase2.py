"""
test_phase2.py – AI intelligence layer tests (PostgreSQL ORM edition).

Tests the text classification, priority scoring, similarity, task routing,
and complaint state machine using the current ORM-based model paths.

NOTE: Heavy ML models (DistilBERT, SBERT, YOLO) are stubbed in conftest.py;
      only the keyword/rule-based fallback paths are exercised here.
"""
import pytest
from datetime import datetime, timedelta


# ── DistilBERT Classifier (rule-based fallback path) ──────────────────────────

class TestDistilBERTClassifier:
    """DistilBERT classifier with rule-based fallback (ML model stubbed in conftest)."""

    def test_classify_returns_valid_structure(self):
        from app.ai.distilbert_classifier import distilbert_classifier
        result = distilbert_classifier.classify("Water pipe burst on main road causing flooding")
        assert "category" in result
        assert "confidence" in result
        assert "source" in result
        assert "is_fallback" in result
        assert result["category"] in [
            "Roads & Transport", "Water Supply", "Electricity",
            "Sanitation & Waste", "Health & Safety", "General",
        ]

    def test_classify_empty_text(self):
        from app.ai.distilbert_classifier import distilbert_classifier
        result = distilbert_classifier.classify("")
        assert result["category"] == "General"
        assert result["is_fallback"] is True

    def test_classify_short_text(self):
        from app.ai.distilbert_classifier import distilbert_classifier
        result = distilbert_classifier.classify("hi")
        assert result["category"] == "General"

    def test_classify_water_keywords(self):
        from app.ai.distilbert_classifier import distilbert_classifier
        result = distilbert_classifier.classify("Water pipeline is leaking badly in the neighborhood")
        assert result["confidence"] > 0

    def test_classify_electricity_keywords(self):
        from app.ai.distilbert_classifier import distilbert_classifier
        result = distilbert_classifier.classify("Electric transformer sparking dangerously near school")
        assert result["confidence"] > 0


# ── Text Intelligence ──────────────────────────────────────────────────────────

class TestTextIntelligence:
    """Unified text intelligence service."""

    def test_analyze_returns_full_payload(self):
        from app.ai.text_intelligence import text_intelligence
        result = text_intelligence.analyze("Major pothole on highway causing accidents daily")
        for key in ("category", "urgency_score", "severity_score", "urgency_level",
                    "severity_level", "keyword_highlights", "explanation", "model_metadata"):
            assert key in result, f"Missing key: {key}"

    def test_urgency_levels(self):
        from app.ai.text_intelligence import text_intelligence
        high = text_intelligence.analyze("Fire explosion death people dying emergency")
        low = text_intelligence.analyze("Small issue with road surface")
        assert high["urgency_level"] == "High"
        assert low["urgency_level"] == "Low"

    def test_severity_scores_bounded(self):
        from app.ai.text_intelligence import text_intelligence
        result = text_intelligence.analyze("Building collapsed people trapped fire burning")
        assert 0 <= result["severity_score"] <= 10
        assert result["severity_level"] in ("Low", "Medium", "High")

    def test_empty_text_analysis(self):
        from app.ai.text_intelligence import text_intelligence
        result = text_intelligence.analyze("")
        assert result["category"] == "General"
        assert result["urgency_score"] == 0
        assert result["severity_score"] == 0


# ── Priority Engine ────────────────────────────────────────────────────────────

class TestPriorityEngine:
    """Enhanced 6-factor priority calculation (0.0–3.0 scale)."""

    def setup_method(self):
        from app.ai.priority import PriorityCalculator
        self.calc = PriorityCalculator()

    def test_empty_text_low_priority(self):
        result = self.calc.calculate_priority("", "General", 0)
        assert result["priority"] == "Low"

    def test_high_urgency_keywords(self):
        result = self.calc.calculate_priority(
            "Fire in building, people dying, explosion heard", "Health & Safety", 0
        )
        assert result["priority"] in ("High", "Critical")
        assert result["score"] >= 2.0

    def test_medium_urgency(self):
        result = self.calc.calculate_priority(
            "Water pipe is broken and flooding the area", "Water Supply", 0
        )
        assert result["priority"] in ("Medium", "High")

    def test_low_urgency(self):
        result = self.calc.calculate_priority("Small issue with road surface", "General", 0)
        assert result["priority"] in ("Low", "Medium")

    def test_score_range_always_valid(self):
        """Score must stay in [0.0, 3.0]."""
        result = self.calc.calculate_priority(
            "fire explosion emergency death danger", "Health & Safety", 50
        )
        assert 0.0 <= result["score"] <= 3.0

    def test_upvotes_bounded_impact(self):
        no_votes   = self.calc.calculate_priority("Small pothole on road", "General", 0)
        many_votes = self.calc.calculate_priority("Small pothole on road", "General", 100)
        assert abs(many_votes["score"] - no_votes["score"]) <= 0.5

    def test_breakdown_has_all_factors(self):
        result = self.calc.calculate_priority("Road is damaged", "Roads & Transport", 5)
        for factor in ("urgency", "severity", "crowd_impact", "sla_risk", "location_criticality", "history"):
            assert factor in result["breakdown"], f"Missing factor: {factor}"


# ── Task Routing ───────────────────────────────────────────────────────────────

class TestTaskRouting:
    """Multi-department keyword detection."""

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

    def test_primary_always_included(self):
        from app.services.task_router import detect_departments_from_text
        cats = detect_departments_from_text("random text no keywords", "General")
        assert "General" in cats


# ── Complaint State Machine (ORM paths) ──────────────────────────────────────

class TestComplaintStateMachine:
    """Complaint status transitions using ORM enums."""

    def test_submitted_to_verified(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.VERIFIED) is True

    def test_submitted_to_closed_invalid(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.CLOSED) is False

    def test_resolved_to_closed(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED) is True

    def test_appealed_l1_valid_transitions(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition, get_allowed_transitions
        allowed = get_allowed_transitions(ComplaintStatus.APPEALED_L1)
        # Should be able to progress back to work queue
        assert ComplaintStatus.IN_PROGRESS in allowed


# ── ORM Enum Sanity ───────────────────────────────────────────────────────────

class TestORMEnums:
    """Confirm all expected ORM enum values exist."""

    def test_complaint_status_values(self):
        from app.models.orm.enums import ComplaintStatus
        expected = {
            "SUBMITTED", "VERIFIED", "ASSIGNED", "IN_PROGRESS",
            "PENDING_INFO", "RESOLVED", "CLOSED", "REOPENED",
            "REJECTED", "ESCALATED", "APPEALED", "APPEALED_L1", "APPEALED_L2",
        }
        actual = {m.name for m in ComplaintStatus}
        assert expected.issubset(actual), f"Missing statuses: {expected - actual}"

    def test_notification_type_values(self):
        from app.models.orm.enums import NotificationType
        expected = {"STATUS_CHANGE", "ASSIGNMENT", "ESCALATION", "SLA_WARNING", "COMMUNITY_VOTE"}
        actual = {m.name for m in NotificationType}
        assert expected.issubset(actual), f"Missing types: {expected - actual}"

    def test_complaint_priority_values(self):
        from app.models.orm.enums import ComplaintPriority
        expected = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        assert {m.name for m in ComplaintPriority} == expected


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
