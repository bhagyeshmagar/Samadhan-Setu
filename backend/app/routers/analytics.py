"""
Analytics Router — PostgreSQL edition.
Provides complaint heatmaps, category trends, ward-level analytics, GIS map data,
department performance metrics, and anomaly smart alerts.
All queries run directly against PostgreSQL — no Firestore.
"""
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session
from ..auth import require_officer
from ..models.orm import User, Complaint, Department, Officer
from ..models.orm.enums import ComplaintStatus, ComplaintPriority, UserRole

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


class HeatmapPoint(BaseModel):
    category: Optional[str] = None
    ward: Optional[str] = None
    count: int
    intensity: str
    color: str


class CategoryHeatmapResponse(BaseModel):
    data: List[HeatmapPoint]
    total_complaints: int
    generated_at: datetime


class TrendPoint(BaseModel):
    date: str
    count: int
    category: Optional[str] = None


class WardSummary(BaseModel):
    ward: str
    count: int
    open_count: int
    avg_priority_score: float


# ──────────────────────────────────────────────────────────────────────────────
# GIS Map Data (for Admin and Department geospatial maps)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/map-data")
async def get_map_data(
    department_id: Optional[str] = None,
    days: int = Query(90, ge=1, le=365),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Geospatial complaint markers and department list for district map."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = select(Complaint).where(
        Complaint.created_at >= since,
        Complaint.latitude.is_not(None),
        Complaint.longitude.is_not(None),
    )

    dept_filter_uuid = None
    if department_id:
        try:
            dept_filter_uuid = uuid.UUID(department_id)
            query = query.where(Complaint.department_id == dept_filter_uuid)
        except ValueError:
            pass

    # Officers without admin role can only see their department's data if assigned
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        res_off = await session.execute(select(Officer).where(Officer.user_id == current_user.id))
        off = res_off.scalar_one_or_none()
        if off and off.department_id:
            query = query.where(Complaint.department_id == off.department_id)

    res = await session.execute(query.order_by(Complaint.created_at.desc()).limit(1000))
    complaints = res.scalars().all()

    # Get departments
    dept_res = await session.execute(select(Department).order_by(Department.name))
    departments = dept_res.scalars().all()
    dept_map = {d.id: d.name for d in departments}

    formatted_complaints = [
        {
            "id": str(c.id),
            "complaint_number": c.complaint_number,
            "title": c.title,
            "description": c.description,
            "location": c.address or "",
            "latitude": c.latitude,
            "longitude": c.longitude,
            "lat": c.latitude,
            "lng": c.longitude,
            "category": c.category,
            "priority": c.priority.value if c.priority else "low",
            "status": c.status.value if c.status else "submitted",
            "ward": c.ward or "",
            "department_id": str(c.department_id) if c.department_id else None,
            "department_name": dept_map.get(c.department_id, ""),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in complaints
    ]

    dept_filter_name = dept_map.get(dept_filter_uuid) if dept_filter_uuid else None

    return {
        "complaints": formatted_complaints,
        "departments": [{"id": str(d.id), "name": d.name} for d in departments],
        "department_filter": dept_filter_name,
        "total": len(formatted_complaints),
    }


# ──────────────────────────────────────────────────────────────────────────────
# City-Level Summary
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/summary")
async def get_analytics_summary(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Overall summary statistics for the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    total = (await session.execute(
        select(func.count(Complaint.id)).where(Complaint.created_at >= since)
    )).scalar() or 0

    resolved = (await session.execute(
        select(func.count(Complaint.id)).where(
            Complaint.created_at >= since,
            Complaint.status.in_([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED]),
        )
    )).scalar() or 0

    pending = (await session.execute(
        select(func.count(Complaint.id)).where(
            Complaint.created_at >= since,
            Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED]),
        )
    )).scalar() or 0

    breached = (await session.execute(
        select(func.count(Complaint.id)).where(
            Complaint.created_at >= since,
            Complaint.sla_breached == True,
        )
    )).scalar() or 0

    # Average citizen rating
    avg_rating = (await session.execute(
        select(func.avg(Complaint.citizen_rating)).where(
            Complaint.created_at >= since,
            Complaint.citizen_rating.is_not(None),
        )
    )).scalar() or 0.0

    return {
        "total_complaints": total,
        "resolved_complaints": resolved,
        "pending_complaints": pending,
        "sla_breaches": breached,
        "resolution_rate": round((resolved / total * 100), 2) if total > 0 else 0.0,
        "average_citizen_rating": round(float(avg_rating), 2),
        "period_days": days,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Department Performance Metrics (Table & Chart)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/departments/performance")
async def get_department_performance(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Calculate performance metrics for all departments over the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    dept_res = await session.execute(select(Department).order_by(Department.name))
    departments = dept_res.scalars().all()

    # Fetch all complaints in period with relevant fields
    comp_res = await session.execute(
        select(
            Complaint.id,
            Complaint.department_id,
            Complaint.status,
            Complaint.created_at,
            Complaint.resolved_at,
            Complaint.sla_deadline,
            Complaint.sla_breached,
            Complaint.citizen_rating,
        ).where(Complaint.created_at >= since)
    )
    complaints = comp_res.all()

    metrics = {
        d.id: {
            "department_id": str(d.id),
            "department_name": d.name,
            "total_complaints": 0,
            "resolved_complaints": 0,
            "resolution_times_hours": [],
            "sla_breaches": 0,
            "ratings": [],
        }
        for d in departments
    }

    now = datetime.now(timezone.utc)

    for c in complaints:
        if not c.department_id or c.department_id not in metrics:
            continue
        m = metrics[c.department_id]
        m["total_complaints"] += 1

        is_resolved = c.status in (ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED)
        if is_resolved:
            m["resolved_complaints"] += 1
            if c.resolved_at and c.created_at:
                diff = (c.resolved_at - c.created_at).total_seconds() / 3600.0
                m["resolution_times_hours"].append(max(0.1, diff))

        if c.citizen_rating:
            m["ratings"].append(c.citizen_rating)

        # SLA breach check
        if c.sla_breached:
            m["sla_breaches"] += 1
        elif c.sla_deadline:
            if is_resolved and c.resolved_at and c.resolved_at > c.sla_deadline:
                m["sla_breaches"] += 1
            elif not is_resolved and now > c.sla_deadline:
                m["sla_breaches"] += 1

    results = []
    for m in metrics.values():
        total = m["total_complaints"]
        res_times = m["resolution_times_hours"]
        ratings = m["ratings"]
        breach_rate = round((m["sla_breaches"] / total * 100), 2) if total > 0 else 0.0
        avg_res = round(sum(res_times) / len(res_times), 1) if res_times else 0.0
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0.0

        results.append({
            "department_id": m["department_id"],
            "department_name": m["department_name"],
            "total_complaints": total,
            "resolved_complaints": m["resolved_complaints"],
            "sla_breach_rate": breach_rate,
            "avg_resolution_time_hours": avg_res,
            "avg_citizen_rating": avg_rating,
            "feedback_count": len(ratings),
        })

    return sorted(results, key=lambda x: x["total_complaints"], reverse=True)


# ──────────────────────────────────────────────────────────────────────────────
# Smart Alerts / Anomaly Detection
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/smart-alerts")
async def get_smart_alerts(
    days: int = Query(7, ge=1, le=30),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Generate predictive warnings and anomaly alerts for civic hazards."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    alerts = []

    # 1. Ward & Category Spike Detection: Find any ward + category with >= 3 complaints
    spikes_res = await session.execute(
        select(
            Complaint.ward,
            Complaint.category,
            func.count(Complaint.id).label("count"),
            func.array_agg(Complaint.complaint_number).label("complaint_numbers"),
        )
        .where(
            Complaint.created_at >= since,
            Complaint.ward.is_not(None),
            Complaint.category.is_not(None),
        )
        .group_by(Complaint.ward, Complaint.category)
        .having(func.count(Complaint.id) >= 3)
        .order_by(func.count(Complaint.id).desc())
    )
    spikes = spikes_res.all()

    for spike in spikes:
        severity = "CRITICAL" if spike.count >= 5 else "WARNING"
        alerts.append({
            "alert_id": f"spike-{spike.ward}-{spike.category}".replace(" ", "_").lower(),
            "type": "ANOMALOUS SPIKE",
            "severity": severity,
            "title": f"Concentrated {spike.category} Failure in {spike.ward}",
            "message": f"{spike.count} grievances recorded for {spike.category} in {spike.ward} over the last {days} days, exceeding the normal baseline threshold.",
            "related_complaint_ids": spike.complaint_numbers[:5] if spike.complaint_numbers else [],
        })

    # 2. SLA Risk Detection: Find departments with > 20% breach rate on active grievances
    dept_res = await session.execute(select(Department))
    departments = dept_res.scalars().all()
    now = datetime.now(timezone.utc)

    for d in departments:
        open_res = await session.execute(
            select(func.count(Complaint.id)).where(
                Complaint.department_id == d.id,
                Complaint.created_at >= since,
                Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED]),
            )
        )
        open_count = open_res.scalar() or 0

        breached_res = await session.execute(
            select(func.count(Complaint.id)).where(
                Complaint.department_id == d.id,
                Complaint.created_at >= since,
                Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED]),
                or_(
                    Complaint.sla_breached == True,
                    and_(Complaint.sla_deadline.is_not(None), Complaint.sla_deadline < now),
                )
            )
        )
        breached_count = breached_res.scalar() or 0

        if open_count >= 3 and (breached_count / open_count) >= 0.25:
            alerts.append({
                "alert_id": f"sla-risk-{d.code}",
                "type": "SLA BREACH RISK",
                "severity": "CRITICAL",
                "title": f"SLA Escalation Alert for {d.name}",
                "message": f"{breached_count} of {open_count} open grievances ({round(breached_count/open_count*100)}%) have breached or are breaching their SLA deadlines.",
                "related_complaint_ids": [],
            })

    return alerts


