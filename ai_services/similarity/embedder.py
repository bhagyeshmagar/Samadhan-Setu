"""
Text Embedder Module

Converts text into normalized embeddings using the SBERT model.
Embeddings are normalized to unit vectors for consistent cosine similarity computation.
"""

import numpy as np
from numpy.typing import NDArray

from .model import get_sbert_model


def embed_text(text: str) -> NDArray[np.float32]:
    """
    Convert text into a normalized embedding vector.
    
    Uses the singleton SBERT model to generate embeddings.
    The embedding is L2-normalized to a unit vector, which ensures
    that cosine similarity can be computed as a simple dot product.
    
    Args:
        text: The input text to embed
        
    Returns:
        NDArray: Normalized embedding vector of shape (384,) for MiniLM model
        
    Example:
        >>> embedding = embed_text("Water is leaking near my house")
        >>> print(embedding.shape)  # (384,)
        >>> print(np.linalg.norm(embedding))  # ~1.0
    """
    model = get_sbert_model()
    
    # Generate embedding - returns numpy array of shape (384,)
    embedding = model.encode(text, convert_to_numpy=True)
    
    # Normalize to unit vector (L2 normalization)
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    return embedding.astype(np.float32)


def embed_texts(texts: list[str]) -> NDArray[np.float32]:
    """
    Convert multiple texts into normalized embedding vectors.
    
    More efficient than calling embed_text multiple times
    as it batches the encoding operation.
    
    Args:
        texts: List of input texts to embed
        
    Returns:
        NDArray: Normalized embedding matrix of shape (n_texts, 384)
        
    Example:
        >>> embeddings = embed_texts(["Hello", "World"])
        >>> print(embeddings.shape)  # (2, 384)
    """
    if not texts:
        return np.array([], dtype=np.float32)
    
    model = get_sbert_model()
    
    # Batch encode for efficiency
    embeddings = model.encode(texts, convert_to_numpy=True)
    
    # Normalize each embedding to unit vector
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    # Avoid division by zero
    norms = np.where(norms > 0, norms, 1)
    embeddings = embeddings / norms
    
    return embeddings.astype(np.float32)
