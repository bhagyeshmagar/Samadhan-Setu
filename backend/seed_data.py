"""
Seed Data Script for Samadhan Setu Phase 1 (Firestore Version)
Creates demo departments, users, complaints with tasks, and sample audit logs.

Run: python seed_data.py
"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db
from app.models import (
    User, UserRole, Department, CategoryMapping,
    Complaint, ComplaintStatus, ComplaintPriority, ComplaintStatusLog,
    SLARule, Task, TaskStatus, AuditLog,
)
from app.auth import get_password_hash


def seed_database():
    """Seed the Firestore database with Phase 1 demo data."""
    try:
        db = get_db()

        # Check if already seeded
        admin_docs = list(db.collection("users").where("email", "==", "admin@samadhan.gov.in").get())
        if admin_docs:
            print("Database already appears to be seeded. Skipping to avoid duplicates...")
            return

        print("🌱 Seeding Firestore database with Phase 1 demo data...")

        # ===== DEPARTMENTS =====
        departments_data = [
            Department(name="Roads & Transport", code="dept_roads", description="Road maintenance, potholes, traffic signals, bridges", keywords=["road", "pothole", "traffic", "bridge", "footpath"], contact_email="roads@samadhan.gov.in"),
            Department(name="Water Supply", code="dept_water", description="Water supply, drainage, sewage, pipes", keywords=["water", "pipe", "drain", "sewage", "tap", "leaking"], contact_email="water@samadhan.gov.in"),
            Department(name="Electricity", code="dept_electricity", description="Power supply, streetlights, transformers", keywords=["power", "electricity", "streetlight", "wire", "transformer"], contact_email="electricity@samadhan.gov.in"),
            Department(name="Sanitation & Waste", code="dept_sanitation", description="Garbage collection, waste disposal, cleaning", keywords=["garbage", "trash", "waste", "cleaning", "dump"], contact_email="sanitation@samadhan.gov.in"),
            Department(name="Health & Safety", code="dept_health", description="Public health, hospitals, safety inspections", keywords=["hospital", "health", "disease", "mosquito", "safety"], contact_email="health@samadhan.gov.in"),
        ]

        dept_map = {}
        for dept in departments_data:
            doc_ref = db.collection("departments").document()
            dept.id = doc_ref.id
            doc_ref.set(dept.to_firestore())
            dept_map[dept.name] = dept.id

        print("✅ Departments created")

        # ===== CATEGORY MAPPINGS =====
        mappings = [
            CategoryMapping(category="Roads & Transport", department_id=dept_map["Roads & Transport"]),
            CategoryMapping(category="Water Supply", department_id=dept_map["Water Supply"]),
            CategoryMapping(category="Electricity", department_id=dept_map["Electricity"]),
            CategoryMapping(category="Sanitation & Waste", department_id=dept_map["Sanitation & Waste"]),
            CategoryMapping(category="Health & Safety", department_id=dept_map["Health & Safety"]),
            CategoryMapping(category="General", department_id=dept_map["Roads & Transport"]),
        ]

        for mapping in mappings:
            doc_ref = db.collection("category_mappings").document()
            mapping.id = doc_ref.id
            doc_ref.set(mapping.to_firestore())

        print("✅ Category mappings created")

        # ===== USERS =====
        users = [
            User(email="citizen@demo.com", password_hash=get_password_hash("demo123"), name="Rajesh Kumar", phone="9876543210", role=UserRole.CITIZEN),
            User(email="priya@demo.com", password_hash=get_password_hash("demo123"), name="Priya Sharma", phone="9876543211", role=UserRole.CITIZEN),
            User(email="officer@roads.gov.in", password_hash=get_password_hash("demo123"), name="Amit Verma", phone="9876543220", role=UserRole.OFFICER, department_id=dept_map["Roads & Transport"]),
            User(email="officer@water.gov.in", password_hash=get_password_hash("demo123"), name="Sunita Devi", phone="9876543221", role=UserRole.OFFICER, department_id=dept_map["Water Supply"]),
            User(email="officer@electricity.gov.in", password_hash=get_password_hash("demo123"), name="Ramesh Gupta", phone="9876543222", role=UserRole.OFFICER, department_id=dept_map["Electricity"]),
            User(email="admin@samadhan.gov.in", password_hash=get_password_hash("demo123"), name="District Collector", phone="9876543200", role=UserRole.ADMIN),
        ]

        user_ids = {}
        for user in users:
            doc_ref = db.collection("users").document()
            user.id = doc_ref.id
            doc_ref.set(user.to_firestore())
            user_ids[user.email] = user.id

        citizen_id = user_ids["citizen@demo.com"]
        citizen2_id = user_ids["priya@demo.com"]
        print("✅ Users created")

        # ===== SAMPLE COMPLAINTS WITH TASKS =====
        now = datetime.utcnow()

        complaints_data = [
            {
                "user_id": citizen_id,
                "title": "Dangerous pothole on main road near market",
                "category": "Roads & Transport",
                "description": "Huge pothole near the main market area, causing danger to two-wheelers. Multiple accidents have occurred this week.",
                "location": "Sector 4, Main Market Road",
                "ward": "Ward 12",
                "priority": ComplaintPriority.HIGH,
                "priority_score": 2.45,
                "status": ComplaintStatus.ASSIGNED,
                "department_id": dept_map["Roads & Transport"],
            },
            {
                "user_id": citizen2_id,
                "title": "Contaminated drinking water supply",
                "category": "Water Supply",
                "description": "Drinking water coming from taps is muddy and has a bad smell. Children are falling sick. Urgent attention needed.",
                "location": "Shivaji Nagar, Block B",
                "ward": "Ward 8",
                "priority": ComplaintPriority.HIGH,
                "priority_score": 2.6,
                "status": ComplaintStatus.IN_PROGRESS,
                "department_id": dept_map["Water Supply"],
            },
            {
                "user_id": citizen_id,
                "title": "Street light not working for 3 weeks",
                "category": "Electricity",
                "description": "Street light near MG Road bus stop has not been working for 3 weeks. Area is unsafe at night.",
                "location": "MG Road, Bus Stop Area",
                "ward": "Ward 5",
                "priority": ComplaintPriority.MEDIUM,
                "priority_score": 1.85,
                "status": ComplaintStatus.RESOLVED,
                "department_id": dept_map["Electricity"],
            },
        ]

        for cdata in complaints_data:
            complaint = Complaint(
                **cdata,
                is_public=True,
                created_at=now - timedelta(days=3),
                updated_at=now,
                deadline=now + timedelta(hours=24 if cdata["priority"] == ComplaintPriority.HIGH else 72),
            )

            comp_ref = db.collection("complaints").document()
            complaint.id = comp_ref.id
            comp_ref.set(complaint.to_firestore())

            # Status logs
            log1 = ComplaintStatusLog(
                complaint_id=complaint.id,
                from_status=None,
                to_status=ComplaintStatus.SUBMITTED.value,
                remarks="Complaint submitted and auto-classified",
                updated_by=cdata["user_id"],
            )
            db.collection("complaint_status_logs").add(log1.to_firestore())

            log2 = ComplaintStatusLog(
                complaint_id=complaint.id,
                from_status=ComplaintStatus.SUBMITTED.value,
                to_status=ComplaintStatus.ASSIGNED.value,
                remarks="Auto-assigned to department",
                updated_by="system",
            )
            db.collection("complaint_status_logs").add(log2.to_firestore())

            if cdata["status"] in [ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED]:
                log3 = ComplaintStatusLog(
                    complaint_id=complaint.id,
                    from_status=ComplaintStatus.ASSIGNED.value,
                    to_status=ComplaintStatus.IN_PROGRESS.value,
                    remarks="Officer began working on the issue",
                    updated_by="system",
                )
                db.collection("complaint_status_logs").add(log3.to_firestore())

            if cdata["status"] == ComplaintStatus.RESOLVED:
                log4 = ComplaintStatusLog(
                    complaint_id=complaint.id,
                    from_status=ComplaintStatus.IN_PROGRESS.value,
                    to_status=ComplaintStatus.RESOLVED.value,
                    remarks="Issue fixed. New streetlight installed.",
                    updated_by="system",
                )
                db.collection("complaint_status_logs").add(log4.to_firestore())

            # Create task for each complaint
            task = Task(
                complaint_id=complaint.id,
                department_id=cdata["department_id"],
                department_name=cdata["category"],
                status=TaskStatus.COMPLETED if cdata["status"] == ComplaintStatus.RESOLVED else TaskStatus.IN_PROGRESS if cdata["status"] == ComplaintStatus.IN_PROGRESS else TaskStatus.PENDING,
                notes=f"Auto-generated task for {cdata['category']}",
                created_at=now - timedelta(days=3),
                updated_at=now,
            )
            task_ref = db.collection("tasks").document()
            task.id = task_ref.id
            task_ref.set(task.to_firestore())

            # Audit log
            audit = AuditLog(
                action="complaint_created",
                entity_type="complaint",
                entity_id=complaint.id,
                actor_id=cdata["user_id"],
                actor_role="citizen",
                details={"category": cdata["category"], "priority": cdata["priority"].value},
            )
            db.collection("audit_logs").add(audit.to_firestore())

        print("✅ Sample complaints, tasks, status logs, and audit logs created")

        # ===== SLA RULES =====
        sla_rules = [
            SLARule(category=None, priority="High", resolution_hours=24, escalation_hours=12),
            SLARule(category=None, priority="Medium", resolution_hours=72, escalation_hours=48),
            SLARule(category=None, priority="Low", resolution_hours=168, escalation_hours=120),
            SLARule(category="Health & Safety", priority=None, resolution_hours=12, escalation_hours=6),
        ]

        for rule in sla_rules:
            doc_ref = db.collection("sla_rules").document()
            rule.id = doc_ref.id
            doc_ref.set(rule.to_firestore())

        print("✅ SLA rules created")

        print("\n" + "=" * 50)
        print("🎉 Phase 1 Firestore database seeded successfully!")
        print("=" * 50)
        print("\nDemo credentials:")
        print("  Citizen: citizen@demo.com / demo123")
        print("  Officer (Roads): officer@roads.gov.in / demo123")
        print("  Admin: admin@samadhan.gov.in / demo123")

    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        raise


if __name__ == "__main__":
    seed_database()
