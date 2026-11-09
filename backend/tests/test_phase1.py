"""
test_phase1.py – State machine, priority scoring, and routing unit tests.

Re-written for the PostgreSQL ORM edition.
All imports now reference the ORM models and current service paths.
"""
import pytest


# ── State Machine ─────────────────────────────────────────────────────────────

class TestComplaintStateMachine:
    """Valid and invalid complaint status transitions."""

    def test_submitted_to_verified(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.VERIFIED) is True

    def test_submitted_to_assigned(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.ASSIGNED) is True

    def test_submitted_to_resolved_invalid(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.RESOLVED) is False

    def test_submitted_to_closed_invalid(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.SUBMITTED, ComplaintStatus.CLOSED) is False

    def test_assigned_to_in_progress(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.ASSIGNED, ComplaintStatus.IN_PROGRESS) is True

    def test_in_progress_to_resolved(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED) is True

    def test_resolved_to_closed(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED) is True

    def test_resolved_to_reopened(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.REOPENED) is True

    def test_resolved_to_appealed(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.RESOLVED, ComplaintStatus.APPEALED) is True

    def test_closed_to_reopened(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.CLOSED, ComplaintStatus.REOPENED) is True

    def test_closed_to_in_progress_invalid(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.CLOSED, ComplaintStatus.IN_PROGRESS) is False

    def test_reopened_to_assigned(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.REOPENED, ComplaintStatus.ASSIGNED) is True

    def test_appealed_to_in_progress(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.APPEALED, ComplaintStatus.IN_PROGRESS) is True

    def test_appealed_to_closed(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.APPEALED, ComplaintStatus.CLOSED) is True

    def test_get_allowed_from_submitted(self):
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import get_allowed_transitions
        allowed = get_allowed_transitions(ComplaintStatus.SUBMITTED)
        assert ComplaintStatus.VERIFIED in allowed
        assert ComplaintStatus.ASSIGNED in allowed
        assert ComplaintStatus.RESOLVED not in allowed

    def test_appealed_l1_to_in_progress(self):
        """APPEALED_L1 should allow re-entry to work queue."""
        from app.models.orm.enums import ComplaintStatus
        from app.services.state_machine import is_valid_transition
        assert is_valid_transition(ComplaintStatus.APPEALED_L1, ComplaintStatus.IN_PROGRESS) is True

    def test_no_string_transition_table(self):
        """Ensure the removed STRING_VALID_TRANSITIONS alias no longer exists."""
        import app.services.state_machine as sm
        assert not hasattr(sm, "STRING_VALID_TRANSITIONS"), (
            "STRING_VALID_TRANSITIONS was removed — only VALID_TRANSITIONS should exist"
        )


# ── Priority Calculator ───────────────────────────────────────────────────────

