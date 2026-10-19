"""
Seed Data Script for Samadhan Setu PostgreSQL Database
======================================================
Seeds demo departments, users, officers, teams, complaints with GPS coordinates,
timelines, SLA rules, and category mappings into PostgreSQL.

Run: python seed_postgres.py
"""
import sys
import os
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy import select
from app.db.session import async_engine, AsyncSessionLocal
from app.models.orm import (
    Base,
    User,
    UserRole,
    Department,
    CategoryMapping,
    SLARule,
    Officer,
    Team,
    Complaint,
    ComplaintStatus,
    ComplaintPriority,
    ComplaintTimeline,
    ComplaintMedia,
    MediaType,
    AuditLog,
)
from app.auth import get_password_hash

async def seed_data():
    print("🌱 Connecting to PostgreSQL to seed demo data...")
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        res = await session.execute(select(User).where(User.email == "admin@samadhan.gov.in"))
        if res.scalars().first():
            print("Database already seeded with demo accounts. Skipping.")
            return

        # 1. DEPARTMENTS
        departments = [
            Department(
                id=uuid.uuid4(),
                name="Roads & Transport",
                code="dept_roads",
                description="Road maintenance, potholes, traffic signals, bridges",
                contact_email="roads@samadhan.gov.in",
                contact_phone="022-24301111",
                city="Mumbai",
                state="Maharashtra",
                sla_high=24,
                sla_medium=72,
                sla_low=168,
            ),
            Department(
                id=uuid.uuid4(),
                name="Water Supply",
                code="dept_water",
                description="Water supply, drainage, sewage, pipes",
                contact_email="water@samadhan.gov.in",
                contact_phone="022-24302222",
                city="Mumbai",
                state="Maharashtra",
                sla_high=12,
                sla_medium=48,
                sla_low=120,
            ),
            Department(
                id=uuid.uuid4(),
                name="Electricity",
                code="dept_electricity",
                description="Power supply, streetlights, transformers",
                contact_email="electricity@samadhan.gov.in",
                contact_phone="022-24303333",
                city="Mumbai",
                state="Maharashtra",
                sla_high=8,
                sla_medium=24,
                sla_low=72,
            ),
            Department(
                id=uuid.uuid4(),
                name="Sanitation & Waste",
                code="dept_sanitation",
                description="Garbage collection, waste disposal, cleaning",
                contact_email="sanitation@samadhan.gov.in",
                contact_phone="022-24304444",
                city="Mumbai",
                state="Maharashtra",
                sla_high=12,
                sla_medium=36,
                sla_low=96,
            ),
            Department(
                id=uuid.uuid4(),
                name="Health & Safety",
                code="dept_health",
                description="Public health, mosquito control, food inspection",
                contact_email="health@samadhan.gov.in",
                contact_phone="022-24305555",
                city="Mumbai",
                state="Maharashtra",
                sla_high=6,
                sla_medium=24,
                sla_low=48,
            ),
        ]
        session.add_all(departments)
        await session.flush()
        print("✓ Created 5 Departments")

        dept_map = {d.name: d for d in departments}

        # 2. CATEGORY MAPPINGS
        mappings = [
            CategoryMapping(category="Roads & Transport", department_id=dept_map["Roads & Transport"].id),
            CategoryMapping(category="Water Supply", department_id=dept_map["Water Supply"].id),
            CategoryMapping(category="Electricity", department_id=dept_map["Electricity"].id),
            CategoryMapping(category="Sanitation & Waste", department_id=dept_map["Sanitation & Waste"].id),
            CategoryMapping(category="Health & Safety", department_id=dept_map["Health & Safety"].id),
            CategoryMapping(category="General", department_id=dept_map["Roads & Transport"].id),
        ]
        session.add_all(mappings)

        # 3. SLA RULES
        sla_rules = [
            SLARule(category=None, priority="High", resolution_hours=24, escalation_hours=12),
            SLARule(category=None, priority="Medium", resolution_hours=72, escalation_hours=48),
            SLARule(category=None, priority="Low", resolution_hours=168, escalation_hours=120),
            SLARule(category="Health & Safety", priority=None, resolution_hours=12, escalation_hours=6),
            SLARule(category=None, priority="Critical", resolution_hours=4, escalation_hours=2),
        ]
        session.add_all(sla_rules)

        # 4. USERS
        pwd = get_password_hash("demo123")

        citizen1 = User(
            id=uuid.uuid4(),
            email="citizen@demo.com",
            phone="9876543210",
            name="Rajesh Kumar",
            password_hash=pwd,
            role=UserRole.CITIZEN,
            ward="Ward 12 - Dadar",
            city="Mumbai",
            state="Maharashtra",
            pincode="400028",
            is_verified=True,
        )
        citizen2 = User(
            id=uuid.uuid4(),
            email="priya@demo.com",
            phone="9876543211",
            name="Priya Sharma",
            password_hash=pwd,
            role=UserRole.CITIZEN,
            ward="Ward 8 - Andheri",
            city="Mumbai",
            state="Maharashtra",
            pincode="400058",
            is_verified=True,
        )
        officer_roads_user = User(
            id=uuid.uuid4(),
            email="officer@roads.gov.in",
            phone="9876543220",
            name="Amit Verma",
            password_hash=pwd,
            role=UserRole.OFFICER,
            ward="Ward 12 - Dadar",
            city="Mumbai",
            state="Maharashtra",
            is_verified=True,
        )
        officer_water_user = User(
            id=uuid.uuid4(),
            email="officer@water.gov.in",
            phone="9876543221",
            name="Sunita Devi",
            password_hash=pwd,
            role=UserRole.OFFICER,
            ward="Ward 8 - Andheri",
            city="Mumbai",
            state="Maharashtra",
            is_verified=True,
        )
        officer_elec_user = User(
            id=uuid.uuid4(),
            email="officer@electricity.gov.in",
            phone="9876543222",
            name="Ramesh Gupta",
            password_hash=pwd,
            role=UserRole.OFFICER,
            ward="Ward 5 - Bandra",
            city="Mumbai",
            state="Maharashtra",
            is_verified=True,
        )
        admin_user = User(
            id=uuid.uuid4(),
            email="admin@samadhan.gov.in",
            phone="9876543200",
            name="District Collector",
            password_hash=pwd,
            role=UserRole.ADMIN,
            city="Mumbai",
            state="Maharashtra",
            is_verified=True,
        )

        session.add_all([
            citizen1, citizen2, officer_roads_user,
            officer_water_user, officer_elec_user, admin_user
        ])
        await session.flush()
        print("✓ Created 6 Demo Users (citizens, officers, admin)")

        # 5. OFFICERS & TEAMS
        officer_roads = Officer(
            id=uuid.uuid4(),
            user_id=officer_roads_user.id,
            department_id=dept_map["Roads & Transport"].id,
            employee_id="OFF-ROADS-001",
            designation="Assistant Municipal Engineer",
            jurisdiction_wards=["Ward 12 - Dadar", "Ward 14 - Mahim"],
            max_active_complaints=25,
            current_active_count=4,
            total_resolved=89,
            rating=4.7,
        )
        officer_water = Officer(
            id=uuid.uuid4(),
            user_id=officer_water_user.id,
            department_id=dept_map["Water Supply"].id,
            employee_id="OFF-WATER-001",
            designation="Executive Engineer (Water Works)",
            jurisdiction_wards=["Ward 8 - Andheri", "Ward 9 - Juhu"],
            max_active_complaints=20,
            current_active_count=2,
            total_resolved=64,
            rating=4.5,
        )
        officer_elec = Officer(
            id=uuid.uuid4(),
            user_id=officer_elec_user.id,
            department_id=dept_map["Electricity"].id,
            employee_id="OFF-ELEC-001",
            designation="Sub-Divisional Officer (Electrical)",
            jurisdiction_wards=["Ward 5 - Bandra"],
            max_active_complaints=15,
            current_active_count=1,
            total_resolved=112,
            rating=4.8,
        )
        session.add_all([officer_roads, officer_water, officer_elec])
        await session.flush()

        # Update department heads
        dept_map["Roads & Transport"].head_officer_id = officer_roads.id
        dept_map["Water Supply"].head_officer_id = officer_water.id
        dept_map["Electricity"].head_officer_id = officer_elec.id

        # Teams
        team_roads = Team(
            id=uuid.uuid4(),
            department_id=dept_map["Roads & Transport"].id,
            name="Dadar Quick Response Pothole Squad",
            code="TEAM-ROADS-DDR",
            daily_capacity=15,
            active_tasks=3,
            ward_coverage=["Ward 12 - Dadar"],
            head_officer_id=officer_roads_user.id,
            contact_email="roads.dadar@samadhan.gov.in",
        )
        session.add(team_roads)

        # 6. COMPLAINTS (with GPS coordinates for mobile & heatmap)
        c1 = Complaint(
            id=uuid.uuid4(),
            complaint_number="SS-2026-001001",
            citizen_id=citizen1.id,
            title="Dangerous pothole on Senapati Bapat Marg near station",
            description="Deep crater-like pothole on the southbound lane causing severe traffic disruption and risks to two-wheelers.",
            category="Roads & Transport",
            sub_category="Pothole Repair",
            ai_category="Roads & Transport",
            ai_confidence=0.96,
            ai_summary="High-severity road surface defect requiring immediate asphalt patching.",
            priority=ComplaintPriority.HIGH,
            priority_score=78.5,
            urgency_score=4,
            sentiment_score=-0.65,
            vote_count=14,
            address="Senapati Bapat Marg, Opp. Dadar Western Station, Dadar West",
            ward="Ward 12 - Dadar",
            city="Mumbai",
            state="Maharashtra",
            pincode="400028",
            latitude=19.0178,
            longitude=72.8478,
            location_accuracy=4.2,
            status=ComplaintStatus.IN_PROGRESS,
            department_id=dept_map["Roads & Transport"].id,
            assigned_officer_id=officer_roads.id,
            sla_deadline=now + timedelta(hours=18),
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(hours=3),
        )

        c2 = Complaint(
            id=uuid.uuid4(),
            complaint_number="SS-2026-001002",
            citizen_id=citizen2.id,
            title="Contaminated muddy drinking water supply in Shivaji Nagar",
            description="Tap water has been brown and emitting foul odor for 48 hours. Multiple children report gastrointestinal issues.",
            category="Water Supply",
            sub_category="Contamination / Quality",
            ai_category="Water Supply",
            ai_confidence=0.98,
            ai_summary="Urgent public health risk regarding municipal drinking water contamination.",
            priority=ComplaintPriority.CRITICAL,
            priority_score=94.0,
            urgency_score=5,
            sentiment_score=-0.89,
            vote_count=28,
            address="Building 4, Shivaji Nagar, Veera Desai Road, Andheri West",
            ward="Ward 8 - Andheri",
            city="Mumbai",
            state="Maharashtra",
            pincode="400058",
            latitude=19.1290,
            longitude=72.8360,
            location_accuracy=3.5,
            status=ComplaintStatus.ASSIGNED,
            department_id=dept_map["Water Supply"].id,
            assigned_officer_id=officer_water.id,
            sla_deadline=now + timedelta(hours=4),
            created_at=now - timedelta(hours=8),
            updated_at=now - timedelta(hours=2),
        )

        c3 = Complaint(
            id=uuid.uuid4(),
            complaint_number="SS-2026-001003",
            citizen_id=citizen1.id,
            title="Non-functional LED street light pole #42",
            description="Street light pole #42 has been completely dark for over two weeks, making the pedestrian crosswalk unsafe at night.",
            category="Electricity",
            sub_category="Street Light",
            ai_category="Electricity",
            ai_confidence=0.92,
            ai_summary="Civic safety hazard due to prolonged streetlight failure.",
            priority=ComplaintPriority.MEDIUM,
            priority_score=52.0,
            urgency_score=2,
            sentiment_score=-0.35,
            vote_count=6,
            address="Hill Road, Near Mehboob Studio, Bandra West",
            ward="Ward 5 - Bandra",
            city="Mumbai",
            state="Maharashtra",
            pincode="400050",
            latitude=19.0544,
            longitude=72.8286,
            location_accuracy=5.0,
            status=ComplaintStatus.RESOLVED,
            department_id=dept_map["Electricity"].id,
            assigned_officer_id=officer_elec.id,
            sla_deadline=now - timedelta(hours=10),
            resolved_at=now - timedelta(hours=12),
            resolution_remarks="Replaced faulty LED fixture and replaced damaged circuit breaker fuse. Tested and verified active.",
            created_at=now - timedelta(days=4),
            updated_at=now - timedelta(hours=12),
        )

        session.add_all([c1, c2, c3])
        await session.flush()
        print("✓ Created 3 Sample Complaints with GPS locations")

        # 7. TIMELINE & MEDIA PROOFS
        t1 = ComplaintTimeline(
            complaint_id=c1.id,
            status_from=None,
            status_to="submitted",
            changed_by=citizen1.id,
            actor_role="citizen",
            notes="Complaint submitted with geotagged photo proof.",
            created_at=c1.created_at,
        )
        t2 = ComplaintTimeline(
            complaint_id=c1.id,
            status_from="submitted",
            status_to="in_progress",
            changed_by=officer_roads_user.id,
            actor_role="officer",
            notes="Inspection completed. Maintenance truck dispatched for hot-mix asphalt patching.",
            created_at=c1.created_at + timedelta(hours=6),
        )
        session.add_all([t1, t2])

        # Proof Media with GPS metadata (matching Mobile App requirement!)
        media1 = ComplaintMedia(
            complaint_id=c1.id,
            media_type=MediaType.PROOF_PHOTO,
            s3_key="proofs/2026/10/pothole_dadar_proof.jpg",
            file_name="pothole_dadar_proof.jpg",
            file_size_bytes=1024 * 750,
            mime_type="image/jpeg",
            latitude=19.0178,
            longitude=72.8478,
            captured_at=c1.created_at,
            device_info="Citizen Mobile App (Android 14 / Expo Camera)",
            has_watermark=True,
            uploaded_by=citizen1.id,
            created_at=c1.created_at,
        )
        session.add(media1)

        # Audit Log
        audit = AuditLog(
            action="complaint_created",
            entity_type="complaint",
            entity_id=str(c1.id),
            actor_id=citizen1.id,
            actor_role="citizen",
            details={"category": "Roads & Transport", "priority": "high", "has_gps_proof": True},
        )
        session.add(audit)

        await session.commit()
        print("\n" + "=" * 55)
        print("🎉 PostgreSQL database seeded successfully with rich demo data!")
        print("=" * 55)
        print("Accounts available:")
        print("  Citizen:     citizen@demo.com / demo123")
        print("  Citizen 2:   priya@demo.com / demo123")
        print("  Officer R&T: officer@roads.gov.in / demo123")
        print("  Officer H2O: officer@water.gov.in / demo123")
        print("  Officer ELE: officer@electricity.gov.in / demo123")
        print("  Admin:       admin@samadhan.gov.in / demo123")
        print("=" * 55)

if __name__ == "__main__":
    asyncio.run(seed_data())
