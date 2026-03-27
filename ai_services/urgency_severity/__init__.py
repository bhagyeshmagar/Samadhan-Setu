"""
Urgency & Severity AI Service Package

Exposes urgency and severity detection capabilities.
"""

from .service import detect_urgency_severity
from .config import (
    URGENCY_CONFIDENCE_THRESHOLD,
    SEVERITY_CONFIDENCE_THRESHOLD,
    USE_ML_URGENCY_SEVERITY
)

__all__ = [
    "detect_urgency_severity",
    "URGENCY_CONFIDENCE_THRESHOLD",
    "SEVERITY_CONFIDENCE_THRESHOLD",
    "USE_ML_URGENCY_SEVERITY"
]
