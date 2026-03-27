"""
Database Migration Script for AI Features
==========================================
Adds new tables and columns required for:
- Feature 1: AI Auto-Assignment (teams, task_assignments, assignment_logs)
- Feature 2: AI Heatmap (latitude, longitude on complaints)

Run this script after the models are updated.
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine, text, inspect
from app.config import settings

def migrate_database():
    print(f"Connecting to database...")
    engine = create_engine(settings.DATABASE_URL)
    inspector = inspect(engine)
    
    existing_tables = inspector.get_table_names()
    print(f"Existing tables: {existing_tables}")
    
    with engine.connect() as conn:
        conn.begin()
        try:
            # ========== CREATE NEW TABLES ==========
            
            # Teams table
            if 'teams' not in existing_tables:
                print("Creating 'teams' table...")
                conn.execute(text("""
                    CREATE TABLE teams (
                        id SERIAL PRIMARY KEY,
                        department_id INTEGER REFERENCES departments(id) NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        code VARCHAR(50) UNIQUE NOT NULL,
                        daily_capacity INTEGER DEFAULT 10,
                        active_tasks INTEGER DEFAULT 0,
                        ward_coverage JSON,
                        head_officer_id INTEGER REFERENCES users(id),
                        contact_email VARCHAR(255),
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                print("✓ Created 'teams' table")
            else:
                print("'teams' table already exists")
            
            # Task Assignments table
            if 'task_assignments' not in existing_tables:
                print("Creating 'task_assignments' table...")
                conn.execute(text("""
                    CREATE TABLE task_assignments (
                        id SERIAL PRIMARY KEY,
                        complaint_id INTEGER REFERENCES complaints(id) NOT NULL,
                        team_id INTEGER REFERENCES teams(id) NOT NULL,
                        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        deadline TIMESTAMP NOT NULL,
                        load_score FLOAT,
                        reason TEXT,
                        is_reassigned BOOLEAN DEFAULT FALSE,
                        reassigned_from_team_id INTEGER REFERENCES teams(id),
                        reassignment_reason TEXT,
                        reassigned_at TIMESTAMP,
                        is_active BOOLEAN DEFAULT TRUE,
                        completed_at TIMESTAMP
                    )
                """))
                print("✓ Created 'task_assignments' table")
            else:
                print("'task_assignments' table already exists")
            
            # Assignment Logs table
            if 'assignment_logs' not in existing_tables:
                print("Creating 'assignment_logs' table...")
                conn.execute(text("""
                    CREATE TABLE assignment_logs (
                        id SERIAL PRIMARY KEY,
                        assignment_id INTEGER REFERENCES task_assignments(id) NOT NULL,
                        event_type VARCHAR(50) NOT NULL,
                        details JSON,
                        triggered_by VARCHAR(50),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                print("✓ Created 'assignment_logs' table")
            else:
                print("'assignment_logs' table already exists")
            
            # ========== ADD NEW COLUMNS TO COMPLAINTS ==========
            
            # Get existing columns in complaints table
            existing_columns = [col['name'] for col in inspector.get_columns('complaints')]
            print(f"Existing columns in 'complaints': {existing_columns}")
            
            if 'assigned_team_id' not in existing_columns:
                print("Adding 'assigned_team_id' column to complaints...")
                conn.execute(text("ALTER TABLE complaints ADD COLUMN assigned_team_id INTEGER REFERENCES teams(id)"))
                print("✓ Added 'assigned_team_id'")
            
            if 'latitude' not in existing_columns:
                print("Adding 'latitude' column to complaints...")
                conn.execute(text("ALTER TABLE complaints ADD COLUMN latitude FLOAT"))
                print("✓ Added 'latitude'")
            
            if 'longitude' not in existing_columns:
                print("Adding 'longitude' column to complaints...")
                conn.execute(text("ALTER TABLE complaints ADD COLUMN longitude FLOAT"))
                print("✓ Added 'longitude'")
            
            conn.commit()
            print("\n✅ Database migration completed successfully!")
            
        except Exception as e:
            print(f"\n❌ Error during migration: {e}")
            conn.rollback()
            raise


def seed_demo_teams():
    """Add demo teams for testing the assignment feature."""
    from sqlalchemy.orm import Session
    from app.database import SessionLocal
    from app.models import Department, Team
    
    db = SessionLocal()
    try:
        # Check if teams already exist
        existing_teams = db.query(Team).count()
        if existing_teams > 0:
            print(f"Teams already exist ({existing_teams} found). Skipping seeding.")
            return
        
        # Get departments
        departments = db.query(Department).all()
        
        for dept in departments:
            # Create 2 teams per department
            for i in range(1, 3):
                team = Team(
                    department_id=dept.id,
                    name=f"{dept.name} - Team {i}",
                    code=f"{dept.code}_team_{i}",
                    daily_capacity=10 if i == 1 else 8,
                    active_tasks=0,
                    ward_coverage=["Ward 1", "Ward 2"] if i == 1 else ["Ward 3", "Ward 4"],
                    is_active=True
                )
                db.add(team)
        
        db.commit()
        print(f"✅ Seeded {len(departments) * 2} demo teams")
        
    finally:
        db.close()


if __name__ == "__main__":
    migrate_database()
    seed_demo_teams()
