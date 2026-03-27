"""
Configuration Module

Centralizes all configuration values for the similarity service.
Reads from environment variables with sensible defaults.
"""

import os

# Model Configuration
# Can be overridden by setting SBERT_MODEL_NAME environment variable
MODEL_NAME = os.getenv(
    "SBERT_MODEL_NAME", 
    "sentence-transformers/all-MiniLM-L6-v2"
)

# Similarity Configuration
# Thresholds for detecting loose similarity vs strict duplication
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.75"))
DUPLICATE_THRESHOLD = float(os.getenv("DUPLICATE_THRESHOLD", "0.90"))

# Batch Processing
# Maximum number of texts to embed in a single batch
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
