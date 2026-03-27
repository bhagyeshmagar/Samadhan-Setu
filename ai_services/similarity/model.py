"""
Singleton SBERT Model Loader

Loads the sentence-transformers model once and reuses it across all requests.
Uses lazy loading to avoid loading the model until it's actually needed.

Model: all-MiniLM-L6-v2 (lightweight, fast, good for hackathons)
"""

from sentence_transformers import SentenceTransformer
from typing import Optional
from .config import MODEL_NAME


class SBERTModelSingleton:
    """
    Singleton class to manage SBERT model instance.
    
    Ensures the model is loaded only once, saving memory and startup time.
    Uses lazy loading - model is only loaded when first accessed.
    """
    
    _instance: Optional['SBERTModelSingleton'] = None
    _model: Optional[SentenceTransformer] = None
    
    def __new__(cls) -> 'SBERTModelSingleton':
        """Create singleton instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_model(self) -> SentenceTransformer:
        """
        Get the SBERT model instance.
        
        Lazy loads the model on first call, then reuses the same instance.
        
        Returns:
            SentenceTransformer: The loaded SBERT model
        """
        if self._model is None:
            print(f"Loading SBERT model: {MODEL_NAME}...")
            self._model = SentenceTransformer(MODEL_NAME)
            print("Model loaded successfully!")
        return self._model


# Global accessor function for clean API
def get_sbert_model() -> SentenceTransformer:
    """
    Get the singleton SBERT model instance.
    
    This is the primary way to access the model from other modules.
    The model is lazily loaded on first call.
    
    Returns:
        SentenceTransformer: The loaded SBERT model
    
    Example:
        >>> model = get_sbert_model()
        >>> embeddings = model.encode(["Hello world"])
    """
    return SBERTModelSingleton().get_model()
