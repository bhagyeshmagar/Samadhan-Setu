"""
Prediction Logic for Classification Service

Handles the actual inference using the model pipeline.
Separates the "how" (inference) from the "what" (API).
"""

from typing import Tuple, Dict
from .model import get_classifier_pipeline
from .config import CANDIDATE_LABELS


def predict_category(text: str) -> Tuple[str, float]:
    """
    Predict the category for a given text using zero-shot classification.
    
    Args:
        text: The complaint description
        
    Returns:
        Tuple of (predicted_category, confidence_score)
        Confidence score is a float between 0.0 and 1.0
    
    Example:
        >>> cat, score = predict_category("Wire sparking on pole")
        >>> print(cat, score)
        "Electricity", 0.98
    """
    if not text or not text.strip():
        return ("Unknown", 0.0)
        
    pipeline = get_classifier_pipeline()
    
    # Run zero-shot classification
    # multi_label=False means we force the model to pick the best single category
    result = pipeline(
        text, 
        candidate_labels=CANDIDATE_LABELS,
        multi_label=False
    )
    
    # Result format from pipeline:
    # {
    #   'sequence': 'Wire sparking...',
    #   'labels': ['Electricity', 'Fire Safety', ...],
    #   'scores': [0.98, 0.01, ...]
    # }
    
    best_label = result['labels'][0]
    best_score = result['scores'][0]
    
    return (best_label, float(best_score))