# ──────────────────────────────────────────────────────────────────────────────
# Category heatmap
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/heatmap/category", response_model=CategoryHeatmapResponse)
async def category_heatmap(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Category distribution of complaints for the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    res = await session.execute(
        select(Complaint.category, func.count().label("n"))
        .where(Complaint.created_at >= since)
        .group_by(Complaint.category)
        .order_by(func.count().desc())
    )
    rows = res.all()
    total = sum(r.n for r in rows)

    COLOR_MAP = {
        "Roads & Transport": "#FF6B00",
        "Water Supply": "#1E90FF",
        "Electricity": "#FFD700",
        "Sanitation & Waste": "#228B22",
        "Health & Safety": "#DC143C",
        "General": "#6B7280",
    }

    def intensity(count: int, max_count: int) -> str:
        ratio = count / max(max_count, 1)
        if ratio > 0.6:
            return "high"
        elif ratio > 0.3:
            return "medium"
        return "low"

    max_count = max((r.n for r in rows), default=1)
    data = [
        HeatmapPoint(
            category=r.category,
            count=r.n,
            intensity=intensity(r.n, max_count),
            color=COLOR_MAP.get(r.category, "#6B7280"),
        )
        for r in rows
    ]

    return CategoryHeatmapResponse(data=data, total_complaints=total, generated_at=datetime.now(timezone.utc))


# ──────────────────────────────────────────────────────────────────────────────
# Ward heatmap
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/heatmap/ward", response_model=List[WardSummary])
async def ward_heatmap(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Per-ward complaint counts and open complaint counts."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    res = await session.execute(
        select(
            Complaint.ward,
            func.count().label("total"),
            func.count().filter(Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED])).label("open"),
            func.avg(Complaint.priority_score).label("avg_priority"),
        )
        .where(Complaint.created_at >= since, Complaint.ward.is_not(None))
        .group_by(Complaint.ward)
        .order_by(func.count().desc())
    )
    rows = res.all()

    return [
        WardSummary(
            ward=r.ward,
            count=r.total,
            open_count=r.open or 0,
            avg_priority_score=round(float(r.avg_priority or 0), 2),
        )
        for r in rows
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Time trend
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/trends/daily", response_model=List[TrendPoint])
async def daily_trends(
    days: int = Query(30, ge=1, le=90),
    category: Optional[str] = None,
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Daily complaint submission count for the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            func.date(Complaint.created_at).label("day"),
            func.count().label("n"),
        )
        .where(Complaint.created_at >= since)
        .group_by(func.date(Complaint.created_at))
        .order_by(func.date(Complaint.created_at))
    )
    if category:
        query = query.where(Complaint.category.ilike(category))

    res = await session.execute(query)
    return [TrendPoint(date=str(r.day), count=r.n, category=category) for r in res.all()]


# ──────────────────────────────────────────────────────────────────────────────
# SLA breach summary
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/sla/breaches")
async def sla_breach_summary(
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Count of active SLA breaches by department."""
    res = await session.execute(
        select(
            Complaint.department_id,
            func.count().label("breached_count"),
        )
        .where(
            Complaint.sla_breached == True,
            Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED]),
        )
        .group_by(Complaint.department_id)
    )
    rows = res.all()

    # Resolve department names
    dept_res = await session.execute(select(Department))
    dept_map = {d.id: d.name for d in dept_res.scalars().all()}

    return [
        {
            "department_id": str(r.department_id) if r.department_id else None,
            "department_name": dept_map.get(r.department_id, "Unknown"),
            "breached_count": r.breached_count,
        }
        for r in rows
    ]


# ──────────────────────────────────────────────────────────────────────────────
# Priority distribution
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/priority/distribution")
async def priority_distribution(
    current_user: User = Depends(require_officer),
    session: AsyncSession = Depends(get_async_session),
):
    """Count of open complaints by priority level."""
    res = await session.execute(
        select(Complaint.priority, func.count().label("n"))
        .where(Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED]))
        .group_by(Complaint.priority)
    )
    return {r.priority.value: r.n for r in res.all()}

