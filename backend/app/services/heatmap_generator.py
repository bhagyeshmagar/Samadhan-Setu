"""
AI Heatmap Generator Service
============================
Generates heatmap data for civic issues by category and locality.
Uses existing similarity detection to cluster related complaints.

This module is the AI brain for Feature 2: Issue Heatmaps.
"""
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict

from ..models import Complaint, ComplaintStatus


# Intensity thresholds for heatmap coloring
INTENSITY_THRESHOLDS = {
    "high": 10,      # 10+ complaints = Red
    "medium": 5,     # 5-9 complaints = Orange
    "low": 1         # 1-4 complaints = Yellow
}


def get_intensity_level(count: int) -> str:
    """
    Determine the intensity level based on complaint count.
    """
    if count >= INTENSITY_THRESHOLDS["high"]:
        return "high"
    elif count >= INTENSITY_THRESHOLDS["medium"]:
        return "medium"
    elif count >= INTENSITY_THRESHOLDS["low"]:
        return "low"
    return "none"


def get_intensity_color(level: str) -> str:
    """Get the color code for an intensity level."""
    colors = {
        "high": "#ef4444",    # Red
        "medium": "#f97316",  # Orange
        "low": "#eab308",     # Yellow
        "none": "#22c55e"     # Green (no issues)
    }
    return colors.get(level, "#gray")


def generate_category_heatmap(
    db: Any,
    category: Optional[str] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Generate heatmap data aggregated by category.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.collection('complaints').where('created_at', '>=', cutoff_date)
    if category:
        query = query.where('category', '==', category)
        
    docs = query.get()
    
    counts = defaultdict(int)
    for doc in docs:
        cat = doc.to_dict().get('category')
        if cat:
            counts[cat] += 1
            
    heatmap_data = []
    for cat, count in counts.items():
        level = get_intensity_level(count)
        heatmap_data.append({
            "category": cat,
            "count": count,
            "intensity": level,
            "color": get_intensity_color(level)
        })
    
    heatmap_data.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "type": "category",
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "total_complaints": sum(d["count"] for d in heatmap_data),
        "data": heatmap_data
    }


def generate_locality_heatmap(
    db: Any,
    category: Optional[str] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Generate heatmap data aggregated by ward/locality.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.collection('complaints').where('created_at', '>=', cutoff_date)
    if category:
        query = query.where('category', '==', category)
        
    docs = query.get()
    
    ward_stats = defaultdict(lambda: {"count": 0, "lat_sum": 0.0, "lng_sum": 0.0, "lat_count": 0, "lng_count": 0})
    
    for doc in docs:
        data = doc.to_dict()
        ward = data.get('ward')
        if not ward:
            continue
            
        stats = ward_stats[ward]
        stats["count"] += 1
        
        lat = data.get('latitude')
        if lat is not None:
            stats["lat_sum"] += lat
            stats["lat_count"] += 1
            
        lng = data.get('longitude')
        if lng is not None:
            stats["lng_sum"] += lng
            stats["lng_count"] += 1
            
    heatmap_data = []
    for ward, stats in ward_stats.items():
        count = stats["count"]
        level = get_intensity_level(count)
        
        avg_lat = stats["lat_sum"] / stats["lat_count"] if stats["lat_count"] > 0 else None
        avg_lng = stats["lng_sum"] / stats["lng_count"] if stats["lng_count"] > 0 else None
        
        heatmap_data.append({
            "ward": ward,
            "count": count,
            "intensity": level,
            "color": get_intensity_color(level),
            "center": {
                "latitude": float(avg_lat) if avg_lat is not None else None,
                "longitude": float(avg_lng) if avg_lng is not None else None
            }
        })
    
    heatmap_data.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "type": "locality",
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "category_filter": category,
        "total_locations": len(heatmap_data),
        "data": heatmap_data
    }


def generate_category_by_locality_heatmap(
    db: Any,
    days: int = 30
) -> Dict[str, Any]:
    """
    Generate a matrix heatmap: categories vs localities.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    docs = db.collection('complaints').where('created_at', '>=', cutoff_date).get()
    
    matrix = defaultdict(lambda: defaultdict(int))
    categories = set()
    wards = set()
    
    for doc in docs:
        data = doc.to_dict()
        category = data.get('category')
        ward = data.get('ward')
        
        if category and ward:
            matrix[category][ward] += 1
            categories.add(category)
            wards.add(ward)
            
    matrix_data = []
    for cat in sorted(categories):
        row = {"category": cat, "wards": {}}
        for ward in sorted(wards):
            count = matrix[cat][ward]
            level = get_intensity_level(count)
            row["wards"][ward] = {
                "count": count,
                "intensity": level,
                "color": get_intensity_color(level)
            }
        matrix_data.append(row)
        
    return {
        "type": "matrix",
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "categories": sorted(categories),
        "wards": sorted(wards),
        "data": matrix_data
    }


def generate_time_trend_heatmap(
    db: Any,
    category: Optional[str] = None,
    days: int = 30,
    group_by: str = "day"  # "day" or "week"
) -> Dict[str, Any]:
    """
    Generate time-series trend data for complaints.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.collection('complaints').where('created_at', '>=', cutoff_date)
    if category:
        query = query.where('category', '==', category)
        
    docs = query.get()
    
    time_groups = defaultdict(int)
    
    for doc in docs:
        complaint = Complaint.from_firestore(doc)
        if not complaint.created_at: continue
        
        if group_by == "week":
            key = complaint.created_at.strftime("%Y-W%V")
        else:
            key = complaint.created_at.strftime("%Y-%m-%d")
            
        time_groups[key] += 1
        
    sorted_keys = sorted(time_groups.keys())
    trend_data = [
        {
            "period": key,
            "count": time_groups[key],
            "intensity": get_intensity_level(time_groups[key]),
            "color": get_intensity_color(get_intensity_level(time_groups[key]))
        }
        for key in sorted_keys
    ]
    
    return {
        "type": "time_trend",
        "period_days": days,
        "group_by": group_by,
        "generated_at": datetime.utcnow().isoformat(),
        "category_filter": category,
        "data": trend_data
    }


def get_top_problem_areas(
    db: Any,
    limit: int = 10,
    days: int = 30
) -> List[Dict[str, Any]]:
    """
    Get the top problem areas (ward + category combinations).
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    docs = db.collection('complaints').where('created_at', '>=', cutoff_date).get()
    
    counts = defaultdict(int)
    for doc in docs:
        data = doc.to_dict()
        ward = data.get('ward')
        category = data.get('category')
        
        if ward and category:
            key = (ward, category)
            counts[key] += 1
            
    results = [
        (ward, category, count)
        for (ward, category), count in counts.items()
    ]
    
    results.sort(key=lambda x: x[2], reverse=True)
    top_results = results[:limit]
    
    return [
        {
            "ward": ward,
            "category": category,
            "count": count,
            "intensity": get_intensity_level(count),
            "color": get_intensity_color(get_intensity_level(count)),
            "rank": idx + 1
        }
        for idx, (ward, category, count) in enumerate(top_results)
    ]
