"""
Script to create the PostgreSQL database for Samadhan Setu
"""
import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import os
from dotenv import load_dotenv

load_dotenv()

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:PgPass123@localhost:5432/samadhan_setu")

# Parse the connection string
# Format: postgresql://user:password@host:port/dbname
parts = DATABASE_URL.replace("postgresql://", "").split("@")
user_pass = parts[0].split(":")
user = user_pass[0]
password = user_pass[1] if len(user_pass) > 1 else ""

host_port_db = parts[1].split("/")
host_port = host_port_db[0].split(":")
host = host_port[0]
port = host_port[1] if len(host_port) > 1 else "5432"
dbname = host_port_db[1]

print(f"Attempting to connect to PostgreSQL...")
print(f"Host: {host}")
print(f"Port: {port}")
print(f"User: {user}")
print(f"Database to create: {dbname}")

try:
    # Connect to PostgreSQL server (to the default 'postgres' database)
    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database="postgres"
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    
    cursor = conn.cursor()
    
    # Check if database exists
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,))
    exists = cursor.fetchone()
    
    if exists:
        print(f"✓ Database '{dbname}' already exists!")
    else:
        # Create database
        cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
        print(f"✓ Database '{dbname}' created successfully!")
    
    cursor.close()
    conn.close()
    print("\n✓ Database setup complete!")
    
except psycopg2.OperationalError as e:
    print(f"\n✗ Connection failed: {e}")
    print("\nPossible issues:")
    print("1. PostgreSQL server is not running")
    print("2. Incorrect password in .env file")
    print("3. PostgreSQL is not configured to accept password authentication")
    print("\nTo fix:")
    print("- Check if PostgreSQL service is running")
    print("- Verify the password in your .env file")
    print("- Check pg_hba.conf for authentication settings")
    exit(1)
except Exception as e:
    print(f"\n✗ Error: {e}")
    exit(1)
