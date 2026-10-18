"""
Text Intelligence Service for Samadhan Setu Phase 2.

Unified text analysis combining DistilBERT classification with
keyword-based urgency/severity scoring. Produces a complete text
analysis payload for the AI pipeline.
"""
import logging
from typing import Dict, Any, List

from .distilbert_classifier import distilbert_classifier
from .text_processor import TextProcessor
from .priority import PriorityCalculator

logger = logging.getLogger(__name__)

# Severity keywords by level
SEVERITY_KEYWORDS = {
    "critical": [
        "death", "dying", "dead", "fatal", "killed", "explosion", "blast",
        "electrocution", "collapse", "collapsed", "building fell", "crushed",
    ],
    "high": [
        "fire", "burning", "flood", "flooded", "trapped", "stuck",
        "accident", "injury", "injured", "danger", "dangerous",
        "hazard", "hazardous", "spark", "sparking", "broken bridge",
    ],
    "medium": [
        "broken", "burst", "overflow", "blocked", "blockage",
        "leak", "leaking", "damaged", "unsafe", "risk", "severe",
    ],
    "low": [
        "problem", "issue", "complaint", "not working", "stopped",
        "slow", "delay", "inconvenience",
    ],
}


class TextIntelligence:
    """
    Complete text analysis engine.
    Combines DistilBERT category classification with urgency/severity scoring.
    """

    def __init__(self):
        self.text_processor = TextProcessor()
        self.priority_calc = PriorityCalculator()

    def analyze(self, text: str) -> Dict[str, Any]:
        """
        Full text analysis pipeline.

        Returns:
            Dict with:
            - category, subcategory, confidence, source
            - urgency_score (0-10), urgency_level (Low/Medium/High)
            - severity_score (0-10), severity_level (Low/Medium/High)
            - keyword_highlights: list of detected keywords
            - explanation: human-readable summary for officers
            - model_metadata: model name, version, fallback flag
        """
        if not text or len(text.strip()) < 3:
            return self._empty_result()

        # 1. Category classification via DistilBERT (or fallback)
        classification = distilbert_classifier.classify(text)

        # 2. Urgency scoring (keyword-based, Phase 1 system)
        urgency_raw = self.priority_calc.calculate_urgency_score(text)
        urgency_level = self._urgency_label(urgency_raw)

        # 3. Severity scoring
        severity_raw = self._calculate_severity_score(text, classification["category"])
        severity_level = self._severity_label(severity_raw)

        # 4. Keyword highlights
        urgency_keywords = self.priority_calc.get_urgency_keywords_found(text)
        severity_keywords = self._get_severity_keywords_found(text)
        keyword_highlights = list(set(urgency_keywords + severity_keywords))[:10]

        # 5. Human-readable explanation
        explanation = self._build_explanation(
            classification, urgency_level, urgency_raw,
            severity_level, severity_raw, keyword_highlights,
        )

        return {
            # Category
            "category": classification["category"],
            "subcategory": classification.get("subcategory"),
            "category_confidence": classification["confidence"],
            "category_source": classification["source"],
            "category_all_scores": classification.get("all_scores", {}),
            # Urgency
            "urgency_score": urgency_raw,
            "urgency_level": urgency_level,
            # Severity
            "severity_score": severity_raw,
            "severity_level": severity_level,
            # Highlights
            "keyword_highlights": keyword_highlights,
            # Explainability
            "explanation": explanation,
            # Model metadata
            "model_metadata": {
                "classifier_model": classification.get("model_name", "rule-based"),
                "classifier_source": classification["source"],
                "is_fallback": classification.get("is_fallback", True),
                "urgency_source": "keyword-rules",
                "severity_source": "keyword-rules",
            },
        }

    def _calculate_severity_score(self, text: str, category: str) -> int:
        """
        Calculate severity score (0-10) combining keyword analysis
        with category-inherent severity.
        """
        cleaned = self.text_processor.clean_text(text)
        keyword_score = 0

        for level, keywords in SEVERITY_KEYWORDS.items():
            weight = {"critical": 5, "high": 4, "medium": 2, "low": 1}[level]
            for kw in keywords:
                if kw in cleaned:
                    keyword_score += weight

        keyword_score = min(8, keyword_score)

        # Category inherent severity bonus (0-2)
        category_bonus = {
            "Health & Safety": 2,
            "Electricity": 2,
            "Water Supply": 1,
            "Roads & Transport": 1,
            "Sanitation & Waste": 1,
            "General": 0,
        }.get(category, 0)

        return min(10, keyword_score + category_bonus)

    def _get_severity_keywords_found(self, text: str) -> List[str]:
        """Get severity keywords found in text."""
        cleaned = self.text_processor.clean_text(text)
        found = []
        for keywords in SEVERITY_KEYWORDS.values():
            for kw in keywords:
                if kw in cleaned:
                    found.append(kw)
        return found

    @staticmethod
    def _urgency_label(score: int) -> str:
        if score >= 7:
            return "High"
        elif score >= 4:
            return "Medium"
        return "Low"

    @staticmethod
    def _severity_label(score: int) -> str:
        if score >= 7:
            return "High"
        elif score >= 4:
            return "Medium"
        return "Low"

    def _build_explanation(
        self, classification, urgency_level, urgency_raw,
        severity_level, severity_raw, keywords
    ) -> str:
        parts = []
        parts.append(f"Category: {classification['category']} "
                      f"({classification['confidence']}% confidence, "
                      f"source: {classification['source']})")
        parts.append(f"Urgency: {urgency_level} (score: {urgency_raw}/10)")
        parts.append(f"Severity: {severity_level} (score: {severity_raw}/10)")
        if keywords:
            parts.append(f"Key signals: {', '.join(keywords[:5])}")
        return ". ".join(parts)

    @staticmethod
    def _empty_result() -> Dict[str, Any]:
        return {
            "category": "General",
            "subcategory": None,
            "category_confidence": 0,
            "category_source": "default",
            "category_all_scores": {},
            "urgency_score": 0,
            "urgency_level": "Low",
            "severity_score": 0,
            "severity_level": "Low",
            "keyword_highlights": [],
            "explanation": "No text provided for analysis",
            "model_metadata": {
                "classifier_model": "none",
                "classifier_source": "default",
                "is_fallback": True,
                "urgency_source": "default",
                "severity_source": "default",
            },
        }


# Singleton
text_intelligence = TextIntelligence()
