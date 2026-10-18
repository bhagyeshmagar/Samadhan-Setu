"""
Samadhan Setu AI Module (Phase 1 + Phase 2)

Phase 1:
- Text preprocessing (cleaning, tokenization)
- Category classification (rule-based, ML-ready architecture)
- Priority scoring (6-factor weighted formula)

Phase 2:
- DistilBERT zero-shot classification
- SBERT semantic similarity engine
- YOLOv8 image evidence validation
- Multi-modal severity fusion
- Text intelligence pipeline
- Enhanced priority with full explainability
"""

from .text_processor import TextProcessor
from .classifier import (
    CategoryClassifier,
    classifier,
    classify_complaint,
    get_classification_details
)
from .priority import (
    PriorityCalculator,
    priority_calculator,
    calculate_priority,
    get_urgency_score,
)

__all__ = [
    "TextProcessor",
    "CategoryClassifier",
    "classifier",
    "classify_complaint",
    "get_classification_details",
    "PriorityCalculator",
    "priority_calculator",
    "calculate_priority",
    "get_urgency_score",
]


def process_complaint(text: str, upvotes: int = 0) -> dict:
    """
    Full AI processing pipeline for a complaint.

    Args:
        text: Complaint description
        upvotes: Number of community upvotes

    Returns:
        Dict with category, priority, confidence, urgency_score
    """
    category, confidence = classify_complaint(text)
    result = calculate_priority(text, category, upvotes)

    return {
        'category': category,
        'confidence': confidence,
        'priority': result['priority'],
        'urgency_score': result['score'],
    }
