"""
Similarity Service for Samadhan Setu Phase 2.

High-level duplicate detection and complaint linking using SBERT embeddings.
All operations are advisory — officers must approve merges/links.
"""
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from ..ai.sbert_engine import sbert_engine

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.75
DUPLICATE_THRESHOLD = 0.90


def find_duplicates(
    complaint_id: str,
    text: str,
    db,
    threshold: float = SIMILARITY_THRESHOLD,
    max_results: int = 5,
) -> List[Dict[str, Any]]:
    """
    Find semantically similar complaints using SBERT embeddings.

    Returns list of matches with:
    - complaint_id, similarity_score, is_likely_duplicate, preview
    """
    if not sbert_engine.is_available:
        logger.info("[Similarity] SBERT unavailable, using keyword fallback")
        return _keyword_fallback(complaint_id, text, db, max_results)

    # Encode the new complaint
    new_embedding = sbert_engine.encode(text)
    if new_embedding is None:
        return []

    # Load existing embeddings
    existing_embeddings, existing_ids = sbert_engine.load_existing_embeddings(
        db, exclude_id=complaint_id, limit=200
    )

    if len(existing_ids) == 0:
        return []

    # Find similar
    matches = sbert_engine.find_similar(
        new_embedding, existing_embeddings, existing_ids,
        threshold=threshold, top_k=max_results
    )

    # Enrich with complaint data
    enriched = []
    for match in matches:
        try:
            doc = db.collection("complaints").document(match["id"]).get()
            if doc.exists:
                data = doc.to_dict()
                enriched.append({
                    "complaint_id": match["id"],
                    "similarity_score": match["similarity_score"],
                    "is_likely_duplicate": match["similarity_score"] >= DUPLICATE_THRESHOLD,
                    "preview": (data.get("description", ""))[:120],
                    "category": data.get("category", ""),
                    "status": data.get("status", ""),
                    "created_at": data.get("created_at"),
                })
        except Exception as e:
            logger.warning(f"[Similarity] Failed to enrich match {match['id']}: {e}")

    return enriched


def create_similarity_link(
    complaint_id_a: str,
    complaint_id_b: str,
    score: float,
    db,
    created_by: str = "system",
) -> str:
    """
    Create an advisory similarity link between two complaints.
    Status: pending (officer must approve/reject).
    """
    link_data = {
        "complaint_id_a": complaint_id_a,
        "complaint_id_b": complaint_id_b,
        "similarity_score": round(score, 4),
        "status": "pending",  # pending / approved / rejected
        "created_by": created_by,
        "reviewed_by": None,
        "review_notes": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    doc_ref = db.collection("similarity_links").document()
    doc_ref.set(link_data)
    logger.info(f"[Similarity] Link created: {complaint_id_a} <-> {complaint_id_b} ({score:.2f})")
    return doc_ref.id


def get_similarity_links(complaint_id: str, db) -> List[Dict[str, Any]]:
    """Get all similarity links for a complaint."""
    links = []

    # Check both directions
    for field in ["complaint_id_a", "complaint_id_b"]:
        try:
            docs = db.collection("similarity_links").where(field, "==", complaint_id).get()
            for doc in docs:
                data = doc.to_dict()
                data["id"] = doc.id
                other_id = (
                    data["complaint_id_b"]
                    if data["complaint_id_a"] == complaint_id
                    else data["complaint_id_a"]
                )
                data["linked_complaint_id"] = other_id
                links.append(data)
        except Exception as e:
            logger.warning(f"[Similarity] Failed to fetch links: {e}")

    return links


def store_embedding(complaint_id: str, text: str, db) -> bool:
    """Store embedding for a complaint (called during AI pipeline)."""
    result = sbert_engine.encode_and_store(complaint_id, text, db)
    return result is not None


def auto_link_similar(
    complaint_id: str,
    text: str,
    db,
    threshold: float = SIMILARITY_THRESHOLD,
) -> List[Dict[str, Any]]:
    """
    Find similar complaints and auto-create advisory links.
    Returns the list of created links.
    """
    duplicates = find_duplicates(complaint_id, text, db, threshold)
    created_links = []

    for dup in duplicates:
        link_id = create_similarity_link(
            complaint_id, dup["complaint_id"], dup["similarity_score"], db
        )
        created_links.append({
            "link_id": link_id,
            "linked_to": dup["complaint_id"],
            "similarity_score": dup["similarity_score"],
            "is_likely_duplicate": dup["is_likely_duplicate"],
        })

    return created_links


def _keyword_fallback(
    complaint_id: str, text: str, db, max_results: int
) -> List[Dict[str, Any]]:
    """Keyword Jaccard similarity fallback when SBERT is unavailable."""
    from ..services.complaint_clustering import get_duplicate_candidates
    from ..models.complaint import Complaint

    try:
        doc = db.collection("complaints").document(complaint_id).get()
        if not doc.exists:
            return []
        complaint = Complaint.from_firestore(doc)
        candidates = get_duplicate_candidates(db, complaint, max_results)
        # Convert to our format
        return [
            {
                "complaint_id": c["complaint_id"],
                "similarity_score": c["similarity_score"],
                "is_likely_duplicate": c["similarity_score"] >= 0.85,
                "preview": c.get("description_preview", ""),
                "category": "",
                "status": c.get("status", ""),
                "created_at": c.get("created_at"),
            }
            for c in candidates
        ]
    except Exception as e:
        logger.warning(f"[Similarity] Keyword fallback failed: {e}")
        return []
