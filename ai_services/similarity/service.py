"""
Similarity Detection Service

Main public API for finding similar complaints using semantic similarity.
This is the entry point for the backend to detect duplicate/similar complaints.

Example Usage:
    from AI_services.similarity.service import find_similar_complaints
    
    new_complaint = "Water is leaking near my house"
    existing = [
        {"id": 1, "text": "Burst pipe outside building"},
        {"id": 2, "text": "Garbage not collected"}
    ]
    
    similar = find_similar_complaints(new_complaint, existing)
    # Returns: [{"complaint_id": 1, "similarity_score": 0.82}]
"""

from typing import TypedDict

from .embedder import embed_text, embed_texts
from .similarity import compute_similarity_batch
from .config import SIMILARITY_THRESHOLD, DUPLICATE_THRESHOLD


# Type definitions for clean API
class ComplaintInput(TypedDict):
    """Input format for existing complaints."""
    id: int
    text: str


class SimilarityResult(TypedDict):
    """Output format for similarity results."""
    complaint_id: int
    similarity_score: float


def find_similar_complaints(
    new_complaint_text: str,
    existing_complaints: list[dict],
    similarity_threshold: float = SIMILARITY_THRESHOLD
) -> list[dict]:
    """
    Find complaints similar to a new complaint using semantic similarity.
    
    Uses SBERT embeddings and cosine similarity to detect semantically
    similar complaints that rule-based matching would miss.
    
    For example:
    - "Water is leaking near my house" and "Burst pipe outside building"
      would be detected as similar despite having no common keywords.
    
    Args:
        new_complaint_text: The text of the new complaint to check
        existing_complaints: List of existing complaints, each with 'id' and 'text'
        similarity_threshold: Minimum similarity score to be considered similar
                            Default is configured in config.py (0.75)
    
    Returns:
        List of similar complaints sorted by similarity score (highest first).
        Each result contains:
        - complaint_id: ID of the similar complaint
        - similarity_score: Cosine similarity score (0-1)
    
    Example:
        >>> new = "Water leaking near my house"
        >>> existing = [
        ...     {"id": 1, "text": "Water leaking near school"},
        ...     {"id": 2, "text": "Garbage not collected"}
        ... ]
        >>> results = find_similar_complaints(new, existing)
        >>> print(results)
        [{"complaint_id": 1, "similarity_score": 0.89}]
    """
    # Handle edge cases
    if not new_complaint_text or not existing_complaints:
        return []
    
    # Filter out complaints without required fields
    valid_complaints = [
        c for c in existing_complaints
        if c.get("id") is not None and c.get("text")
    ]
    
    if not valid_complaints:
        return []
    
    # Step 1: Embed the new complaint
    new_embedding = embed_text(new_complaint_text)
    
    # Step 2: Embed all existing complaints (batch for efficiency)
    existing_texts = [c["text"] for c in valid_complaints]
    existing_embeddings = embed_texts(existing_texts)
    
    # Step 3: Compute similarities
    similarity_scores = compute_similarity_batch(new_embedding, existing_embeddings)
    
    # Step 4: Filter by threshold and build results
    results: list[dict] = []
    for idx, score in enumerate(similarity_scores):
        if score >= similarity_threshold:
            results.append({
                "complaint_id": valid_complaints[idx]["id"],
                "similarity_score": round(float(score), 4)
            })
    
    # Step 5: Sort by similarity score (highest first)
    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    return results


def check_duplicate(
    new_complaint_text: str,
    existing_complaints: list[dict],
    duplicate_threshold: float = DUPLICATE_THRESHOLD
) -> dict | None:
    """
    Check if a complaint is a potential duplicate of an existing one.
    
    Uses a higher threshold (0.90) to identify near-exact duplicates.
    
    Args:
        new_complaint_text: The text of the new complaint
        existing_complaints: List of existing complaints with 'id' and 'text'
        duplicate_threshold: Threshold for duplicate detection (default 0.90)
    
    Returns:
        The most similar complaint if above threshold, None otherwise.
        
    Example:
        >>> duplicate = check_duplicate("Water leak at main road", existing)
        >>> if duplicate:
        ...     print(f"Duplicate of #{duplicate['complaint_id']}")
    """
    results = find_similar_complaints(
        new_complaint_text,
        existing_complaints,
        similarity_threshold=duplicate_threshold
    )
    
    return results[0] if results else None
