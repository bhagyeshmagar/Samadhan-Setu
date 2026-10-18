"""
Phase 2 Tests for Samadhan Setu.
Tests AI intelligence layer: text classification, similarity, image analysis,
priority scoring, fusion, routing, and pipeline orchestration.
"""
import pytest
from datetime import datetime, timedelta


# ==================== TEXT INTELLIGENCE TESTS ====================

class TestDistilBERTClassifier:
    """Test DistilBERT classifier with fallback."""

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
        # Should detect water-related category (ML or rule-based)
        assert result["confidence"] > 0

    def test_classify_electricity_keywords(self):
        from app.ai.distilbert_classifier import distilbert_classifier
        result = distilbert_classifier.classify("Electric transformer sparking dangerously near school")
        assert result["confidence"] > 0


class TestTextIntelligence:
    """Test the unified text intelligence service."""

    def test_analyze_returns_full_payload(self):
        from app.ai.text_intelligence import text_intelligence
        result = text_intelligence.analyze("Major pothole on highway causing accidents daily")
        assert "category" in result
        assert "urgency_score" in result
        assert "severity_score" in result
        assert "urgency_level" in result
        assert "severity_level" in result
        assert "keyword_highlights" in result
        assert "explanation" in result
        assert "model_metadata" in result

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
        assert result["severity_level"] in ["Low", "Medium", "High"]

    def test_empty_text_analysis(self):
        from app.ai.text_intelligence import text_intelligence
        result = text_intelligence.analyze("")
        assert result["category"] == "General"
        assert result["urgency_score"] == 0
        assert result["severity_score"] == 0


# ==================== PRIORITY ENGINE TESTS ====================

class TestPriorityEngine:
    """Test the enhanced 6-factor priority calculation."""

    def setup_method(self):
        from app.ai.priority import PriorityCalculator
        self.calc = PriorityCalculator()

    def test_empty_text_low_priority(self):
        result = self.calc.calculate_priority("", "General", 0)
        assert result["priority"] == "Low"
        assert result["score"] > 0

    def test_high_urgency_keywords(self):
        result = self.calc.calculate_priority(
            "Fire in building, people dying, explosion heard",
            "Health & Safety",
            0,
        )
        assert result["priority"] in ["High", "Critical"]
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
        assert high_result["sla_hours"] in [12, 24]  # Critical or High

    def test_keywords_found(self):
        keywords = self.calc.get_urgency_keywords_found("fire and explosion near the road")
        assert "fire" in keywords
        assert "explosion" in keywords

    def test_critical_priority_band(self):
        result = self.calc.calculate_priority(
            "Fatal explosion death electrocution fire burning collapse",
            "Health & Safety",
            50,
            same_ward_count=10,
            similar_count=5,
            ward_complaint_count=20,
            repeat_count=5,
        )
        assert result["priority"] == "Critical"
        assert result["sla_hours"] == 12

    def test_explanation_present(self):
        result = self.calc.calculate_priority("Road damage", "Roads & Transport", 0)
        assert "explanation" in result
        assert "summary" in result["explanation"]
        assert "factors" in result["explanation"]

    def test_ai_urgency_override(self):
        result = self.calc.calculate_priority(
            "Minor issue",
            "General",
            0,
            ai_urgency_score=9,
        )
        assert result["breakdown"]["urgency"] == 3  # High level from AI score

    def test_fused_severity_override(self):
        result = self.calc.calculate_priority(
            "Minor issue",
            "General",
            0,
            fused_severity=3,
        )
        assert result["breakdown"]["severity"] == 3

    def test_crowd_impact_bounded(self):
        result = self.calc.calculate_priority(
            "Small issue",
            "General",
            1000,
            same_ward_count=50,
            similar_count=50,
        )
        assert result["breakdown"]["crowd_impact"] <= 3.0


# ==================== FUSION TESTS ====================

class TestMultiModalFusion:
    """Test severity fusion."""

    def test_text_only_fallback(self):
        from app.ai.fusion import fuse_severity
        result = fuse_severity(text_severity=6, has_image=False)
        assert result["mode"] == "text_only"
        assert result["fused_severity"] in [1, 2, 3]

    def test_multi_modal_fusion(self):
        from app.ai.fusion import fuse_severity
        result = fuse_severity(
            text_severity=2,
            image_severity=3,
            text_length=100,
            has_image=True,
            image_relevance=0.8,
        )
        assert result["mode"] == "multi_modal"
        assert 1 <= result["fused_severity"] <= 3

    def test_short_text_image_weighted(self):
        from app.ai.fusion import fuse_severity
        result = fuse_severity(
            text_severity=1,
            image_severity=3,
            text_length=10,
            has_image=True,
            image_relevance=0.8,
        )
        assert result["weights"]["image"] > result["weights"]["text"]

    def test_long_text_text_weighted(self):
        from app.ai.fusion import fuse_severity
        result = fuse_severity(
            text_severity=3,
            image_severity=1,
            text_length=200,
            has_image=True,
            image_relevance=0.8,
        )
        assert result["weights"]["text"] > result["weights"]["image"]

    def test_low_image_relevance_reduces_weight(self):
        from app.ai.fusion import fuse_severity
        result = fuse_severity(
            text_severity=1,
            image_severity=3,
            text_length=100,
            has_image=True,
            image_relevance=0.1,
        )
        # Image weight should be reduced
        assert result["weights"]["image"] < 0.35


# ==================== SBERT ENGINE TESTS ====================

