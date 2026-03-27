"""
Cosine Similarity Module

Computes cosine similarity between embedding vectors.
Uses sklearn's optimized implementation for accuracy and performance.
"""

import numpy as np
from numpy.typing import NDArray
from sklearn.metrics.pairwise import cosine_similarity


def compute_similarity(
    embedding1: NDArray[np.float32],
    embedding2: NDArray[np.float32]
) -> float:
    """
    Compute cosine similarity between two embedding vectors.
    
    Cosine similarity measures the angle between two vectors,
    returning a value between -1 and 1 (or 0 to 1 for positive embeddings).
    A score of 1 means identical direction, 0 means orthogonal.
    
    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector
        
    Returns:
        float: Cosine similarity score between 0 and 1
        
    Example:
        >>> score = compute_similarity(embed1, embed2)
        >>> print(f"Similarity: {score:.2f}")  # e.g., "Similarity: 0.82"
    """
    # Reshape to 2D arrays as required by sklearn
    vec1 = embedding1.reshape(1, -1)
    vec2 = embedding2.reshape(1, -1)
    
    # Compute cosine similarity - returns 2D array [[score]]
    similarity_matrix = cosine_similarity(vec1, vec2)
    
    # Extract scalar value and ensure it's in [0, 1] range
    score = float(similarity_matrix[0, 0])
    
    # Clamp to [0, 1] to handle floating point edge cases
    return max(0.0, min(1.0, score))


def compute_similarity_batch(
    query_embedding: NDArray[np.float32],
    candidate_embeddings: NDArray[np.float32]
) -> NDArray[np.float32]:
    """
    Compute cosine similarity between a query and multiple candidates.
    
    More efficient than computing similarities one-by-one.
    
    Args:
        query_embedding: Single query embedding vector of shape (dim,)
        candidate_embeddings: Matrix of candidate embeddings of shape (n, dim)
        
    Returns:
        NDArray: Array of similarity scores of shape (n,)
        
    Example:
        >>> query = embed_text("Water leak")
        >>> candidates = embed_texts(["Pipe burst", "Garbage issue"])
        >>> scores = compute_similarity_batch(query, candidates)
        >>> print(scores)  # [0.82, 0.15]
    """
    if len(candidate_embeddings) == 0:
        return np.array([], dtype=np.float32)
    
    # Reshape query to 2D
    query = query_embedding.reshape(1, -1)
    
    # Compute similarities - returns shape (1, n)
    similarities = cosine_similarity(query, candidate_embeddings)
    
    # Flatten to 1D and clamp to [0, 1]
    scores = similarities.flatten()
    scores = np.clip(scores, 0.0, 1.0)
    
    return scores.astype(np.float32)
