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
from sqlalchemy.orm import Session

from ..models import Complaint


# Similarity threshold for clustering
SIMILARITY_THRESHOLD = 0.75  # 75% similarity to be considered same cluster


def cluster_complaints_by_text(
    complaints: List[Complaint],
    similarity_fn: Optional[callable] = None
) -> List[Dict[str, Any]]:
    """
    Cluster complaints by semantic similarity using text comparison.
    
    This is a simple rule-based fallback when SBERT is not available.
    For production, this should use the actual similarity service.
    
    Args:
        complaints: List of Complaint objects
        similarity_fn: Optional similarity function (from AI-services)
        
    Returns:
        List of clusters with complaint IDs
    """
    if not complaints:
        return []
    
    # Simple keyword-based clustering as fallback
    clusters = []
    clustered_ids = set()
    
    # Keywords for basic similarity
    keywords_cache = {}
    
    def extract_keywords(text: str) -> set:
        """Extract significant keywords from text."""
        if not text:
            return set()
        # Simple tokenization and filtering
        words = text.lower().split()
        # Filter short words and common stopwords
        stopwords = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or'}
        return {w for w in words if len(w) > 3 and w not in stopwords}
    
    def keyword_similarity(text1: str, text2: str) -> float:
        """Calculate Jaccard similarity of keywords."""
        kw1 = extract_keywords(text1)
        kw2 = extract_keywords(text2)
        if not kw1 or not kw2:
            return 0.0
        intersection = len(kw1 & kw2)
        union = len(kw1 | kw2)
        return intersection / union if union > 0 else 0.0
    
    # Use provided similarity function or fallback
    sim_fn = similarity_fn or keyword_similarity
    
    # Cluster complaints
    for complaint in complaints:
        if complaint.id in clustered_ids:
            continue
        
        # Start new cluster
        cluster = {
            "cluster_id": len(clusters) + 1,
            "representative_id": complaint.id,
            "representative_text": complaint.description[:200],
            "category": complaint.category,
            "ward": complaint.ward,
            "member_ids": [complaint.id],
            "count": 1
        }
        clustered_ids.add(complaint.id)
        
        # Find similar complaints
        for other in complaints:
            if other.id in clustered_ids:
                continue
            
            # Check category match first (optimization)
            if other.category != complaint.category:
                continue
            
            # Calculate similarity
            similarity = sim_fn(complaint.description, other.description)
            
            if similarity >= SIMILARITY_THRESHOLD:
                cluster["member_ids"].append(other.id)
                cluster["count"] += 1
                clustered_ids.add(other.id)
        
        clusters.append(cluster)
    
    # Sort by cluster size (largest first)
    clusters.sort(key=lambda x: x["count"], reverse=True)
    
    return clusters


def get_clustered_complaints(
    db: Session,
    category: Optional[str] = None,
    ward: Optional[str] = None,
    days: int = 30,
    min_cluster_size: int = 2
) -> Dict[str, Any]:
    """
    Get clustered complaints for analysis.
    
    Args:
        db: Database session
        category: Optional category filter
        ward: Optional ward filter
        days: Number of days to look back
        min_cluster_size: Minimum members for a cluster to be included
        
    Returns:
        Dict with clustering results
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(Complaint).filter(
        Complaint.created_at >= cutoff_date
    )
    
    if category:
        query = query.filter(Complaint.category == category)
    
    if ward:
        query = query.filter(Complaint.ward == ward)
    
    complaints = query.order_by(Complaint.created_at.desc()).all()
    
    # Cluster complaints
    clusters = cluster_complaints_by_text(complaints)
    
    # Filter by minimum size
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
    db: Session,
    days: int = 30,
    recurrence_threshold: int = 3
) -> List[Dict[str, Any]]:
    """
    Identify issues that keep recurring in the same area.
    
    Args:
        db: Database session
        days: Number of days to look back
        recurrence_threshold: Minimum occurrences to be considered recurring
        
    Returns:
        List of recurring issue patterns
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    complaints = db.query(Complaint).filter(
        Complaint.created_at >= cutoff_date,
        Complaint.ward.isnot(None)
    ).all()
    
    # Group by ward + category
    ward_category_groups = defaultdict(list)
    
    for complaint in complaints:
        key = (complaint.ward, complaint.category)
        ward_category_groups[key].append(complaint)
    
    # Find recurring patterns
    recurring = []
    
    for (ward, category), group_complaints in ward_category_groups.items():
        if len(group_complaints) >= recurrence_threshold:
            # Cluster within this group
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
    
    # Sort by count
    recurring.sort(key=lambda x: x["total_count"], reverse=True)
    
    return recurring


def get_duplicate_candidates(
    db: Session,
    complaint: Complaint,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Find potential duplicates of a given complaint.
    Used for real-time duplicate detection during submission.
    
    Args:
        db: Database session
        complaint: The complaint to check
        max_results: Maximum number of potential duplicates to return
        
    Returns:
        List of potential duplicate complaints
    """
    # Look for recent complaints in the same ward/category
    cutoff_date = datetime.utcnow() - timedelta(days=7)
    
    query = db.query(Complaint).filter(
        Complaint.id != complaint.id,
        Complaint.created_at >= cutoff_date,
        Complaint.category == complaint.category
    )
    
    if complaint.ward:
        query = query.filter(Complaint.ward == complaint.ward)
    
    recent_complaints = query.limit(50).all()
    
    # Calculate similarities
    def keyword_similarity(text1: str, text2: str) -> float:
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        if not words1 or not words2:
            return 0.0
        return len(words1 & words2) / len(words1 | words2)
    
    candidates = []
    for other in recent_complaints:
        similarity = keyword_similarity(complaint.description, other.description)
        if similarity >= 0.5:  # Lower threshold for candidates
            candidates.append({
                "complaint_id": other.id,
                "description_preview": other.description[:100],
                "similarity_score": round(similarity, 2),
                "created_at": other.created_at.isoformat(),
                "status": other.status.value
            })
    
    # Sort by similarity
    candidates.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    return candidates[:max_results]
