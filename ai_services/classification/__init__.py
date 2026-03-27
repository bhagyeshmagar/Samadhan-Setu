"""
Classification AI Service Package

Exposes the text classification capabilities.
"""

from .service import classify_complaint_ml
from .config import MODEL_NAME, CONFIDENCE_THRESHOLD

__all__ = ["classify_complaint_ml", "MODEL_NAME", "CONFIDENCE_THRESHOLD"]
