"""
Singleton Zero-Shot Classification Model Loader for Urgency/Severity

Uses HuggingFace cache for efficient model reuse across services.
Does NOT import from other AI services to avoid circular dependencies.
"""

from transformers import pipeline
from typing import Optional, Any
from .config import MODEL_NAME


class UrgencySeverityModelSingleton:
    """
    Singleton class to manage the Zero-Shot Classification pipeline.
    
    Uses the same model as Classification Service, but loads independently.
    HuggingFace's caching ensures no duplicate downloads.
    """
    
    _instance: Optional['UrgencySeverityModelSingleton'] = None
    _pipeline: Optional[Any] = None
    
    def __new__(cls) -> 'UrgencySeverityModelSingleton':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_pipeline(self) -> Any:
        """
        Get the classification pipeline.
        Lazy loads on first access.
        """
        if self._pipeline is None:
            print(f"Loading Urgency/Severity Model: {MODEL_NAME}...")
            self._pipeline = pipeline(
                "zero-shot-classification",
                model=MODEL_NAME
            )
            print("Urgency/Severity Model loaded successfully!")
        return self._pipeline


def get_urgency_severity_pipeline() -> Any:
    """
    Get the singleton classification pipeline.
    """
    return UrgencySeverityModelSingleton().get_pipeline()
