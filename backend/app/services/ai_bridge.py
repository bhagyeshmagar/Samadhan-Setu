"""
AI Bridge Service - Phase 1

Connects the backend to the AI services.
Single point of integration between backend and AI modules.
"""

from typing import List, Dict, Optional, Any
from collections import namedtuple

from .complaint_clustering import cluster_complaints_by_text
from ..ai import classify_complaint as fallback_classify
from ..ai.priority import get_urgency_score

# Try to import sentence-transformers for similarity detection
SBERT_AVAILABLE = False
sbert_model = None

try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    SBERT_AVAILABLE = True
    print("[AI Bridge] sentence-transformers available, loading model...")
except ImportError as e:
    print(f"[AI Bridge] sentence-transformers not available: {e}")
    np = None

ComplaintWrapper = namedtuple("ComplaintWrapper", ["id", "description", "category", "ward"])


def _get_sbert_model():
    """Lazy-load the SBERT model on first use."""
    global sbert_model
    if sbert_model is None and SBERT_AVAILABLE:
        print("[AI Bridge] Loading SBERT model (first request may take time)...")
        sbert_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
        print("[AI Bridge] SBERT model loaded!")
    return sbert_model


def _compute_similarity(new_embedding, existing_embeddings):
    """Compute cosine similarity between embeddings."""
    if not SBERT_AVAILABLE:
        return []
    new_norm = new_embedding / (np.linalg.norm(new_embedding) + 1e-9)
    existing_norms = existing_embeddings / (np.linalg.norm(existing_embeddings, axis=1, keepdims=True) + 1e-9)
    similarities = np.dot(existing_norms, new_norm)
    return similarities


class AIBridge:
    """
    Bridge service to connect the main Backend with AI services.
    Uses ML models when available, falls back to rule-based when not.
    """

    @staticmethod
    def get_similar_complaints(
        new_text: str,
        existing_complaints: List[dict],
        threshold: float = 0.70,
    ) -> List[dict]:
        """Find semantically similar complaints using SBERT embeddings."""
        if not new_text or not existing_complaints:
            return []

        if not SBERT_AVAILABLE:
            return []

        try:
            model = _get_sbert_model()
            if model is None:
                return []

            valid_complaints = [
                c for c in existing_complaints
                if c.get("id") is not None and c.get("text")
            ]

            if not valid_complaints:
                return []

            new_embedding = model.encode(new_text, convert_to_numpy=True)
            existing_texts = [c["text"] for c in valid_complaints]
            existing_embeddings = model.encode(existing_texts, convert_to_numpy=True)
            similarities = _compute_similarity(new_embedding, existing_embeddings)

            results = []
            for idx, score in enumerate(similarities):
                if score >= threshold:
                    results.append({
                        "complaint_id": valid_complaints[idx]["id"],
                        "similarity_score": round(float(score), 4),
                    })

            results.sort(key=lambda x: x["similarity_score"], reverse=True)
            return results

        except Exception as e:
            print(f"[AI Bridge] Similarity check failed: {e}")
            return []

    @staticmethod
    def classify_complaint(text: str) -> Dict[str, Any]:
        """Classify complaint using rule-based classification."""
        if not text:
            return {"category": "General", "confidence": 0}

        category, confidence = fallback_classify(text)
        return {"category": category, "confidence": confidence, "source": "rules"}

    @staticmethod
    def get_urgency_severity(text: str) -> Dict[str, Any]:
        """Detect urgency and severity levels (rule-based)."""
        if not text:
            return {"urgency": "Low", "severity": "Low"}

        score = get_urgency_score(text)

        if score >= 7:
            urgency = "High"
        elif score >= 4:
            urgency = "Medium"
        else:
            urgency = "Low"

        return {
            "urgency": urgency,
            "severity": urgency,
            "urgency_score": score,
            "source": "rules",
        }

    @staticmethod
    def get_complaint_patterns(complaints_data: List[dict]) -> List[dict]:
        """Get AI-generated insights about recurring patterns using clustering."""
        if not complaints_data or len(complaints_data) < 2:
            return []

        wrapped_complaints = [
            ComplaintWrapper(
                id=c.get("id"),
                description=c.get("text", ""),
                category=c.get("category", ""),
                ward=c.get("ward", ""),
            )
            for c in complaints_data
        ]

        clusters = cluster_complaints_by_text(wrapped_complaints)

        insights = []
        for cluster in clusters:
            if cluster["count"] < 2:
                continue
            insights.append({
                "insight_name": f"Recurring {cluster['category']} Issue",
                "category": cluster["category"],
                "support_count": cluster["count"],
                "locations": [cluster["ward"]] if cluster["ward"] else [],
                "complaint_ids": cluster["member_ids"],
                "top_keywords": [],
            })

        return insights


# Singleton instance
ai_bridge = AIBridge()
