"""
Complaint Clustering Service
============================
Groups semantically similar complaints using the SBERT similarity engine or keyword Jaccard fallback.
This helps identify:
- Duplicate or near-duplicate complaints
- Recurring issues in specific areas
- Patterns that might indicate systemic problems
"""
from typing import List, Dict, Any, Optional

from ..models import Complaint

# Similarity threshold for clustering
SIMILARITY_THRESHOLD = 0.75  # 75% similarity to be considered same cluster


def cluster_complaints_by_text(
    complaints: List[Complaint],
    similarity_fn: Optional[callable] = None
) -> List[Dict[str, Any]]:
    """
    Cluster complaints by semantic similarity using text comparison.
    """
    if not complaints:
        return []
    
    clusters = []
    clustered_ids = set()
    
    def extract_keywords(text: str) -> set:
        if not text:
            return set()
        words = text.lower().split()
        stopwords = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or'}
        return {w for w in words if len(w) > 3 and w not in stopwords}
    
    def keyword_similarity(text1: str, text2: str) -> float:
        kw1 = extract_keywords(text1)
        kw2 = extract_keywords(text2)
        if not kw1 or not kw2:
            return 0.0
        intersection = len(kw1 & kw2)
        union = len(kw1 | kw2)
        return intersection / union if union > 0 else 0.0
    
    sim_fn = similarity_fn or keyword_similarity
    
    # Try using SBERT first if available
    from ..ai.sbert_engine import sbert_engine
    sbert_available = sbert_engine.is_available
    embs = None
    if sbert_available and not similarity_fn:
        texts = [c.description or "" for c in complaints]
        embs = sbert_engine.batch_encode(texts)
    
    for i, complaint in enumerate(complaints):
        if complaint.id in clustered_ids:
            continue
        
        cluster = {
            "cluster_id": len(clusters) + 1,
            "representative_id": complaint.id,
            "representative_text": complaint.description[:200] if complaint.description else "",
            "category": complaint.category,
            "ward": complaint.ward,
            "member_ids": [complaint.id],
            "count": 1
        }
        clustered_ids.add(complaint.id)
        
        for j, other in enumerate(complaints):
            if other.id in clustered_ids:
                continue
            
            if other.category != complaint.category:
                continue
            
            # Use SBERT similarity if embeddings exist, else fallback
            if embs is not None and i < len(embs) and j < len(embs):
                similarity = sbert_engine.cosine_similarity(embs[i], embs[j])
            else:
                similarity = sim_fn(complaint.description or "", other.description or "")
            
            if similarity >= SIMILARITY_THRESHOLD:
                cluster["member_ids"].append(other.id)
                cluster["count"] += 1
                clustered_ids.add(other.id)
        
        clusters.append(cluster)
    
    clusters.sort(key=lambda x: x["count"], reverse=True)
    return clusters
