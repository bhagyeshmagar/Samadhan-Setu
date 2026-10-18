"""
Analytics Router
================
API endpoints for AI-powered analytics including heatmaps and clustering.
Provides visibility into issue patterns for proactive governance.
"""
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from datetime import datetime, timedelta

from ..database import get_db
from ..auth import get_current_user
from ..models import User, UserRole, Complaint, Department
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
    sample_complaints: List[str]  # Changed to str since Firestore IDs are strings


class DepartmentPerformanceResponse(BaseModel):
    department_id: str
    department_name: str
    total_complaints: int
    resolved_complaints: int
    avg_response_time_hours: float
    avg_resolution_time_hours: float
    sla_breach_rate: float
    avg_citizen_rating: float
    feedback_count: int


class SmartAlertResponse(BaseModel):
    alert_id: str
    type: str  # e.g., "SPIKE", "ESCALATION_RISK"
    severity: str  # "HIGH", "CRITICAL"
    title: str
    message: str
    ward: Optional[str] = None
    category: Optional[str] = None
    related_complaint_ids: List[str] = []
    generated_at: str

# ========== Endpoints ==========

@router.get("/heatmap/category", response_model=CategoryHeatmapResponse)
async def get_category_heatmap(
    category: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    result = generate_category_heatmap(db, category, days)
    return CategoryHeatmapResponse(**result)


@router.get("/heatmap/locality", response_model=LocalityHeatmapResponse)
async def get_locality_heatmap(
    category: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    result = generate_locality_heatmap(db, category, days)
    return LocalityHeatmapResponse(**result)


@router.get("/departments/performance", response_model=List[DepartmentPerformanceResponse])
async def get_department_performance_metrics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    from ..services.performance_analytics import get_department_performance
    results = get_department_performance(db, days)
    return results


@router.get("/smart-alerts", response_model=List[SmartAlertResponse])
async def get_smart_alerts_api(
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """Retrieve anomaly alerts like spikes and escalation risks."""
    from ..services.smart_alerts import generate_smart_alerts
    results = generate_smart_alerts(db, days)
    return results


@router.get("/heatmap/matrix")
async def get_matrix_heatmap(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    return generate_category_by_locality_heatmap(db, days)


@router.get("/heatmap/trends")
async def get_trend_heatmap(
    category: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    group_by: str = Query("day", regex="^(day|week)$"),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    return generate_time_trend_heatmap(db, category, days, group_by)


@router.get("/top-problem-areas")
async def get_problem_areas(
    limit: int = Query(10, ge=1, le=50),
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    return get_top_problem_areas(db, limit, days)


@router.get("/clusters", response_model=ClusterResponse)
async def get_complaint_clusters(
    category: Optional[str] = None,
    ward: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    min_size: int = Query(2, ge=2, le=20),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    result = get_clustered_complaints(db, category, ward, days, min_size)
    return ClusterResponse(**result)


@router.get("/recurring-issues", response_model=List[RecurringIssueResponse])
async def get_recurring_issues(
    days: int = Query(30, ge=1, le=365),
    threshold: int = Query(3, ge=2, le=20),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    return identify_recurring_issues(db, days, threshold)


@router.get("/summary")
async def get_analytics_summary(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
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
    department_id: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    query = db.collection('complaints').where('created_at', '>=', cutoff)
    docs = query.get()
    
    all_complaints = []
    for doc in docs:
        try:
            c = Complaint.from_firestore(doc)
            if c and c.latitude is not None and c.longitude is not None:
                all_complaints.append(c)
        except Exception as e:
            # Skip malformed/legacy complaints
            continue
            
    # Filter by department
    filtered_complaints = []
    dept_name = None
    
    if current_user.role == UserRole.OFFICER:
        filtered_complaints = [c for c in all_complaints if c.department_id == current_user.department_id]
        if current_user.department_id:
            dept_doc = db.collection('departments').document(current_user.department_id).get()
            if dept_doc.exists:
                dept_name = dept_doc.to_dict().get('name')
    elif department_id:
        filtered_complaints = [c for c in all_complaints if c.department_id == department_id]
        dept_doc = db.collection('departments').document(department_id).get()
        if dept_doc.exists:
            dept_name = dept_doc.to_dict().get('name')
    else:
        filtered_complaints = all_complaints
        
    filtered_complaints.sort(key=lambda x: x.created_at, reverse=True)
    
    # Get all departments for the filter dropdown (admin only)
    departments = []
    if current_user.role == UserRole.ADMIN:
        dept_docs = db.collection('departments').get()
        departments = [{"id": d.id, "name": d.to_dict().get('name')} for d in dept_docs]
    
    return {
        "complaints": [
            {
                "id": c.id,
                "lat": c.latitude,
                "lng": c.longitude,
                "category": c.category,
                "priority": getattr(c.priority, 'value', c.priority) if c.priority else "Low",
                "status": getattr(c.status, 'value', c.status) if c.status else "Pending",
                "description": c.description[:100] + "..." if c.description and len(c.description) > 100 else (c.description or ""),
                "location": c.location,
                "created_at": c.created_at.isoformat() if hasattr(c.created_at, 'isoformat') else str(c.created_at)
            }
            for c in filtered_complaints
        ],
        "department_filter": dept_name,
        "departments": departments,
        "total": len(filtered_complaints),
        "period_days": days
    }
