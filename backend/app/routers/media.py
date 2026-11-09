"""
media.py — Secure Media Access Router for Samadhan Setu.

Provides authenticated and authorization-checked access to evidence and proof photos.
Prevents unauthenticated enumeration or scraping of private grievance photos.
Enforces:
1. Complaint-level visibility rules via get_visible_complaint.
2. X-Content-Type-Options: nosniff header to prevent MIME sniffing attacks.
3. Secure local file streaming or short-lived (5 min) S3 presigned URL redirection.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_optional
from app.db.session import get_async_session
from app.models.orm.complaint import ComplaintMedia
from app.models.orm.user import User
from app.services.complaint_access import get_visible_complaint
from app.services.storage import storage

router = APIRouter(prefix="/api/media", tags=["Media"])


@router.get("/{media_ref:path}")
async def get_media(
    media_ref: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Retrieve complaint media file securely with role-based and ownership authorization.
    Accepts media UUID or relative s3_key.
    """
    clean_ref = media_ref.lstrip("/")
    if clean_ref.startswith("uploads/"):
        clean_ref = clean_ref[len("uploads/"):]

    # Try UUID lookup first
    media: Optional[ComplaintMedia] = None
    try:
        media_uuid = uuid.UUID(clean_ref)
        res = await session.execute(
            select(ComplaintMedia).where(ComplaintMedia.id == media_uuid)
        )
        media = res.scalar_one_or_none()
    except (ValueError, AttributeError):
        pass

    # Fallback to lookup by s3_key
    if not media:
        res = await session.execute(
            select(ComplaintMedia).where(
                (ComplaintMedia.s3_key == clean_ref) | (ComplaintMedia.s3_key.endswith(clean_ref))
            )
        )
        media = res.scalars().first()

    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found",
        )

    # Enforce authorization chokepoint: raises 404 if user cannot view this complaint
    complaint = await get_visible_complaint(
        complaint_id=media.complaint_id,
        user=current_user,
        session=session,
        allow_public=True,
    )

    # In S3 mode: redirect to short-lived 5-minute presigned GET URL
    if storage.backend == "s3":
        presigned_url = await storage.get_file_url(media.s3_key, expires_in=300)
        return RedirectResponse(
            url=presigned_url,
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            headers={"X-Content-Type-Options": "nosniff"},
        )

    # In local mode: stream file with safe path check
    file_path = storage.get_file_path(media.s3_key)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found on disk",
        )

    cache_control = "public, max-age=3600" if complaint.is_public else "private, no-cache"

    return FileResponse(
        path=file_path,
        media_type=media.mime_type or "image/jpeg",
        filename=media.file_name,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": cache_control,
        },
    )
