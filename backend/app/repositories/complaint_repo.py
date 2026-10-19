import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple
from sqlalchemy import select, update, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.orm import (
    Complaint,
    ComplaintStatus,
    ComplaintPriority,
    ComplaintMedia,
    ComplaintTimeline,
    ComplaintVote,
    CitizenFeedback,
    VoteType,
    MediaType,
    User,
    Department,
    Officer,
)

class ComplaintRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def generate_complaint_number(self) -> str:
        """Generate unique complaint number e.g. SS-2026-001234."""
        year = datetime.now(timezone.utc).year
        res = await self.session.execute(select(func.count(Complaint.id)))
        count = (res.scalar() or 0) + 1001
        return f"SS-{year}-{count:06d}"

    async def create(
        self,
        citizen_id: uuid.UUID,
        title: str,
        description: str,
        category: str,
        sub_category: Optional[str] = None,
        address: Optional[str] = None,
        ward: Optional[str] = None,
        city: Optional[str] = "Mumbai",
        state: Optional[str] = "Maharashtra",
        pincode: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        location_accuracy: Optional[float] = None,
        priority: ComplaintPriority = ComplaintPriority.LOW,
        priority_score: float = 0.0,
        urgency_score: int = 0,
        sentiment_score: float = 0.0,
        department_id: Optional[uuid.UUID] = None,
        sla_hours: int = 72,
        is_public: bool = True,
        is_anonymous: bool = False,
    ) -> Complaint:
        now = datetime.now(timezone.utc)
        complaint_num = await self.generate_complaint_number()
        sla_deadline = now + timedelta(hours=sla_hours)

        complaint = Complaint(
            id=uuid.uuid4(),
            complaint_number=complaint_num,
            citizen_id=citizen_id,
            title=title.strip(),
            description=description.strip(),
            category=category.strip(),
            sub_category=sub_category,
            address=address,
            ward=ward,
            city=city,
            state=state,
            pincode=pincode,
            latitude=latitude,
            longitude=longitude,
            location_accuracy=location_accuracy,
            priority=priority,
            priority_score=priority_score,
            urgency_score=urgency_score,
            sentiment_score=sentiment_score,
            status=ComplaintStatus.SUBMITTED,
            department_id=department_id,
            sla_deadline=sla_deadline,
            is_public=is_public,
            is_anonymous=is_anonymous,
            created_at=now,
            updated_at=now,
        )
        self.session.add(complaint)
        await self.session.flush()

        # Log initial timeline
        timeline = ComplaintTimeline(
            complaint_id=complaint.id,
            status_from=None,
            status_to=ComplaintStatus.SUBMITTED.value,
            changed_by=citizen_id,
            actor_role="citizen",
            notes="Complaint lodged successfully.",
            created_at=now,
        )
        self.session.add(timeline)
        await self.session.flush()

        return complaint

    async def get_by_id(self, complaint_id: uuid.UUID) -> Optional[Complaint]:
        res = await self.session.execute(
            select(Complaint)
            .options(
                selectinload(Complaint.citizen),
                selectinload(Complaint.department),
                selectinload(Complaint.assigned_officer).selectinload(Officer.user),
                selectinload(Complaint.media),
                selectinload(Complaint.timeline).selectinload(ComplaintTimeline.actor),
                selectinload(Complaint.votes),
                selectinload(Complaint.feedback),
                selectinload(Complaint.ai_analysis),
            )
            .where(Complaint.id == complaint_id)
        )
        return res.scalar_one_or_none()

    async def get_by_number(self, complaint_number: str) -> Optional[Complaint]:
        res = await self.session.execute(
            select(Complaint)
            .options(
                selectinload(Complaint.department),
                selectinload(Complaint.media),
                selectinload(Complaint.timeline),
            )
            .where(Complaint.complaint_number == complaint_number.strip())
        )
        return res.scalar_one_or_none()

    async def list_complaints(
        self,
        citizen_id: Optional[uuid.UUID] = None,
        department_id: Optional[uuid.UUID] = None,
        officer_id: Optional[uuid.UUID] = None,
        status: Optional[ComplaintStatus] = None,
        category: Optional[str] = None,
        ward: Optional[str] = None,
        is_public_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Complaint], int]:
        query = select(Complaint).options(
            selectinload(Complaint.department),
            selectinload(Complaint.media),
            selectinload(Complaint.assigned_officer).selectinload(Officer.user),
        )

        if citizen_id:
            query = query.where(Complaint.citizen_id == citizen_id)
        if department_id:
            query = query.where(Complaint.department_id == department_id)
        if officer_id:
            query = query.where(Complaint.assigned_officer_id == officer_id)
        if status:
            query = query.where(Complaint.status == status)
        if category:
            query = query.where(Complaint.category.ilike(category))
        if ward:
            query = query.where(Complaint.ward.ilike(ward))
        if is_public_only:
            query = query.where(Complaint.is_public == True)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_res = await self.session.execute(count_query)
        total = total_res.scalar() or 0

        # Order by priority and recency
        query = query.order_by(desc(Complaint.priority_score), desc(Complaint.created_at))
        query = query.limit(limit).offset(offset)

        res = await self.session.execute(query)
        return list(res.scalars().all()), total

    async def add_media_proof(
        self,
        complaint_id: uuid.UUID,
        media_type: MediaType,
        s3_key: str,
        file_name: str,
        file_size_bytes: int,
        mime_type: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        captured_at: Optional[datetime] = None,
        device_info: Optional[str] = None,
        has_watermark: bool = False,
        uploaded_by: Optional[uuid.UUID] = None,
    ) -> ComplaintMedia:
        media = ComplaintMedia(
            id=uuid.uuid4(),
            complaint_id=complaint_id,
            media_type=media_type,
            s3_key=s3_key,
            file_name=file_name,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            latitude=latitude,
            longitude=longitude,
            captured_at=captured_at,
            device_info=device_info,
            has_watermark=has_watermark,
            uploaded_by=uploaded_by,
        )
        self.session.add(media)
        await self.session.flush()
        return media

    async def add_status_transition(
        self,
        complaint: Complaint,
        new_status: ComplaintStatus,
        changed_by: Optional[uuid.UUID] = None,
        actor_role: Optional[str] = None,
        notes: Optional[str] = None,
        remarks: Optional[str] = None,
    ) -> None:
        old_status = complaint.status.value if complaint.status else None
        now = datetime.now(timezone.utc)

        complaint.status = new_status
        complaint.updated_at = now
        if new_status == ComplaintStatus.RESOLVED:
            complaint.resolved_at = now
            if remarks:
                complaint.resolution_remarks = remarks

        timeline = ComplaintTimeline(
            complaint_id=complaint.id,
            status_from=old_status,
            status_to=new_status.value,
            changed_by=changed_by,
            actor_role=actor_role,
            notes=notes,
            created_at=now,
        )
        self.session.add(timeline)
        await self.session.flush()

    async def upvote(self, complaint_id: uuid.UUID, user_id: uuid.UUID, vote_type: VoteType = VoteType.UPVOTE) -> bool:
        """Vote on a complaint, incrementing denormalized vote_count."""
        # Check existing vote
        existing = await self.session.execute(
            select(ComplaintVote).where(
                ComplaintVote.complaint_id == complaint_id,
                ComplaintVote.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none():
            return False

        vote = ComplaintVote(
            id=uuid.uuid4(),
            complaint_id=complaint_id,
            user_id=user_id,
            vote_type=vote_type,
        )
        self.session.add(vote)
        await self.session.execute(
            update(Complaint)
            .where(Complaint.id == complaint_id)
            .values(vote_count=Complaint.vote_count + 1)
        )
        await self.session.flush()
        return True
