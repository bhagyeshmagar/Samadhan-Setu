"""
Complaint Clustering Service
============================
Groups semantically similar complaints using the existing SBERT similarity engine.
This helps identify:
- Duplicate or near-duplicate complaints
- Recurring issues in specific areas
- Patterns that might indicate systemic problems

This module leverages the existing AI-services/similarity infrastructure.
"""
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
from google.cloud.firestore import Query as FirestoreQuery

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
    
    for complaint in complaints:
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
        
        for other in complaints:
            if other.id in clustered_ids:
                continue
            
            if other.category != complaint.category:
                continue
            
            similarity = sim_fn(complaint.description or "", other.description or "")
            
            if similarity >= SIMILARITY_THRESHOLD:
                cluster["member_ids"].append(other.id)
                cluster["count"] += 1
                clustered_ids.add(other.id)
        
        clusters.append(cluster)
    
    clusters.sort(key=lambda x: x["count"], reverse=True)
    
    return clusters


def get_clustered_complaints(
    db: Any,
    category: Optional[str] = None,
    ward: Optional[str] = None,
    days: int = 30,
    min_cluster_size: int = 2
) -> Dict[str, Any]:
    """
    Get clustered complaints for analysis.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.collection('complaints').where('created_at', '>=', cutoff_date)
    if category:
        query = query.where('category', '==', category)
    if ward:
        query = query.where('ward', '==', ward)
        
    docs = query.get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]
    complaints.sort(key=lambda x: x.created_at, reverse=True)
    
    clusters = cluster_complaints_by_text(complaints)
    
    significant_clusters = [c for c in clusters if c["count"] >= min_cluster_size]
    
    return {
        "period_days": days,
        "category_filter": category,
        "ward_filter": ward,
        "total_complaints": len(complaints),
        "total_clusters": len(clusters),
        "significant_clusters": len(significant_clusters),
        "clusters": significant_clusters,
        "generated_at": datetime.utcnow().isoformat()
    }


def identify_recurring_issues(
    db: Any,
    days: int = 30,
    recurrence_threshold: int = 3
) -> List[Dict[str, Any]]:
    """
    Identify issues that keep recurring in the same area.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    docs = db.collection('complaints').where('created_at', '>=', cutoff_date).get()
    complaints = []
    for doc in docs:
        c = Complaint.from_firestore(doc)
        if c.ward is not None:
            complaints.append(c)
            
    ward_category_groups = defaultdict(list)
    
    for complaint in complaints:
        key = (complaint.ward, complaint.category)
        ward_category_groups[key].append(complaint)
    
    recurring = []
    
    for (ward, category), group_complaints in ward_category_groups.items():
        if len(group_complaints) >= recurrence_threshold:
            clusters = cluster_complaints_by_text(group_complaints)
            significant = [c for c in clusters if c["count"] >= 2]
            
            recurring.append({
                "ward": ward,
                "category": category,
                "total_count": len(group_complaints),
                "unique_issues": len(clusters),
                "recurring_patterns": len(significant),
                "severity": "high" if len(group_complaints) >= 10 else "medium" if len(group_complaints) >= 5 else "low",
                "sample_complaints": [c.id for c in group_complaints[:5]]
            })
    
    recurring.sort(key=lambda x: x["total_count"], reverse=True)
    
    return recurring


def get_duplicate_candidates(
    db: Any,
    complaint: Complaint,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Find potential duplicates of a given complaint.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=7)
    
    query = db.collection('complaints').where('category', '==', complaint.category).where('created_at', '>=', cutoff_date)
    if complaint.ward:
        query = query.where('ward', '==', complaint.ward)
        
    docs = query.get()
    
    recent_complaints = []
    for doc in docs:
        c = Complaint.from_firestore(doc)
        if c.id != complaint.id:
            recent_complaints.append(c)
            
    recent_complaints.sort(key=lambda x: x.created_at, reverse=True)
    recent_complaints = recent_complaints[:50]
    
    def keyword_similarity(text1: str, text2: str) -> float:
        words1 = set((text1 or "").lower().split())
        words2 = set((text2 or "").lower().split())
        if not words1 or not words2:
            return 0.0
        return len(words1 & words2) / len(words1 | words2)
    
    candidates = []
    for other in recent_complaints:
        similarity = keyword_similarity(complaint.description, other.description)
        if similarity >= 0.5:
            candidates.append({
                "complaint_id": other.id,
                "description_preview": (other.description or "")[:100],
                "similarity_score": round(similarity, 2),
                "created_at": other.created_at.isoformat() if other.created_at else None,
                "status": other.status.value if other.status else None
            })
            
    candidates.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    return candidates[:max_results]
