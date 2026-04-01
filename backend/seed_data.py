"""
Seed Data Script for Samadhan Setu (Firestore Version)
Creates demo departments, users, and sample complaints

Run: python seed_data.py
"""
import sys
import os
import secrets
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db
from app.models import (
    User, UserRole, Department, CategoryMapping, 
    Complaint, ComplaintStatus, ComplaintPriority, ComplaintStatusLog,
    SLARule
)
from app.auth import get_password_hash

def seed_database():
    """Seed the Firestore database with demo data"""
    try:
        # Get Firestore client
        db = get_db()
        
        # Check if already seeded (look for an admin user)
        admin_docs = list(db.collection('users').where('email', '==', 'admin@samadhan.gov.in').get())
        if admin_docs:
            print("Database already appears to be seeded. Skipping to avoid duplicates...")
            return
            
        print("🌱 Seeding Firestore database with demo data...")
        
        # ===== DEPARTMENTS =====
        departments_data = [
            Department(name="Roads & Transport", code="dept_roads", description="Handles road maintenance...", keywords=["road", "pothole"], contact_email="roads@samadhan.gov.in"),
            Department(name="Water Supply", code="dept_water", description="Water supply, drainage...", keywords=["water", "pipe"], contact_email="water@samadhan.gov.in"),
            Department(name="Electricity", code="dept_electricity", description="Power supply, streetlights...", keywords=["power", "electricity"], contact_email="electricity@samadhan.gov.in"),
            Department(name="Sanitation & Waste", code="dept_sanitation", description="Garbage collection...", keywords=["garbage", "trash"], contact_email="sanitation@samadhan.gov.in"),
            Department(name="Health & Safety", code="dept_health", description="Public health, hospitals...", keywords=["hospital", "health"], contact_email="health@samadhan.gov.in"),
        ]
        
        dept_map = {}
        for dept in departments_data:
            doc_ref = db.collection('departments').document()
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
            doc_ref = db.collection('category_mappings').document()
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
        
        citizen_id = None
        citizen2_id = None
        
        for user in users:
            doc_ref = db.collection('users').document()
            user.id = doc_ref.id
            doc_ref.set(user.to_firestore())
            if user.email == "citizen@demo.com": citizen_id = user.id
            if user.email == "priya@demo.com": citizen2_id = user.id
            
        print("✅ Users created")
        
        # ===== SAMPLE COMPLAINTS =====
        complaints = [
            Complaint(user_id=citizen_id, category="Roads & Transport", description="Huge pothole near main market.", location="Sector 4", ward="Ward 12", priority=ComplaintPriority.HIGH, status=ComplaintStatus.PENDING, department_id=dept_map["Roads & Transport"], is_public=True),
            Complaint(user_id=citizen2_id, category="Water Supply", description="Drinking water is muddy.", location="Shivaji Nagar", ward="Ward 8", priority=ComplaintPriority.HIGH, status=ComplaintStatus.IN_PROGRESS, department_id=dept_map["Water Supply"], is_public=True),
            Complaint(user_id=citizen_id, category="Electricity", description="Street light not working.", location="MG Road", ward="Ward 5", priority=ComplaintPriority.MEDIUM, status=ComplaintStatus.RESOLVED, department_id=dept_map["Electricity"], is_public=True),
        ]
        
        for complaint in complaints:
            doc_ref = db.collection('complaints').document()
            complaint.id = doc_ref.id
            doc_ref.set(complaint.to_firestore())
            
            # Add status logs
            log1 = ComplaintStatusLog(complaint_id=complaint.id, status=ComplaintStatus.PENDING, remarks="Auto-classified by AI")
            db.collection('complaint_status_logs').add(log1.to_firestore())
            
            if complaint.status in [ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED]:
                log2 = ComplaintStatusLog(complaint_id=complaint.id, status=ComplaintStatus.IN_PROGRESS, remarks="Assigned to field team")
                db.collection('complaint_status_logs').add(log2.to_firestore())
                
            if complaint.status == ComplaintStatus.RESOLVED:
                log3 = ComplaintStatusLog(complaint_id=complaint.id, status=ComplaintStatus.RESOLVED, remarks="Issue fixed.")
                db.collection('complaint_status_logs').add(log3.to_firestore())
                
        print("✅ Sample complaints & logs created")
        
        # ===== SLA RULES =====
        sla_rules = [
            SLARule(category=None, priority="High", resolution_hours=24, escalation_hours=12),
            SLARule(category=None, priority="Medium", resolution_hours=72, escalation_hours=48),
            SLARule(category=None, priority="Low", resolution_hours=168, escalation_hours=120),
            SLARule(category="Health & Safety", priority=None, resolution_hours=12, escalation_hours=6),
        ]
        
        for rule in sla_rules:
            doc_ref = db.collection('sla_rules').document()
            rule.id = doc_ref.id
            doc_ref.set(rule.to_firestore())
            
        print("✅ SLA rules created")
        
        print("\n" + "="*50)
        print("🎉 Firestore database seeded successfully!")
        print("="*50)
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        raise

if __name__ == "__main__":
    seed_database()
