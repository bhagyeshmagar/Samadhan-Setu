"""
Analytics Router
================
API endpoints for AI-powered analytics including heatmaps and clustering.
Provides visibility into issue patterns for proactive governance.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..auth import get_current_user
from ..models import User, UserRole
from ..services.heatmap_generator import (
    generate_category_heatmap,
    generate_locality_heatmap,
    generate_category_by_locality_heatmap,
    generate_time_trend_heatmap,
    get_top_problem_areas
)
from ..services.complaint_clustering import (
    get_clustered_complaints,
    identify_recurring_issues
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# ========== Pydantic Schemas ==========

class HeatmapDataPoint(BaseModel):
    category: Optional[str] = None
    ward: Optional[str] = None
    count: int
    intensity: str
    color: str


class CategoryHeatmapResponse(BaseModel):
    type: str
    period_days: int
    generated_at: str
    total_complaints: int
    data: List[dict]


class LocalityHeatmapResponse(BaseModel):
    type: str
    period_days: int
    generated_at: str
    category_filter: Optional[str] = None
    total_locations: int
    data: List[dict]


class ClusterResponse(BaseModel):
    period_days: int
    category_filter: Optional[str] = None
    ward_filter: Optional[str] = None
    total_complaints: int
    total_clusters: int
    significant_clusters: int
    clusters: List[dict]
    generated_at: str


class RecurringIssueResponse(BaseModel):
    ward: str
    category: str
    total_count: int
    unique_issues: int
    recurring_patterns: int
    severity: str
    sample_complaints: List[int]


# ========== Endpoints ==========

@router.get("/heatmap/category", response_model=CategoryHeatmapResponse)
async def get_category_heatmap(
    category: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get heatmap data aggregated by complaint category.
    Shows which categories have the most issues.
    """
    result = generate_category_heatmap(db, category, days)
    return CategoryHeatmapResponse(**result)


@router.get("/heatmap/locality", response_model=LocalityHeatmapResponse)
async def get_locality_heatmap(
    category: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get heatmap data aggregated by ward/locality.
    Shows which areas have the most issues (optionally filtered by category).
    """
    result = generate_locality_heatmap(db, category, days)
    return LocalityHeatmapResponse(**result)


@router.get("/heatmap/matrix")
async def get_matrix_heatmap(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get matrix heatmap: categories vs localities.
    Useful for identifying which categories are problematic in which areas.
    """
    return generate_category_by_locality_heatmap(db, days)


@router.get("/heatmap/trends")
async def get_trend_heatmap(
    category: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    group_by: str = Query("day", regex="^(day|week)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get time-series trend data for complaints.
    Shows how issue volumes change over time.
    """
    return generate_time_trend_heatmap(db, category, days, group_by)


@router.get("/top-problem-areas")
async def get_problem_areas(
    limit: int = Query(10, ge=1, le=50),
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the top problem areas (ward + category combinations).
    Useful for prioritizing resource allocation.
    """
    return get_top_problem_areas(db, limit, days)


@router.get("/clusters", response_model=ClusterResponse)
async def get_complaint_clusters(
    category: Optional[str] = None,
    ward: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    min_size: int = Query(2, ge=2, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get clustered complaints grouped by semantic similarity.
    Helps identify duplicate or related complaints.
    """
    result = get_clustered_complaints(db, category, ward, days, min_size)
    return ClusterResponse(**result)


@router.get("/recurring-issues", response_model=List[RecurringIssueResponse])
async def get_recurring_issues(
    days: int = Query(30, ge=1, le=365),
    threshold: int = Query(3, ge=2, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Identify recurring issues in specific areas.
    Useful for detecting systemic problems that need policy intervention.
    """
    return identify_recurring_issues(db, days, threshold)


@router.get("/summary")
async def get_analytics_summary(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a combined analytics summary for dashboard display.
    """
    category_heatmap = generate_category_heatmap(db, None, days)
    locality_heatmap = generate_locality_heatmap(db, None, days)
    top_areas = get_top_problem_areas(db, 5, days)
    recurring = identify_recurring_issues(db, days, 3)
    
    return {
        "period_days": days,
        "total_complaints": category_heatmap["total_complaints"],
        "top_categories": category_heatmap["data"][:5],
        "top_localities": locality_heatmap["data"][:5],
        "top_problem_areas": top_areas,
        "recurring_issues_count": len(recurring),
        "high_severity_areas": [r for r in recurring if r["severity"] == "high"][:5]
    }


@router.get("/map-data")
async def get_map_data(
    department_id: Optional[int] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get complaint data with coordinates for map visualization.
    - Officers: automatically filtered to their department
    - Admin: can filter by department or see all
    """
    from datetime import datetime, timedelta
    from ..models import Complaint, Department
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    query = db.query(Complaint).filter(
        Complaint.created_at >= cutoff,
        Complaint.latitude.isnot(None),
        Complaint.longitude.isnot(None)
    )
    
    # Filter by department
    dept_name = None
    if current_user.role == UserRole.OFFICER:
        # Officers see only their department
        query = query.filter(Complaint.department_id == current_user.department_id)
        dept = db.query(Department).filter(Department.id == current_user.department_id).first()
        dept_name = dept.name if dept else None
    elif department_id:
        # Admin filtering by specific department
        query = query.filter(Complaint.department_id == department_id)
        dept = db.query(Department).filter(Department.id == department_id).first()
        dept_name = dept.name if dept else None
    
    complaints = query.order_by(Complaint.created_at.desc()).all()
    
    # Get all departments for the filter dropdown (admin only)
    departments = []
    if current_user.role == UserRole.ADMIN:
        depts = db.query(Department).all()
        departments = [{"id": d.id, "name": d.name} for d in depts]
    
    return {
        "complaints": [
            {
                "id": c.id,
                "lat": c.latitude,
                "lng": c.longitude,
                "category": c.category,
                "priority": c.priority.value if c.priority else "Low",
                "status": c.status.value if c.status else "Pending",
                "description": c.description[:100] + "..." if len(c.description) > 100 else c.description,
                "location": c.location,
                "created_at": c.created_at.isoformat()
            }
            for c in complaints
        ],
        "department_filter": dept_name,
        "departments": departments,
        "total": len(complaints),
        "period_days": days
    }
