"""
Classification Service API

Public interface for the ML classification service.
Exposes a clean API for the backend to consume.
"""

from typing import Dict, Any
from .predictor import predict_category


def classify_complaint_ml(text: str) -> Dict[str, Any]:
    """
    Classify a complaint using the ML model.
    
    This function ONLY performs ML inference. 
    It does NOT handle fallback logic - that belongs in the bridge/backend.
    
    Args:
        text: The complaint description string
        
    Returns:
        Dict with keys:
        - "category": Predicted category string
        - "confidence": Float score (0.0 - 1.0)
        
    Example:
        >>> result = classify_complaint_ml("Sparking electric wire")
        >>> print(result)
        {'category': 'Electricity', 'confidence': 0.98}
    """
    category, confidence = predict_category(text)
    
    return {
        "category": category,
        "confidence": round(confidence, 4)
    }
