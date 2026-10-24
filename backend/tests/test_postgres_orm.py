"""
PostgreSQL ORM Integration Tests
================================
Validates SQLAlchemy 2.0 async models, UUID generation, enum constraints,
relationships, foreign key cascades, and unique constraints.
"""
import uuid
import os
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

from app.models.orm import (
    User,
    UserRole,
    Department,
    CategoryMapping,
    SLARule,
    Officer,
    Complaint,
    ComplaintStatus,
    ComplaintPriority,
    ComplaintTimeline,
    ComplaintMedia,
    ComplaintVote,
    CitizenFeedback,
    VoteType,
    MediaType,
)
from app.auth import get_password_hash

# Integration tests must never write to the application's configured database.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytest.skip("Set TEST_DATABASE_URL to a dedicated test database to run PostgreSQL integration tests", allow_module_level=True)

test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)

@pytest_asyncio.fixture
async def db_session():
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        ) as session:
            try:
                yield session
            finally:
                await session.close()
                await transaction.rollback()

@pytest.mark.asyncio
async def test_create_user_and_uuid(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"test_{uuid.uuid4().hex[:8]}@example.com",
        name="Test Citizen",
        password_hash=get_password_hash("securepass123"),
        role=UserRole.CITIZEN,
        city="Pune",
        state="Maharashtra",
    )
    db_session.add(user)
    await db_session.commit()

    # Query back
    res = await db_session.execute(select(User).where(User.id == user.id))
    fetched = res.scalar_one()
    assert fetched.email == user.email
    assert fetched.role == UserRole.CITIZEN
    assert isinstance(fetched.id, uuid.UUID)

@pytest.mark.asyncio
async def test_department_and_officer_relationship(db_session):
    dept = Department(
        id=uuid.uuid4(),
        name=f"Dept_{uuid.uuid4().hex[:6]}",
        code=f"CODE_{uuid.uuid4().hex[:4]}",
        sla_high=24,
        sla_medium=48,
        sla_low=96,
    )
    user = User(
        id=uuid.uuid4(),
        email=f"officer_{uuid.uuid4().hex[:8]}@example.gov.in",
        name="Officer Test",
        password_hash=get_password_hash("securepass123"),
        role=UserRole.OFFICER,
    )
    db_session.add_all([dept, user])
    await db_session.flush()

    officer = Officer(
        id=uuid.uuid4(),
        user_id=user.id,
        department_id=dept.id,
        employee_id=f"EMP-{uuid.uuid4().hex[:6]}",
        designation="Field Inspector",
        jurisdiction_wards=["Ward 1", "Ward 2"],
    )
    db_session.add(officer)
    await db_session.commit()

    # Check relationships
    res = await db_session.execute(select(Officer).where(Officer.id == officer.id))
    fetched_officer = res.scalar_one()
    assert fetched_officer.user_id == user.id
    assert fetched_officer.department_id == dept.id

@pytest.mark.asyncio
async def test_complaint_with_gps_media(db_session):
    now = datetime.now(timezone.utc)
    citizen = User(
        id=uuid.uuid4(),
        email=f"citizen_{uuid.uuid4().hex[:8]}@example.com",
        name="GPS Tester",
        password_hash=get_password_hash("securepass123"),
        role=UserRole.CITIZEN,
    )
    dept = Department(
        id=uuid.uuid4(),
        name=f"Roads_{uuid.uuid4().hex[:6]}",
        code=f"RDS_{uuid.uuid4().hex[:4]}",
    )
    db_session.add_all([citizen, dept])
    await db_session.flush()

    complaint = Complaint(
        id=uuid.uuid4(),
        complaint_number=f"SS-TEST-{uuid.uuid4().hex[:6]}",
        citizen_id=citizen.id,
        title="Pothole near metro pillar 108",
        description="Hazardous pothole right on the active lane.",
        category="Roads",
        priority=ComplaintPriority.HIGH,
        priority_score=85.0,
        latitude=19.0760,
        longitude=72.8777,
        location_accuracy=3.2,
        status=ComplaintStatus.SUBMITTED,
        department_id=dept.id,
        sla_deadline=now + timedelta(hours=24),
    )
    db_session.add(complaint)
    await db_session.flush()

    media = ComplaintMedia(
        complaint_id=complaint.id,
        media_type=MediaType.PROOF_PHOTO,
        s3_key=f"proofs/{uuid.uuid4().hex}.jpg",
        file_name="pothole_photo.jpg",
        file_size_bytes=512000,
        mime_type="image/jpeg",
        latitude=19.0760,
        longitude=72.8777,
        has_watermark=True,
        uploaded_by=citizen.id,
    )
    db_session.add(media)
    await db_session.commit()

    # Query complaint + media
    res = await db_session.execute(select(ComplaintMedia).where(ComplaintMedia.complaint_id == complaint.id))
    fetched_media = res.scalar_one()
    assert fetched_media.latitude == 19.0760
    assert fetched_media.longitude == 72.8777
    assert fetched_media.has_watermark is True

