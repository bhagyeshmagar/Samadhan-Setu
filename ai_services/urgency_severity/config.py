"""
Configuration Module for Urgency & Severity Service

Centralizes all configuration values including:
- Descriptive zero-shot labels (optimized for MNLI)
- Confidence thresholds (separate for urgency vs severity)
- Model settings
"""

import os

# Zero-Shot Labels (Descriptive for better accuracy)
# These map to "Low", "Medium", "High" respectively

URGENCY_LABELS = [
    "Not time sensitive",
    "Requires attention soon", 
    "Immediate attention required"
]

SEVERITY_LABELS = [
    "Minor inconvenience",
    "Moderate public impact",
    "Severe risk to public safety"
]

# Label Mapping (ML label -> simple output)
URGENCY_LABEL_MAP = {
    "Not time sensitive": "Low",
    "Requires attention soon": "Medium",
    "Immediate attention required": "High"
}

SEVERITY_LABEL_MAP = {
    "Minor inconvenience": "Low",
    "Moderate public impact": "Medium",
    "Severe risk to public safety": "High"
}

# Model Configuration
# Same model as Classification Service - HuggingFace cache handles reuse
MODEL_NAME = os.getenv(
    "URGENCY_MODEL_NAME",
    "typeform/distilbert-base-uncased-mnli"
)

# Confidence Thresholds (Separate for nuanced decision-making)
# Urgency needs higher confidence (time-sensitive decisions)
URGENCY_CONFIDENCE_THRESHOLD = float(
    os.getenv("URGENCY_CONFIDENCE_THRESHOLD", "0.65")
)

# Severity can tolerate slightly lower confidence
SEVERITY_CONFIDENCE_THRESHOLD = float(
    os.getenv("SEVERITY_CONFIDENCE_THRESHOLD", "0.60")
)

# Feature Toggle
USE_ML_URGENCY_SEVERITY = os.getenv(
    "USE_ML_URGENCY_SEVERITY", "True"
).lower() == "true"
