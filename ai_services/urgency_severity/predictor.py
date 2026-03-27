"""
Prediction Logic for Urgency & Severity Service

Handles the actual inference using the zero-shot pipeline.
Runs two separate classifications: one for urgency, one for severity.
"""

from typing import Dict, Any
from .model import get_urgency_severity_pipeline
from .config import (
    URGENCY_LABELS,
    SEVERITY_LABELS,
    URGENCY_LABEL_MAP,
    SEVERITY_LABEL_MAP
)


def predict_urgency(text: str) -> Dict[str, Any]:
    """
    Predict urgency level for a given text.
    
    Args:
        text: The complaint description
        
    Returns:
        Dict with 'level' (Low/Medium/High) and 'confidence' (0-1)
    """
    if not text or not text.strip():
        return {"level": "Low", "confidence": 0.0}
    
    pipeline = get_urgency_severity_pipeline()
    
    result = pipeline(
        text,
        candidate_labels=URGENCY_LABELS,
        multi_label=False
    )
    
    # Get top prediction
    top_label = result['labels'][0]
    top_score = result['scores'][0]
    
    # Map descriptive label to simple output
    simple_level = URGENCY_LABEL_MAP.get(top_label, "Medium")
    
    return {
        "level": simple_level,
        "confidence": round(float(top_score), 4)
    }


def predict_severity(text: str) -> Dict[str, Any]:
    """
    Predict severity level for a given text.
    
    Args:
        text: The complaint description
        
    Returns:
        Dict with 'level' (Low/Medium/High) and 'confidence' (0-1)
    """
    if not text or not text.strip():
        return {"level": "Low", "confidence": 0.0}
    
    pipeline = get_urgency_severity_pipeline()
    
    result = pipeline(
        text,
        candidate_labels=SEVERITY_LABELS,
        multi_label=False
    )
    
    # Get top prediction
    top_label = result['labels'][0]
    top_score = result['scores'][0]
    
    # Map descriptive label to simple output
    simple_level = SEVERITY_LABEL_MAP.get(top_label, "Medium")
    
    return {
        "level": simple_level,
        "confidence": round(float(top_score), 4)
    }


def predict_urgency_and_severity(text: str) -> Dict[str, Any]:
    """
    Predict both urgency and severity for a given text.
    
    Args:
        text: The complaint description
        
    Returns:
        Dict with:
        - urgency: {level, confidence}
        - severity: {level, confidence}
    """
    urgency = predict_urgency(text)
    severity = predict_severity(text)
    
    return {
        "urgency": urgency,
        "severity": severity
    }