@pytest.mark.asyncio
async def test_vote_uniqueness_constraint(db_session):
    user = User(
        id=uuid.uuid4(),
        email=f"voter_{uuid.uuid4().hex[:8]}@example.com",
        name="Voter 1",
        password_hash=get_password_hash("securepass123"),
        role=UserRole.CITIZEN,
    )
    complaint = Complaint(
        id=uuid.uuid4(),
        complaint_number=f"SS-VOTE-{uuid.uuid4().hex[:6]}",
        citizen_id=user.id,
        title="Water leakage",
        description="Leaking pipe outside apartment complex.",
        category="Water",
        priority=ComplaintPriority.LOW,
        status=ComplaintStatus.SUBMITTED,
    )
    db_session.add_all([user, complaint])
    await db_session.flush()

    vote1 = ComplaintVote(
        complaint_id=complaint.id,
        user_id=user.id,
        vote_type=VoteType.UPVOTE,
    )
    db_session.add(vote1)
    await db_session.commit()

    # Duplicate vote by same user on same complaint must raise IntegrityError
    vote2 = ComplaintVote(
        complaint_id=complaint.id,
        user_id=user.id,
        vote_type=VoteType.UPVOTE,
    )
    db_session.add(vote2)
    with pytest.raises(IntegrityError):
        await db_session.commit()

@pytest.mark.asyncio
async def test_repositories_flow(db_session):
    from app.repositories import UserRepository, DepartmentRepository, ComplaintRepository

    user_repo = UserRepository(db_session)
    dept_repo = DepartmentRepository(db_session)
    complaint_repo = ComplaintRepository(db_session)

    # 1. Create Citizen via Repo
    citizen = await user_repo.create(
        email=f"repo_citizen_{uuid.uuid4().hex[:6]}@example.com",
        name="Repo Citizen",
        password_hash=get_password_hash("pass123"),
        ward="Ward 12",
        city="Mumbai",
    )
    assert citizen.id is not None

    # 2. Get Department via Category Mapping
    dept = await dept_repo.get_by_category("Roads & Transport")
    assert dept is not None
    assert dept.code == "dept_roads"

    # 3. Resolve SLA Hours (Statutory: Critical=72h, High=120h, Medium=168h, Low=504h)
    sla_hours = await dept_repo.get_sla_hours("Roads & Transport", "high")
    assert sla_hours == 120

    # 4. Create Complaint via Repo
    complaint = await complaint_repo.create(
        citizen_id=citizen.id,
        title="Pothole reported via Repo test",
        description="Pothole description for testing repo layer.",
        category="Roads & Transport",
        ward="Ward 12",
        latitude=19.0178,
        longitude=72.8478,
        priority=ComplaintPriority.HIGH,
        priority_score=80.0,
        department_id=dept.id,
        sla_hours=sla_hours,
    )
    assert complaint.complaint_number.startswith("SS-")
    assert complaint.status == ComplaintStatus.SUBMITTED

    # 5. Add Geotagged Media via Repo
    media = await complaint_repo.add_media_proof(
        complaint_id=complaint.id,
        media_type=MediaType.PROOF_PHOTO,
        s3_key="proofs/test_repo_proof.jpg",
        file_name="test_repo_proof.jpg",
        file_size_bytes=102400,
        mime_type="image/jpeg",
        latitude=19.0178,
        longitude=72.8478,
        has_watermark=True,
        uploaded_by=citizen.id,
    )
    assert media.id is not None
    assert media.has_watermark is True

    # 6. Status transition
    await complaint_repo.add_status_transition(
        complaint=complaint,
        new_status=ComplaintStatus.IN_PROGRESS,
        changed_by=citizen.id,
        actor_role="officer",
        notes="Work initiated by field squad.",
    )
    assert complaint.status == ComplaintStatus.IN_PROGRESS

    # 7. Upvote
    voted = await complaint_repo.upvote(complaint.id, citizen.id)
    assert voted is True
    duplicate_vote = await complaint_repo.upvote(complaint.id, citizen.id)
    assert duplicate_vote is False

    await db_session.commit()
