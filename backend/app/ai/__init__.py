"""
Samadhan Setu AI Module
AI-powered complaint classification and prioritization

This module provides:
- Text preprocessing (cleaning, tokenization)
- Category classification (rule-based, ML-ready architecture)
- Priority scoring (urgency detection, severity weighting)
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
    calculate_hybrid_priority
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
    "calculate_hybrid_priority",
]


def process_complaint(text: str, upvotes: int = 0) -> dict:
    """
    Full AI processing pipeline for a complaint
    
    Args:
        text: Complaint description
        upvotes: Number of community upvotes (for priority boost)
        
    Returns:
        Dict with category, priority, confidence, urgency_score
    """
    # Classify category
    category, confidence = classify_complaint(text)
    
    # Calculate priority
    priority, urgency_score = calculate_priority(text, category, upvotes)
    
    return {
        'category': category,
        'confidence': confidence,
        'priority': priority,
        'urgency_score': urgency_score
    }
