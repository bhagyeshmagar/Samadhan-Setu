"""
Configuration Module for Classification Service

Centralizes all configuration values including:
- Candidate categories
- Model settings
- Confidence thresholds
"""

import os

# Candidate Categories
# These must match or map to the rule-based classifier categories
CANDIDATE_LABELS = [
    "Water Supply",
    "Roads & Transport",
    "Electricity",
    "Sanitation & Waste",
    "Health & Safety"
]

# Model Configuration
# Using DistilBERT fine-tuned on MNLI for zero-shot classification
# This allows us to classify text into categories without training data
MODEL_NAME = os.getenv(
    "CLASSIFICATION_MODEL_NAME", 
    "typeform/distilbert-base-uncased-mnli"
)

# Confidence Thresholds
# Minimum confidence (0-1) to accept ML prediction
# If model confidence is below this, we fallback to rule-based logic
CONFIDENCE_THRESHOLD = float(os.getenv("CLASSIFICATION_CONFIDENCE_THRESHOLD", "0.60"))

# Feature Flags
USE_ML_CLASSIFIER = os.getenv("USE_ML_CLASSIFIER", "True").lower() == "true"
