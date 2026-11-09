"""
notifications.py – In-app notification centre.

Endpoints
---------
GET  /api/notifications            – paginated unread + read list (newest first)
GET  /api/notifications/count      – unread count (lightweight, used for bell badge)
POST /api/notifications/{id}/read  – mark a single notification as read
POST /api/notifications/read-all   – mark every notification of this user as read
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session as get_db
from app.auth import get_current_user
from app.models.orm.user import User
from app.models.orm.audit import Notification

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


# ── helpers ─────────────────────────────────────────────────────────────────

def _serialize(n: Notification) -> dict:
    return {
        "id":           str(n.id),
        "complaint_id": str(n.complaint_id) if n.complaint_id else None,
        "type":         n.type.value if hasattr(n.type, "value") else str(n.type),
        "title":        n.title,
        "body":         n.body,
        "is_read":      n.is_read,
        "read_at":      n.read_at.isoformat() if n.read_at else None,
        "created_at":   n.created_at.isoformat(),
    }


# ── routes ───────────────────────────────────────────────────────────────────

@router.get("", summary="List notifications for the current user")
async def list_notifications(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    per_page: int = Query(20, ge=1, le=100, description="Results per page"),
    unread_only: bool = Query(False, description="Return only unread notifications"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return notifications for the authenticated user, newest first."""
    q = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
    )
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712

    # Count total (for pagination metadata)
    count_q = select(func.count()).select_from(q.subquery())
    total: int = (await db.execute(count_q)).scalar_one()

    # Apply pagination
    offset = (page - 1) * per_page
    rows = (await db.execute(q.offset(offset).limit(per_page))).scalars().all()

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    max(1, (total + per_page - 1) // per_page),
        "items":    [_serialize(n) for n in rows],
    }


@router.get("/count", summary="Unread notification count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight endpoint used for the navbar bell badge."""
    q = (
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    count: int = (await db.execute(q)).scalar_one()
    return {"unread_count": count}


@router.post("/{notification_id}/read", summary="Mark a notification as read")
async def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read. Returns 404 if not found or not owned by user."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        db.add(notif)
        await db.commit()
        await db.refresh(notif)

    return {"ok": True, "notification": _serialize(notif)}


@router.post("/read-all", summary="Mark all notifications as read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-mark all unread notifications as read for the current user."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True, read_at=now)
    )
    await db.commit()
    updated = result.rowcount
    return {"ok": True, "marked_read": updated}
