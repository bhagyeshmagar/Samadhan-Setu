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
from sqlalchemy.orm import Session
from sqlalchemy import func

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
    
    Args:
        count: Number of complaints
        
    Returns:
        Intensity level string ("high", "medium", "low", "none")
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
    db: Session,
    category: Optional[str] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Generate heatmap data aggregated by category.
    
    Args:
        db: Database session
        category: Optional specific category filter
        days: Number of days to look back
        
    Returns:
        Dict with category-wise heatmap data
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(
        Complaint.category,
        func.count(Complaint.id).label("count")
    ).filter(
        Complaint.created_at >= cutoff_date
    )
    
    if category:
        query = query.filter(Complaint.category == category)
    
    results = query.group_by(Complaint.category).all()
    
    heatmap_data = []
    for cat, count in results:
        level = get_intensity_level(count)
        heatmap_data.append({
            "category": cat,
            "count": count,
            "intensity": level,
            "color": get_intensity_color(level)
        })
    
    # Sort by count (highest first)
    heatmap_data.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "type": "category",
        "period_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "total_complaints": sum(d["count"] for d in heatmap_data),
        "data": heatmap_data
    }


def generate_locality_heatmap(
    db: Session,
    category: Optional[str] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Generate heatmap data aggregated by ward/locality.
    
    Args:
        db: Database session
        category: Optional category filter
        days: Number of days to look back
        
    Returns:
        Dict with locality-wise heatmap data
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(
        Complaint.ward,
        func.count(Complaint.id).label("count"),
        func.avg(Complaint.latitude).label("avg_lat"),
        func.avg(Complaint.longitude).label("avg_lng")
    ).filter(
        Complaint.created_at >= cutoff_date,
        Complaint.ward.isnot(None)
    )
    
    if category:
        query = query.filter(Complaint.category == category)
    
    results = query.group_by(Complaint.ward).all()
    
    heatmap_data = []
    for ward, count, avg_lat, avg_lng in results:
        if not ward:
            continue
        level = get_intensity_level(count)
        heatmap_data.append({
            "ward": ward,
            "count": count,
            "intensity": level,
            "color": get_intensity_color(level),
            "center": {
                "latitude": float(avg_lat) if avg_lat else None,
                "longitude": float(avg_lng) if avg_lng else None
            }
        })
    
    # Sort by count (highest first)
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
    db: Session,
    days: int = 30
) -> Dict[str, Any]:
    """
    Generate a matrix heatmap: categories vs localities.
    
    Args:
        db: Database session
        days: Number of days to look back
        
    Returns:
        Dict with matrix heatmap data
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(
        Complaint.category,
        Complaint.ward,
        func.count(Complaint.id).label("count")
    ).filter(
        Complaint.created_at >= cutoff_date,
        Complaint.ward.isnot(None)
    ).group_by(
        Complaint.category,
        Complaint.ward
    ).all()
    
    # Build matrix
    matrix = defaultdict(lambda: defaultdict(int))
    categories = set()
    wards = set()
    
    for category, ward, count in query:
        if ward:
            matrix[category][ward] = count
            categories.add(category)
            wards.add(ward)
    
    # Convert to list format for API
    matrix_data = []
    for cat in sorted(categories):
        row = {"category": cat, "wards": {}}
        for ward in sorted(wards):
            count = matrix[cat][ward]
            row["wards"][ward] = {
                "count": count,
                "intensity": get_intensity_level(count),
                "color": get_intensity_color(get_intensity_level(count))
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
    db: Session,
    category: Optional[str] = None,
    days: int = 30,
    group_by: str = "day"  # "day" or "week"
) -> Dict[str, Any]:
    """
    Generate time-series trend data for complaints.
    
    Args:
        db: Database session
        category: Optional category filter
        days: Number of days to look back
        group_by: Grouping interval ("day" or "week")
        
    Returns:
        Dict with time-trend data
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    # Get all complaints in range
    query = db.query(Complaint).filter(
        Complaint.created_at >= cutoff_date
    )
    
    if category:
        query = query.filter(Complaint.category == category)
    
    complaints = query.all()
    
    # Group by time
    time_groups = defaultdict(int)
    
    for complaint in complaints:
        if group_by == "week":
            # Get ISO week
            key = complaint.created_at.strftime("%Y-W%V")
        else:
            key = complaint.created_at.strftime("%Y-%m-%d")
        
        time_groups[key] += 1
    
    # Sort by date
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
    db: Session,
    limit: int = 10,
    days: int = 30
) -> List[Dict[str, Any]]:
    """
    Get the top problem areas (ward + category combinations).
    
    Args:
        db: Database session
        limit: Number of top areas to return
        days: Number of days to look back
        
    Returns:
        List of top problem areas
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    results = db.query(
        Complaint.ward,
        Complaint.category,
        func.count(Complaint.id).label("count")
    ).filter(
        Complaint.created_at >= cutoff_date,
        Complaint.ward.isnot(None)
    ).group_by(
        Complaint.ward,
        Complaint.category
    ).order_by(
        func.count(Complaint.id).desc()
    ).limit(limit).all()
    
    return [
        {
            "ward": ward,
            "category": category,
            "count": count,
            "intensity": get_intensity_level(count),
            "color": get_intensity_color(get_intensity_level(count)),
            "rank": idx + 1
        }
        for idx, (ward, category, count) in enumerate(results)
    ]
