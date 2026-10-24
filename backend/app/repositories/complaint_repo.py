import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple, Union
from sqlalchemy import select, update, func, desc, or_, text, case
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
    AuditLog,
    Notification,
    NotificationType,
)

class ComplaintRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def generate_complaint_number(self) -> str:
        """Generate unique complaint number e.g. SS-2026-001234 using PostgreSQL sequence."""
        year = datetime.now(timezone.utc).year
        try:
            async with self.session.begin_nested():
                res = await self.session.execute(text("SELECT nextval('complaint_number_seq')"))
                val = res.scalar()
        except Exception:
            try:
                async with self.session.begin_nested():
                    await self.session.execute(text("CREATE SEQUENCE IF NOT EXISTS complaint_number_seq START 1001"))
                    res = await self.session.execute(text("SELECT nextval('complaint_number_seq')"))
                    val = res.scalar()
            except Exception:
                res = await self.session.execute(select(func.count(Complaint.id)))
                val = (res.scalar() or 0) + 1001
        return f"SS-{year}-{val:06d}"

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
                selectinload(Complaint.media),
                selectinload(Complaint.timeline).selectinload(ComplaintTimeline.actor),
                selectinload(Complaint.ai_results),
                selectinload(Complaint.department),
                selectinload(Complaint.citizen),
                selectinload(Complaint.feedback),
                selectinload(Complaint.assigned_officer).selectinload(Officer.user),
                selectinload(Complaint.votes),
                selectinload(Complaint.ai_analysis),
            )
            .where(Complaint.id == complaint_id)
        )
        return res.scalar_one_or_none()

    async def get_by_citizen(
        self,
        citizen_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Complaint]:
        stmt = (
            select(Complaint)
            .options(
                selectinload(Complaint.media),
                selectinload(Complaint.timeline),
                selectinload(Complaint.ai_results),
                selectinload(Complaint.department),
                selectinload(Complaint.citizen),
                selectinload(Complaint.feedback),
            )
            .where(Complaint.citizen_id == citizen_id)
            .order_by(desc(Complaint.created_at))
            .limit(limit)
            .offset(offset)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_public_feed(
        self,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Complaint]:
        stmt = (
            select(Complaint)
            .options(
                selectinload(Complaint.media),
                selectinload(Complaint.timeline),
                selectinload(Complaint.ai_results),
                selectinload(Complaint.department),
                selectinload(Complaint.citizen),
                selectinload(Complaint.feedback),
            )
            .where(Complaint.is_public == True)
            .order_by(desc(Complaint.created_at))
            .limit(limit)
            .offset(offset)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_by_department(
        self,
        department_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Complaint]:
        stmt = (
            select(Complaint)
            .options(
                selectinload(Complaint.media),
                selectinload(Complaint.timeline),
                selectinload(Complaint.ai_results),
                selectinload(Complaint.department),
                selectinload(Complaint.citizen),
                selectinload(Complaint.feedback),
            )
            .where(Complaint.department_id == department_id)
            .order_by(desc(Complaint.created_at))
            .limit(limit)
            .offset(offset)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

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
        exclude_statuses: Optional[List[ComplaintStatus]] = None,
        sort_by: str = "recent",
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Complaint], int]:
        query = select(Complaint).options(
            selectinload(Complaint.media),
            selectinload(Complaint.timeline),
            selectinload(Complaint.ai_results),
            selectinload(Complaint.department),
            selectinload(Complaint.citizen),
            selectinload(Complaint.feedback),
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
        if exclude_statuses:
            query = query.where(Complaint.status.not_in(exclude_statuses))
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

        # Dynamic ordering based on sort_by
        if sort_by == "priority_sla":
            terminal_statuses = (
                ComplaintStatus.RESOLVED,
                ComplaintStatus.CLOSED,
                ComplaintStatus.REJECTED,
            )
            query = query.order_by(
                case((Complaint.status.in_(terminal_statuses), 1), else_=0).asc(),
                case((Complaint.sla_deadline.is_(None), 1), else_=0).asc(),
                Complaint.sla_deadline.asc(),
                desc(Complaint.priority_score),
                Complaint.created_at.asc(),
            )
        elif sort_by == "priority":
            query = query.order_by(desc(Complaint.priority_score), desc(Complaint.created_at))
        elif sort_by == "upvotes":
            query = query.order_by(desc(Complaint.vote_count), desc(Complaint.created_at))
        else:
            query = query.order_by(desc(Complaint.created_at))

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
        complaint_id: Optional[Union[uuid.UUID, Complaint]] = None,
        from_status: Optional[Union[ComplaintStatus, str]] = None,
        to_status: Optional[Union[ComplaintStatus, str]] = None,
        actor_id: Optional[uuid.UUID] = None,
        actor_role: Optional[str] = None,
        notes: Optional[str] = None,
        *,
        complaint: Optional[Complaint] = None,
        new_status: Optional[ComplaintStatus] = None,
        changed_by: Optional[uuid.UUID] = None,
        remarks: Optional[str] = None,
        action_taken_report: Optional[str] = None,
        satisfaction_status: Optional[str] = None,
        appeal_level: Optional[int] = None,
        appeal_remarks: Optional[str] = None,
        **kwargs,
    ) -> ComplaintTimeline:
        target_complaint: Optional[Complaint] = None
        target_id: Optional[uuid.UUID] = None

        if isinstance(complaint_id, Complaint):
            target_complaint = complaint_id
            target_id = complaint_id.id
        elif complaint is not None:
            target_complaint = complaint
            target_id = complaint.id
        elif isinstance(complaint_id, uuid.UUID):
            target_id = complaint_id
        elif isinstance(complaint_id, str):
            try:
                target_id = uuid.UUID(complaint_id)
            except ValueError:
                target_id = None

        target_to: Optional[Union[ComplaintStatus, str]] = None
        target_from: Optional[Union[ComplaintStatus, str]] = None

        if new_status is not None:
            target_to = new_status
            target_from = from_status
        elif to_status is not None:
            target_to = to_status
            target_from = from_status
        else:
            target_to = from_status
            target_from = target_complaint.status if target_complaint else None

        if target_complaint is None and target_id is not None:
            target_complaint = await self.get_by_id(target_id)
        elif target_complaint is not None and target_id is None:
            target_id = target_complaint.id

        if target_complaint and target_from is None:
            target_from = target_complaint.status

        effective_actor = actor_id if actor_id is not None else changed_by
        effective_notes = remarks or notes
        now = datetime.now(timezone.utc)

        if target_complaint and target_to is not None:
            target_complaint.status = target_to
            target_complaint.updated_at = now
            # Only set resolved_at on first entry to RESOLVED (never overwrite on CLOSED)
            if target_to == ComplaintStatus.RESOLVED and target_complaint.resolved_at is None:
                target_complaint.resolved_at = now

            if effective_notes and target_to == ComplaintStatus.RESOLVED:
                target_complaint.resolution_remarks = effective_notes
            if action_taken_report:
                target_complaint.action_taken_report = action_taken_report
                target_complaint.atr_submitted_at = now
            if satisfaction_status:
                target_complaint.satisfaction_status = satisfaction_status
            if appeal_level is not None:
                target_complaint.appeal_level = appeal_level
            if appeal_remarks:
                target_complaint.appeal_remarks = appeal_remarks

        from_val = target_from.value if hasattr(target_from, "value") else (str(target_from) if target_from is not None else None)
        to_val = target_to.value if hasattr(target_to, "value") else (str(target_to) if target_to is not None else None)

        entry = ComplaintTimeline(
            complaint_id=target_id,
            status_from=from_val,
            status_to=to_val,
            updated_by=effective_actor,
            actor_role=actor_role,
            notes=effective_notes,
        )
        self.session.add(entry)

        # Audit Log
        audit = AuditLog(
            action="STATUS_CHANGE",
            entity_type="complaint",
            entity_id=str(target_id) if target_id else "",
            actor_id=effective_actor,
            actor_role=actor_role,
            details={
                "from": from_val,
                "to": to_val,
                "notes": effective_notes,
                "action_taken_report": action_taken_report,
                "appeal_level": appeal_level,
            },
            created_at=now,
        )
        self.session.add(audit)

        # Notification to citizen
        if target_complaint and target_complaint.citizen_id:
            notif_type = NotificationType.STATUS_CHANGE
            notif_title = f"Grievance #{target_complaint.complaint_number} Updated"
            status_display = to_val.replace("_", " ").title() if to_val else "Updated"
            notif_body = f"Your grievance has moved to {status_display}."
            if effective_notes:
                notif_body += f" Officer note: {effective_notes}"

            if target_to == ComplaintStatus.RESOLVED:
                notif_type = NotificationType.FEEDBACK_REQUEST
                notif_title = f"Action Taken Report Filed: #{target_complaint.complaint_number}"
                notif_body = f"The department has resolved grievance #{target_complaint.complaint_number}. Review the ATR and let us know if you are satisfied or wish to appeal."

            notif = Notification(
                user_id=target_complaint.citizen_id,
                complaint_id=target_complaint.id,
                type=notif_type,
                title=notif_title,
                body=notif_body,
                created_at=now,
            )
            self.session.add(notif)

        await self.session.flush()
        return entry

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
