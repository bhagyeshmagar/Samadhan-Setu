"""
Singleton Zero-Shot Classification Model Loader

Loads the Hugging Face pipeline for zero-shot classification using DistilBERT.
Uses lazy loading to optimize resource usage.
"""

from transformers import pipeline
from typing import Optional, Any
from .config import MODEL_NAME


class ZeroShotModelSingleton:
    """
    Singleton class to manage the Zero-Shot Classification pipeline.
    """
    
    _instance: Optional['ZeroShotModelSingleton'] = None
    _pipeline: Optional[Any] = None
    
    def __new__(cls) -> 'ZeroShotModelSingleton':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_pipeline(self) -> Any:
        """
        Get the classification pipeline.
        Lazy loads on first access.
        """
        if self._pipeline is None:
            print(f"Loading Classification Model: {MODEL_NAME}...")
            # Using the pipeline API is the cleanest way for zero-shot
            # This automatically handles tokenization and entailment logic
            self._pipeline = pipeline(
                "zero-shot-classification",
                model=MODEL_NAME
            )
            print("Classification Model loaded successfully!")
        return self._pipeline


def get_classifier_pipeline() -> Any:
    """
    Get the singleton classification pipeline.
    """
    return ZeroShotModelSingleton().get_pipeline()
