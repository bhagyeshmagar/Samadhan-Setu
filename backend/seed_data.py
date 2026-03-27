"""
Seed Data Script for Samadhan Setu
Creates demo departments, users, and sample complaints

Run: python seed_data.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, init_db
from app.models import (
    User, UserRole, Department, CategoryMapping, 
    Complaint, ComplaintStatus, ComplaintPriority, ComplaintStatusLog,
    SLARule
)
from app.auth import get_password_hash

def seed_database():
    """Seed the database with demo data"""
    
    # Initialize database tables
    init_db()
    
    db = SessionLocal()
    
    try:
        # Check if already seeded
        if db.query(Department).first():
            print("Database already seeded. Skipping...")
            return
        
        print("🌱 Seeding database with demo data...")
        
        # ===== DEPARTMENTS =====
        departments = [
            Department(
                name="Roads & Transport",
                code="dept_roads",
                description="Handles road maintenance, traffic signals, public transport",
                keywords=["road", "pothole", "traffic", "bus", "signal", "transport", "highway"],
                contact_email="roads@samadhan.gov.in"
            ),
            Department(
                name="Water Supply",
                code="dept_water",
                description="Water supply, drainage, and sewage management",
                keywords=["water", "pipe", "leak", "drainage", "sewage", "supply", "tap"],
                contact_email="water@samadhan.gov.in"
            ),
            Department(
                name="Electricity",
                code="dept_electricity",
                description="Power supply, streetlights, electrical infrastructure",
                keywords=["power", "electricity", "light", "pole", "transformer", "outage"],
                contact_email="electricity@samadhan.gov.in"
            ),
            Department(
                name="Sanitation & Waste",
                code="dept_sanitation",
                description="Garbage collection, waste management, cleanliness",
                keywords=["garbage", "trash", "waste", "dustbin", "clean", "sanitation"],
                contact_email="sanitation@samadhan.gov.in"
            ),
            Department(
                name="Health & Safety",
                code="dept_health",
                description="Public health, hospitals, emergency services",
                keywords=["hospital", "health", "doctor", "emergency", "ambulance", "safety"],
                contact_email="health@samadhan.gov.in"
            ),
        ]
        
        for dept in departments:
            db.add(dept)
        db.commit()
        print("✅ Departments created")
        
        # ===== CATEGORY MAPPINGS =====
        dept_map = {d.name: d.id for d in db.query(Department).all()}
        
        mappings = [
            CategoryMapping(category="Roads & Transport", department_id=dept_map["Roads & Transport"]),
            CategoryMapping(category="Water Supply", department_id=dept_map["Water Supply"]),
            CategoryMapping(category="Electricity", department_id=dept_map["Electricity"]),
            CategoryMapping(category="Sanitation & Waste", department_id=dept_map["Sanitation & Waste"]),
            CategoryMapping(category="Health & Safety", department_id=dept_map["Health & Safety"]),
            CategoryMapping(category="General", department_id=dept_map["Roads & Transport"]),  # Default to roads
        ]
        
        for mapping in mappings:
            db.add(mapping)
        db.commit()
        print("✅ Category mappings created")
        
        # ===== USERS =====
        users = [
            # Citizens
            User(
                email="citizen@demo.com",
                password_hash=get_password_hash("demo123"),
                name="Rajesh Kumar",
                phone="9876543210",
                role=UserRole.CITIZEN
            ),
            User(
                email="priya@demo.com",
                password_hash=get_password_hash("demo123"),
                name="Priya Sharma",
                phone="9876543211",
                role=UserRole.CITIZEN
            ),
            # Officers
            User(
                email="officer@roads.gov.in",
                password_hash=get_password_hash("demo123"),
                name="Amit Verma",
                phone="9876543220",
                role=UserRole.OFFICER,
                department_id=dept_map["Roads & Transport"]
            ),
            User(
                email="officer@water.gov.in",
                password_hash=get_password_hash("demo123"),
                name="Sunita Devi",
                phone="9876543221",
                role=UserRole.OFFICER,
                department_id=dept_map["Water Supply"]
            ),
            User(
                email="officer@electricity.gov.in",
                password_hash=get_password_hash("demo123"),
                name="Ramesh Gupta",
                phone="9876543222",
                role=UserRole.OFFICER,
                department_id=dept_map["Electricity"]
            ),
            # Admin
            User(
                email="admin@samadhan.gov.in",
                password_hash=get_password_hash("demo123"),
                name="District Collector",
                phone="9876543200",
                role=UserRole.ADMIN
            ),
        ]
        
        for user in users:
            db.add(user)
        db.commit()
        print("✅ Users created")
        
        # Get user IDs
        citizen = db.query(User).filter(User.email == "citizen@demo.com").first()
        citizen2 = db.query(User).filter(User.email == "priya@demo.com").first()
        
        # ===== SAMPLE COMPLAINTS =====
        complaints = [
            Complaint(
                user_id=citizen.id,
                category="Roads & Transport",
                description="Huge pothole near the main market entrance causing accidents. Multiple vehicles have been damaged. Very dangerous especially at night.",
                location="Sector 4, Main Market",
                ward="Ward 12",
                priority=ComplaintPriority.HIGH,
                urgency_score=8,
                ai_confidence=92,
                status=ComplaintStatus.PENDING,
                department_id=dept_map["Roads & Transport"],
                upvotes=45,
                is_public=True
            ),
            Complaint(
                user_id=citizen2.id,
                category="Water Supply",
                description="Drinking water is muddy and has bad smell since last 2 days. Entire colony is affected. Children are falling sick.",
                location="Shivaji Nagar, Lane 3",
                ward="Ward 8",
                priority=ComplaintPriority.HIGH,
                urgency_score=9,
                ai_confidence=95,
                status=ComplaintStatus.IN_PROGRESS,
                department_id=dept_map["Water Supply"],
                upvotes=89,
                is_public=True
            ),
            Complaint(
                user_id=citizen.id,
                category="Electricity",
                description="Street light not working on MG Road for past one week. Area becomes very dark and unsafe at night.",
                location="MG Road, Block A",
                ward="Ward 5",
                priority=ComplaintPriority.MEDIUM,
                urgency_score=5,
                ai_confidence=88,
                status=ComplaintStatus.RESOLVED,
                department_id=dept_map["Electricity"],
                upvotes=12,
                is_public=True
            ),
            Complaint(
                user_id=citizen2.id,
                category="Sanitation & Waste",
                description="Garbage not collected for 5 days. Dustbins are overflowing. Bad smell spreading in the area. Mosquitoes breeding.",
                location="Gandhi Nagar, Main Street",
                ward="Ward 3",
                priority=ComplaintPriority.MEDIUM,
                urgency_score=6,
                ai_confidence=90,
                status=ComplaintStatus.PENDING,
                department_id=dept_map["Sanitation & Waste"],
                upvotes=34,
                is_public=True
            ),
            Complaint(
                user_id=citizen.id,
                category="Health & Safety",
                description="Open drainage near school creating health hazard. Children exposed to mosquitoes and bad smell daily.",
                location="Near Government School, Nehru Colony",
                ward="Ward 7",
                priority=ComplaintPriority.HIGH,
                urgency_score=8,
                ai_confidence=85,
                status=ComplaintStatus.IN_PROGRESS,
                department_id=dept_map["Health & Safety"],
                upvotes=67,
                is_public=True
            ),
        ]
        
        for complaint in complaints:
            db.add(complaint)
        db.commit()
        print("✅ Sample complaints created")
        
        # Add status logs for complaints
        for complaint in db.query(Complaint).all():
            log = ComplaintStatusLog(
                complaint_id=complaint.id,
                status=ComplaintStatus.PENDING,
                remarks="Complaint received and auto-classified by AI system",
                updated_by=None
            )
            db.add(log)
            
            if complaint.status == ComplaintStatus.IN_PROGRESS:
                log2 = ComplaintStatusLog(
                    complaint_id=complaint.id,
                    status=ComplaintStatus.IN_PROGRESS,
                    remarks="Assigned to field team for inspection",
                    updated_by=None
                )
                db.add(log2)
            
            if complaint.status == ComplaintStatus.RESOLVED:
                log2 = ComplaintStatusLog(
                    complaint_id=complaint.id,
                    status=ComplaintStatus.IN_PROGRESS,
                    remarks="Work order issued",
                    updated_by=None
                )
                log3 = ComplaintStatusLog(
                    complaint_id=complaint.id,
                    status=ComplaintStatus.RESOLVED,
                    remarks="Issue fixed. Street light replaced.",
                    updated_by=None
                )
                db.add(log2)
                db.add(log3)
        
        db.commit()
        print("✅ Status logs created")
        
        # ===== SLA RULES =====
        sla_rules = [
            SLARule(category=None, priority="High", resolution_hours=24, escalation_hours=12),
            SLARule(category=None, priority="Medium", resolution_hours=72, escalation_hours=48),
            SLARule(category=None, priority="Low", resolution_hours=168, escalation_hours=120),  # 7 days
            SLARule(category="Health & Safety", priority=None, resolution_hours=12, escalation_hours=6),
        ]
        
        for rule in sla_rules:
            db.add(rule)
        db.commit()
        print("✅ SLA rules created")
        
        print("\n" + "="*50)
        print("🎉 Database seeded successfully!")
        print("="*50)
        print("\n📋 DEMO CREDENTIALS:")
        print("-"*50)
        print("| Role     | Email                    | Password |")
        print("-"*50)
        print("| Citizen  | citizen@demo.com         | demo123  |")
        print("| Citizen  | priya@demo.com           | demo123  |")
        print("| Officer  | officer@roads.gov.in     | demo123  |")
        print("| Officer  | officer@water.gov.in     | demo123  |")
        print("| Admin    | admin@samadhan.gov.in    | demo123  |")
        print("-"*50)
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
