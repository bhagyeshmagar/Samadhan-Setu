"""
Priority Scoring Module for Samadhan Setu Phase 2.

Formula:
  Score = 0.30 × Urgency
        + 0.30 × Severity
        + 0.15 × Crowd Impact (bounded, not popularity-driven)
        + 0.10 × SLA Risk
        + 0.10 × Location Criticality
        + 0.05 × History

Phase 2 upgrades:
- Urgency: now accepts AI-computed urgency score (0-10 from text_intelligence)
- Severity: supports multi-modal fusion (text + image)
- Crowd Impact: bounded aggregation with anti-brigading
- SLA Risk: computed from complaint age, category urgency, department backlog
- Location Criticality: ward complaint density analysis
- History: repeat complaint detection
- Priority Bands: Critical (≥2.5), High (≥2.0), Medium (≥1.5), Low (<1.5)
- Full explainability for every score

Upvotes do NOT determine priority. Crowd impact is capped and comes from
local confirmations, not popularity. AI suggests, officers decide.
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from .text_processor import TextProcessor


class PriorityCalculator:

    # Urgency keywords with weight scores
    URGENCY_KEYWORDS: Dict[str, int] = {
        'death': 5, 'dying': 5, 'dead': 5, 'fatal': 5,
        'fire': 5, 'burning': 5, 'explosion': 5, 'blast': 5,
        'electrocution': 5, 'shock': 4,
        'danger': 4, 'dangerous': 4, 'hazard': 4, 'hazardous': 4,
        'urgent': 4, 'emergency': 4, 'critical': 4,
        'accident': 4, 'injury': 4, 'injured': 4,
        'collapse': 4, 'collapsed': 4, 'falling': 4,
        'spark': 4, 'sparking': 4,
        'broken': 3, 'burst': 3, 'flooding': 3, 'flooded': 3,
        'blocked': 3, 'blockage': 3, 'overflow': 3,
        'stuck': 3, 'trapped': 3,
        'unsafe': 3, 'risk': 3,
        'severe': 3, 'major': 3,
        'problem': 2, 'issue': 2, 'complaint': 2,
        'not working': 2, 'stopped': 2, 'damaged': 2,
        'leaking': 2, 'leak': 2,
    }

    # Category severity multipliers (maps to 1-3 scale)
    CATEGORY_SEVERITY: Dict[str, int] = {
        'Health & Safety': 3,
        'Electricity': 3,
        'Water Supply': 2,
        'Roads & Transport': 2,
        'Sanitation & Waste': 2,
        'General': 1,
    }

    # Weights
    W_URGENCY = 0.30
    W_SEVERITY = 0.30
    W_CROWD = 0.15
    W_SLA_RISK = 0.10
    W_LOCATION = 0.10
    W_HISTORY = 0.05

    # Default priority band thresholds (admin-configurable via Firestore)
    BAND_CRITICAL = 2.5
    BAND_HIGH = 2.0
    BAND_MEDIUM = 1.5

    def __init__(self):
        self.text_processor = TextProcessor()

    def calculate_urgency_score(self, text: str) -> int:
        """Calculate urgency score (0-10) based on keyword presence."""
        if not text:
            return 0
        cleaned = self.text_processor.clean_text(text)
        total_score = 0
        for keyword, weight in self.URGENCY_KEYWORDS.items():
            if keyword in cleaned:
                total_score += weight
        return min(10, total_score)

    def _urgency_level(self, score: int) -> int:
        """Convert raw urgency score (0-10) to level (1-3)."""
        if score >= 7:
            return 3
        elif score >= 4:
            return 2
        return 1

    def _severity_level(self, category: str) -> int:
        """Get severity level (1-3) from category."""
        return self.CATEGORY_SEVERITY.get(category, 1)

    def _crowd_impact(
        self,
        upvotes: int,
        same_ward_count: int = 0,
        similar_count: int = 0,
    ) -> float:
        """
        Bounded crowd impact. Capped at 3.0. Anti-brigading.

        Factors:
        - upvotes: capped contribution
        - same_ward_count: nearby complaints with similar issue
        - similar_count: semantically similar complaints
        """
        # Upvote contribution: logarithmic cap
        upvote_factor = min(1.5, upvotes * 0.1) if upvotes > 0 else 0.0

        # Ward density contribution
        ward_factor = min(1.0, same_ward_count * 0.15) if same_ward_count > 0 else 0.0

        # Similarity contribution
        similar_factor = min(0.5, similar_count * 0.1) if similar_count > 0 else 0.0

        crowd = 1.0 + upvote_factor + ward_factor + similar_factor
        return min(3.0, crowd)

    def _sla_risk(
        self,
        created_at: Optional[datetime] = None,
        deadline: Optional[datetime] = None,
        category: str = "General",
        dept_pending_count: int = 0,
    ) -> float:
        """
        SLA risk factor (1-3). Higher = more urgent.
        Based on time remaining, category, and department backlog.
        """
        risk = 1.0

        if created_at and deadline:
            now = datetime.utcnow()
            total_window = (deadline - created_at).total_seconds()
            elapsed = (now - created_at).total_seconds()

            if total_window > 0:
                progress = elapsed / total_window
                if progress >= 1.0:
                    risk = 3.0  # SLA breached
                elif progress >= 0.75:
                    risk = 2.5  # Critical risk
                elif progress >= 0.5:
                    risk = 2.0  # Moderate risk
                elif progress >= 0.25:
                    risk = 1.5
        elif created_at:
            # No deadline — estimate from age
            age_hours = (datetime.utcnow() - created_at).total_seconds() / 3600
            if age_hours > 168:
                risk = 2.5
            elif age_hours > 72:
                risk = 2.0
            elif age_hours > 24:
                risk = 1.5

        # Department backlog factor
        if dept_pending_count > 20:
            risk = min(3.0, risk + 0.5)
        elif dept_pending_count > 10:
            risk = min(3.0, risk + 0.25)

        return min(3.0, risk)

    def _location_criticality(
        self, ward_complaint_count: int = 0
    ) -> float:
        """
        Location criticality (1-3).
        Based on ward complaint density in recent period.
        """
        if ward_complaint_count >= 15:
            return 3.0
        elif ward_complaint_count >= 8:
            return 2.0
        elif ward_complaint_count >= 3:
            return 1.5
        return 1.0

    def _history_factor(
        self, repeat_count: int = 0
    ) -> float:
        """
        History factor (1-3).
        Based on repeat complaints in same location/category.
        """
        if repeat_count >= 5:
            return 3.0
        elif repeat_count >= 3:
            return 2.0
        elif repeat_count >= 1:
            return 1.5
        return 1.0

    def calculate_priority(
        self,
        text: str,
        category: str,
        upvotes: int = 0,
        # Phase 2 optional context
        ai_urgency_score: Optional[int] = None,
        fused_severity: Optional[int] = None,
        same_ward_count: int = 0,
        similar_count: int = 0,
        created_at: Optional[datetime] = None,
        deadline: Optional[datetime] = None,
        dept_pending_count: int = 0,
        ward_complaint_count: int = 0,
        repeat_count: int = 0,
        config_bands: Optional[Dict] = None,
    ) -> Dict:
        """
        Calculate the composite priority score with full explainability.

        Returns:
            Dict with score, priority label, sla_hours, breakdown, and explanation.
        """
        # Urgency: prefer AI-computed, fall back to keyword
        if ai_urgency_score is not None:
            urgency_raw = ai_urgency_score
        else:
            urgency_raw = self.calculate_urgency_score(text)
        urgency = self._urgency_level(urgency_raw)

        # Severity: prefer fused multi-modal, fall back to category
        if fused_severity is not None:
            severity = max(1, min(3, fused_severity))
        else:
            severity = self._severity_level(category)

        # Crowd impact with anti-brigading
        crowd = self._crowd_impact(upvotes, same_ward_count, similar_count)

        # SLA risk
        sla_risk = self._sla_risk(created_at, deadline, category, dept_pending_count)

        # Location criticality
        location = self._location_criticality(ward_complaint_count)

        # History
        history = self._history_factor(repeat_count)

        # Compute weighted score
        score = (
            self.W_URGENCY * urgency
            + self.W_SEVERITY * severity
            + self.W_CROWD * crowd
            + self.W_SLA_RISK * sla_risk
            + self.W_LOCATION * location
            + self.W_HISTORY * history
        )

        # Priority bands (admin-configurable)
        bands = config_bands or {}
        critical_threshold = bands.get("critical", self.BAND_CRITICAL)
        high_threshold = bands.get("high", self.BAND_HIGH)
        medium_threshold = bands.get("medium", self.BAND_MEDIUM)

        if score >= critical_threshold:
            priority = "Critical"
            sla_hours = 12
        elif score >= high_threshold:
            priority = "High"
            sla_hours = 24
        elif score >= medium_threshold:
            priority = "Medium"
            sla_hours = 72
        else:
            priority = "Low"
            sla_hours = 168  # 7 days

        # Build explanation
        explanation = {
            "summary": f"Priority {priority} (score: {round(score, 4)})",
            "formula": "0.30×Urgency + 0.30×Severity + 0.15×Crowd + 0.10×SLA + 0.10×Location + 0.05×History",
            "factors": {
                "urgency": {
                    "value": urgency,
                    "raw_score": urgency_raw,
                    "weight": self.W_URGENCY,
                    "contribution": round(self.W_URGENCY * urgency, 4),
                    "reason": f"Urgency level {urgency}/3 (raw: {urgency_raw}/10)",
                },
                "severity": {
                    "value": severity,
                    "weight": self.W_SEVERITY,
                    "contribution": round(self.W_SEVERITY * severity, 4),
                    "source": "multi_modal" if fused_severity is not None else "category_based",
                    "reason": f"Severity level {severity}/3",
                },
                "crowd_impact": {
                    "value": round(crowd, 3),
                    "weight": self.W_CROWD,
                    "contribution": round(self.W_CROWD * crowd, 4),
                    "upvotes": upvotes,
                    "same_ward": same_ward_count,
                    "similar": similar_count,
                    "reason": f"Crowd impact {round(crowd, 2)}/3 (upvotes: {upvotes}, ward: {same_ward_count}, similar: {similar_count})",
                },
                "sla_risk": {
                    "value": round(sla_risk, 3),
                    "weight": self.W_SLA_RISK,
                    "contribution": round(self.W_SLA_RISK * sla_risk, 4),
                    "reason": f"SLA risk {round(sla_risk, 2)}/3",
                },
                "location_criticality": {
                    "value": round(location, 3),
                    "weight": self.W_LOCATION,
                    "contribution": round(self.W_LOCATION * location, 4),
                    "ward_complaints": ward_complaint_count,
                    "reason": f"Location criticality {round(location, 2)}/3 (ward complaints: {ward_complaint_count})",
                },
                "history": {
                    "value": round(history, 3),
                    "weight": self.W_HISTORY,
                    "contribution": round(self.W_HISTORY * history, 4),
                    "repeat_count": repeat_count,
                    "reason": f"History factor {round(history, 2)}/3 (repeats: {repeat_count})",
                },
            },
            "bands": {
                "critical": critical_threshold,
                "high": high_threshold,
                "medium": medium_threshold,
            },
        }

        return {
            "score": round(score, 4),
            "priority": priority,
            "sla_hours": sla_hours,
            "breakdown": {
                "urgency": urgency,
                "severity": severity,
                "crowd_impact": crowd,
                "sla_risk": sla_risk,
                "location_criticality": location,
                "history": history,
            },
            "explanation": explanation,
        }

    def get_urgency_keywords_found(self, text: str) -> List[str]:
        """Get list of urgency keywords found in text."""
        cleaned = self.text_processor.clean_text(text)
        return [kw for kw in self.URGENCY_KEYWORDS if kw in cleaned]


# Singleton
priority_calculator = PriorityCalculator()


def calculate_priority(text: str, category: str, upvotes: int = 0, **kwargs) -> Dict:
    """Convenience function for priority calculation."""
    return priority_calculator.calculate_priority(text, category, upvotes, **kwargs)


def get_urgency_score(text: str) -> int:
    """Convenience function to get urgency score only."""
    return priority_calculator.calculate_urgency_score(text)
