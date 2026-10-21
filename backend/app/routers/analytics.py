"""
Analytics Router — PostgreSQL edition.
Provides complaint heatmaps, category trends, and ward-level analytics.
All queries run directly against PostgreSQL — no Firestore.
"""
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_async_session
from ..auth import get_current_user
from ..models.orm import User, Complaint, Department
from ..models.orm.enums import ComplaintStatus, ComplaintPriority

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
# Category heatmap
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/heatmap/category", response_model=CategoryHeatmapResponse)
async def category_heatmap(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
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
        "Road": "#FF6B00",
        "Water": "#1E90FF",
        "Electricity": "#FFD700",
        "Sanitation": "#228B22",
        "Public Health": "#DC143C",
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Count of open complaints by priority level."""
    res = await session.execute(
        select(Complaint.priority, func.count().label("n"))
        .where(Complaint.status.not_in([ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED, ComplaintStatus.REJECTED]))
        .group_by(Complaint.priority)
    )
    return {r.priority.value: r.n for r in res.all()}