class TestPriorityCalculator:
    """6-factor priority scoring (0.0–3.0 scale)."""

    def setup_method(self):
        from app.ai.priority import PriorityCalculator
        self.calc = PriorityCalculator()

    def test_empty_text_returns_valid_structure(self):
        result = self.calc.calculate_priority("", "General", 0)
        assert "priority" in result
        assert "score" in result
        assert "breakdown" in result
        assert isinstance(result["score"], (int, float))

    def test_score_range(self):
        """Priority score must stay in [0.0, 3.0]."""
        result = self.calc.calculate_priority("fire explosion emergency death danger", "Health & Safety", 50)
        assert 0.0 <= result["score"] <= 3.0

    def test_high_urgency_keywords(self):
        result = self.calc.calculate_priority(
            "Fire in building, people dying, explosion heard",
            "Health & Safety",
            0,
        )
        assert result["priority"] in ("High", "Critical")
        assert result["score"] >= 2.0

    def test_medium_urgency(self):
        result = self.calc.calculate_priority(
            "Water pipe is broken and flooding the area",
            "Water Supply",
            0,
        )
        assert result["priority"] in ("Medium", "High")

    def test_low_urgency(self):
        result = self.calc.calculate_priority("Small issue with road surface", "General", 0)
        assert result["priority"] in ("Low", "Medium")

    def test_upvotes_bounded_impact(self):
        """Crowd factor (weight 0.15) cannot change priority by more than 0.5."""
        no_votes  = self.calc.calculate_priority("Small pothole on road", "General", 0)
        many_votes = self.calc.calculate_priority("Small pothole on road", "General", 100)
        assert abs(many_votes["score"] - no_votes["score"]) <= 0.5

    def test_breakdown_has_all_factors(self):
        result = self.calc.calculate_priority("Road is damaged", "Roads & Transport", 5)
        breakdown = result["breakdown"]
        for factor in ("urgency", "severity", "crowd_impact", "sla_risk", "location_criticality", "history"):
            assert factor in breakdown, f"Missing factor: {factor}"

    def test_sla_hours_mapping_critical(self):
        result = self.calc.calculate_priority(
            "Fire emergency explosion danger death", "Health & Safety", 0
        )
        # Critical / High should map to ≤ 72 hours
        assert result["sla_hours"] <= 72

    def test_keywords_found(self):
        keywords = self.calc.get_urgency_keywords_found("fire and explosion near the road")
        assert "fire" in keywords
        assert "explosion" in keywords


# ── Multi-department Task Routing ─────────────────────────────────────────────

class TestTaskRouting:
    """Keyword-based multi-department detection."""

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


# ── Rate Limiter (H4) ─────────────────────────────────────────────────────────

class TestRateLimiter:
    """Sliding-window rate limiter correctness (no network required)."""

    def test_allows_requests_under_limit(self):
        from app.services.rate_limiter import SlidingWindowRateLimiter
        rl = SlidingWindowRateLimiter()
        for _ in range(5):
            assert rl.check_rate_limit("test_key", max_requests=5, window_seconds=60) is True

    def test_blocks_requests_over_limit(self):
        from app.services.rate_limiter import SlidingWindowRateLimiter
        rl = SlidingWindowRateLimiter()
        for _ in range(3):
            rl.check_rate_limit("key2", max_requests=3, window_seconds=60)
        assert rl.check_rate_limit("key2", max_requests=3, window_seconds=60) is False

    def test_different_keys_are_independent(self):
        from app.services.rate_limiter import SlidingWindowRateLimiter
        rl = SlidingWindowRateLimiter()
        assert rl.check_rate_limit("alice", max_requests=1, window_seconds=60) is True
        assert rl.check_rate_limit("alice", max_requests=1, window_seconds=60) is False
        # bob hasn't been seen yet — should still be allowed
        assert rl.check_rate_limit("bob", max_requests=1, window_seconds=60) is True


# ── Storage Backend ───────────────────────────────────────────────────────────

class TestLocalStorage:
    """LocalStorage saves bytes and returns a /uploads/ URL."""

    def test_save_and_url(self, tmp_path):
        import asyncio
        from app.services.storage import LocalStorage
        ls = LocalStorage(uploads_dir=str(tmp_path))
        url = asyncio.run(ls.save_file(b"fake-jpeg-bytes", "comp-id/proof_abc.jpg"))
        assert url == "/uploads/comp-id/proof_abc.jpg"
        assert (tmp_path / "comp-id" / "proof_abc.jpg").exists()

    def test_delete(self, tmp_path):
        import asyncio
        from app.services.storage import LocalStorage
        ls = LocalStorage(uploads_dir=str(tmp_path))
        asyncio.run(ls.save_file(b"data", "x/file.jpg"))
        asyncio.run(ls.delete_file("x/file.jpg"))
        assert not (tmp_path / "x" / "file.jpg").exists()

    def test_delete_missing_file_no_error(self, tmp_path):
        import asyncio
        from app.services.storage import LocalStorage
        ls = LocalStorage(uploads_dir=str(tmp_path))
        # Should not raise
        asyncio.run(ls.delete_file("nonexistent/file.jpg"))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