class TestSBERTEngine:
    """Test SBERT embedding engine."""

    def test_encode_returns_array(self):
        from app.ai.sbert_engine import sbert_engine
        if not sbert_engine.is_available:
            pytest.skip("SBERT model not available")
        emb = sbert_engine.encode("Water pipe burst")
        assert emb is not None
        assert emb.shape == (384,)

    def test_cosine_similarity_identical(self):
        from app.ai.sbert_engine import sbert_engine
        import numpy as np
        vec = np.random.randn(384)
        sim = sbert_engine.cosine_similarity(vec, vec)
        assert abs(sim - 1.0) < 0.001

    def test_cosine_similarity_orthogonal(self):
        from app.ai.sbert_engine import sbert_engine
        import numpy as np
        vec1 = np.array([1.0] + [0.0] * 383)
        vec2 = np.array([0.0, 1.0] + [0.0] * 382)
        sim = sbert_engine.cosine_similarity(vec1, vec2)
        assert abs(sim) < 0.01

    def test_find_similar_empty(self):
        from app.ai.sbert_engine import sbert_engine
        import numpy as np
        result = sbert_engine.find_similar(np.random.randn(384), np.array([]), [], threshold=0.5)
        assert result == []

    def test_similar_texts_high_score(self):
        from app.ai.sbert_engine import sbert_engine
        if not sbert_engine.is_available:
            pytest.skip("SBERT model not available")
        emb1 = sbert_engine.encode("The water pipe is broken and leaking badly")
        emb2 = sbert_engine.encode("Water pipeline burst causing major leak")
        sim = sbert_engine.cosine_similarity(emb1, emb2)
        assert sim > 0.5

    def test_different_texts_low_score(self):
        from app.ai.sbert_engine import sbert_engine
        if not sbert_engine.is_available:
            pytest.skip("SBERT model not available")
        emb1 = sbert_engine.encode("Water pipe is leaking in my house")
        emb2 = sbert_engine.encode("The weather is nice today for a picnic")
        sim = sbert_engine.cosine_similarity(emb1, emb2)
        assert sim < 0.5


# ==================== YOLO VALIDATOR TESTS ====================

class TestYOLOValidator:
    """Test YOLOv8 image validator."""

    def test_error_on_missing_file(self):
        from app.ai.yolo_validator import yolo_validator
        result = yolo_validator.analyze_image("/nonexistent/path.jpg")
        assert result["status"] == "error"
        assert result["quality_flag"] == "analysis_unavailable"

    def test_score_relevance_no_detections(self):
        from app.ai.yolo_validator import yolo_validator
        result = yolo_validator.score_relevance([], "Roads & Transport")
        assert result["relevance_score"] == 0.0

    def test_score_relevance_with_detections(self):
        from app.ai.yolo_validator import yolo_validator
        detections = [
            {"class": "car", "confidence": 0.9, "bbox": [0, 0, 100, 100]},
            {"class": "person", "confidence": 0.8, "bbox": [50, 50, 150, 150]},
        ]
        result = yolo_validator.score_relevance(detections, "Roads & Transport")
        assert result["relevance_score"] > 0
        assert "car" in result["relevant_objects"]

    def test_visual_severity_no_detections(self):
        from app.ai.yolo_validator import yolo_validator
        result = yolo_validator.estimate_visual_severity([])
        assert result["visual_severity"] == 1
        assert result["severity_label"] == "Low"

    def test_visual_severity_complex_scene(self):
        from app.ai.yolo_validator import yolo_validator
        detections = [
            {"class": "person", "confidence": 0.9, "bbox": [0, 0, 100, 100]},
            {"class": "car", "confidence": 0.8, "bbox": [100, 0, 200, 100]},
            {"class": "truck", "confidence": 0.7, "bbox": [200, 0, 300, 100]},
            {"class": "person", "confidence": 0.6, "bbox": [300, 0, 400, 100]},
            {"class": "bicycle", "confidence": 0.5, "bbox": [400, 0, 500, 100]},
        ]
        result = yolo_validator.estimate_visual_severity(detections)
        assert result["visual_severity"] == 3
        assert result["severity_label"] == "High"


# ==================== TASK ROUTING TESTS ====================

class TestTaskRouting:
    """Test multi-department detection (from Phase 1, preserved)."""

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


# ==================== STATE MACHINE TESTS (preserved from Phase 1) ====================

class TestComplaintStateMachine:
    """Test complaint status transitions."""

    def test_submitted_to_verified(self):
        from app.models.complaint import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.VERIFIED) is True

    def test_submitted_to_closed_invalid(self):
        from app.models.complaint import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.CLOSED) is False

    def test_resolved_to_closed(self):
        from app.models.complaint import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED) is True


class TestTaskStateMachine:
    """Test task status transitions."""

    def test_pending_to_assigned(self):
        from app.models.task import TaskStatus
        from app.services.task_state_machine import is_valid_task_transition
        assert is_valid_task_transition(TaskStatus.PENDING, TaskStatus.ASSIGNED) is True

    def test_pending_to_completed_invalid(self):
        from app.models.task import TaskStatus
        from app.services.task_state_machine import is_valid_task_transition
        assert is_valid_task_transition(TaskStatus.PENDING, TaskStatus.COMPLETED) is False


# ==================== MODEL TESTS ====================

class TestComplaintModel:
    """Test complaint model serialization."""

    def test_complaint_creation(self):
        from app.models.complaint import Complaint, ComplaintStatus, ComplaintPriority
        complaint = Complaint(
            user_id="test_user",
            title="Test Complaint",
            category="Roads & Transport",
            description="Test description",
            location="Test Location",
        )
        assert complaint.status == ComplaintStatus.SUBMITTED
        assert complaint.priority == ComplaintPriority.LOW

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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
