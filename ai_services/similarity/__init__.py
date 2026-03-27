"""
Similarity Detection Package

Semantic similarity detection for citizen complaints using SBERT embeddings.

This package enables detection of similar complaints that rule-based
systems cannot identify. For example:
    "Water is leaking near my house" ≈ "Burst pipe outside building"

Public API:
    - find_similar_complaints: Find all similar complaints above threshold
    - check_duplicate: Check if a complaint is a potential duplicate

Example:
    >>> from AI_services.similarity import find_similar_complaints
    >>> 
    >>> similar = find_similar_complaints(
    ...     "Water leak at roadside",
    ...     [{"id": 1, "text": "Pipe burst near school"}]
    ... )
"""

from .service import find_similar_complaints, check_duplicate

__all__ = [
    "find_similar_complaints",
    "check_duplicate",
]
