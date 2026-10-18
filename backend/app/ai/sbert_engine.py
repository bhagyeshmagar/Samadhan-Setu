"""
SBERT Embedding Engine for Samadhan Setu Phase 2.

Manages sentence embeddings using all-MiniLM-L6-v2 for:
- Semantic similarity computation
- Duplicate complaint detection
- Complaint clustering

Lazy-loads model on first use. Falls back gracefully when unavailable.
"""
import os
import logging
import hashlib
import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("SBERT_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output dimension

# Lazy-loaded model
_model = None
_MODEL_AVAILABLE = None

# Local cache directory
CACHE_DIR = Path(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))) / "embeddings_cache"
CACHE_DIR.mkdir(exist_ok=True)


def _load_model():
    """Lazy-load the SBERT model."""
    global _model, _MODEL_AVAILABLE

    if _MODEL_AVAILABLE is False:
        return None

    if _model is not None:
        return _model

    try:
        from sentence_transformers import SentenceTransformer
        logger.info(f"[SBERT] Loading model: {MODEL_NAME}")
        _model = SentenceTransformer(MODEL_NAME)
        _MODEL_AVAILABLE = True
        logger.info("[SBERT] Model loaded successfully")
        return _model
    except Exception as e:
        logger.warning(f"[SBERT] Failed to load model: {e}")
        _MODEL_AVAILABLE = False
        return None


class SBERTEngine:
    """
    SBERT embedding engine for semantic similarity operations.
    """

    def __init__(self):
        self._embedding_cache: Dict[str, np.ndarray] = {}

    @property
    def is_available(self) -> bool:
        return _load_model() is not None

    def encode(self, text: str) -> Optional[np.ndarray]:
        """Encode a single text into an embedding vector."""
        if not text:
            return None

        # Check in-memory cache
        cache_key = self._cache_key(text)
        if cache_key in self._embedding_cache:
            return self._embedding_cache[cache_key]

        # Check disk cache
        disk_emb = self._load_from_disk(cache_key)
        if disk_emb is not None:
            self._embedding_cache[cache_key] = disk_emb
            return disk_emb

        model = _load_model()
        if model is None:
            return None

        try:
            embedding = model.encode(text, convert_to_numpy=True)
            self._embedding_cache[cache_key] = embedding
            self._save_to_disk(cache_key, embedding)
            return embedding
        except Exception as e:
            logger.warning(f"[SBERT] Encoding failed: {e}")
            return None

    def batch_encode(self, texts: List[str]) -> Optional[np.ndarray]:
        """Encode multiple texts into embedding matrix."""
        if not texts:
            return None

        model = _load_model()
        if model is None:
            return None

        try:
            batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
            embeddings = model.encode(texts, convert_to_numpy=True, batch_size=batch_size)
            return embeddings
        except Exception as e:
            logger.warning(f"[SBERT] Batch encoding failed: {e}")
            return None

    def cosine_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings."""
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)
        if norm1 < 1e-9 or norm2 < 1e-9:
            return 0.0
        return float(np.dot(emb1, emb2) / (norm1 * norm2))

    def find_similar(
        self,
        new_embedding: np.ndarray,
        existing_embeddings: np.ndarray,
        existing_ids: List[str],
        threshold: float = 0.75,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Find similar items by cosine similarity.

        Returns sorted list of matches above threshold with:
        - id, similarity_score, rank
        """
        if new_embedding is None or existing_embeddings is None or len(existing_embeddings) == 0:
            return []

        # Normalize
        new_norm = new_embedding / (np.linalg.norm(new_embedding) + 1e-9)
        norms = np.linalg.norm(existing_embeddings, axis=1, keepdims=True) + 1e-9
        existing_norms = existing_embeddings / norms
        similarities = np.dot(existing_norms, new_norm)

        matches = []
        for idx, score in enumerate(similarities):
            if score >= threshold and idx < len(existing_ids):
                matches.append({
                    "id": existing_ids[idx],
                    "similarity_score": round(float(score), 4),
                })

        matches.sort(key=lambda x: x["similarity_score"], reverse=True)
        return matches[:top_k]

    def encode_and_store(self, complaint_id: str, text: str, db) -> Optional[np.ndarray]:
        """
        Encode text and store embedding reference in Firestore.
        The actual vector is stored on disk; Firestore holds metadata.
        """
        embedding = self.encode(text)
        if embedding is None:
            return None

        cache_key = self._cache_key(text)

        try:
            db.collection("complaint_embeddings").document(complaint_id).set({
                "complaint_id": complaint_id,
                "cache_key": cache_key,
                "model_name": MODEL_NAME,
                "embedding_dim": EMBEDDING_DIM,
                "created_at": __import__("datetime").datetime.utcnow(),
            })
        except Exception as e:
            logger.warning(f"[SBERT] Failed to store embedding metadata: {e}")

        return embedding

    def load_existing_embeddings(self, db, exclude_id: str = None, limit: int = 200) -> Tuple[np.ndarray, List[str]]:
        """
        Load existing embeddings from cache for similarity comparison.
        Returns (embeddings_matrix, complaint_ids).
        """
        try:
            docs = db.collection("complaint_embeddings").limit(limit).get()
        except Exception:
            return np.array([]), []

        ids = []
        embeddings = []

        for doc in docs:
            data = doc.to_dict()
            cid = data.get("complaint_id")
            cache_key = data.get("cache_key")

            if cid == exclude_id or not cache_key:
                continue

            emb = self._load_from_disk(cache_key)
            if emb is not None:
                ids.append(cid)
                embeddings.append(emb)

        if not embeddings:
            return np.array([]), []

        return np.array(embeddings), ids

    @staticmethod
    def _cache_key(text: str) -> str:
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def _save_to_disk(self, cache_key: str, embedding: np.ndarray):
        try:
            path = CACHE_DIR / f"{cache_key}.npy"
            np.save(str(path), embedding)
        except Exception as e:
            logger.warning(f"[SBERT] Disk save failed: {e}")

    def _load_from_disk(self, cache_key: str) -> Optional[np.ndarray]:
        try:
            path = CACHE_DIR / f"{cache_key}.npy"
            if path.exists():
                return np.load(str(path))
        except Exception:
            pass
        return None


# Singleton
sbert_engine = SBERTEngine()
