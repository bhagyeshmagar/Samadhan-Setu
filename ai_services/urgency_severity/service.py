"""
Urgency & Severity Service API

Public interface for the urgency/severity detection service.
Exposes a clean API for the backend bridge to consume.
"""

from typing import Dict, Any
from .predictor import predict_urgency_and_severity


def detect_urgency_severity(text: str) -> Dict[str, Any]:
    """
    Detect urgency and severity levels for a grievance.
    
    This function ONLY performs ML inference.
    It does NOT handle fallback logic - that belongs in ai_bridge.py.
    
    Args:
        text: The complaint/grievance description
        
    Returns:
        Dict with:
        - urgency: {level: "Low/Medium/High", confidence: float}
        - severity: {level: "Low/Medium/High", confidence: float}
        
    Example:
        >>> result = detect_urgency_severity("Fire near hospital")
        >>> print(result)
        {
          'urgency': {'level': 'High', 'confidence': 0.89},
          'severity': {'level': 'High', 'confidence': 0.85}
        }
    """
    return predict_urgency_and_severity(text)
