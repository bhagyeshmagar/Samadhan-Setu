"""
Simple script to test PostgreSQL connection with different methods
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:PgPass123@localhost:5432/samadhan_setu")

# Parse the connection string
parts = DATABASE_URL.replace("postgresql://", "").split("@")
user_pass = parts[0].split(":")
user = user_pass[0]
password = user_pass[1] if len(user_pass) > 1 else ""

host_port_db = parts[1].split("/")
host_port = host_port_db[0].split(":")
host = host_port[0]
port = host_port[1] if len(host_port) > 1 else "5432"

print("Testing PostgreSQL connection...")
print(f"Host: {host}:{port}")
print(f"User: {user}")
print(f"Password: {'*' * len(password)}")
print()

# Try to connect
try:
    conn = psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database="postgres"
    )
    print("✓ Connection successful!")
    conn.close()
except Exception as e:
    print(f"✗ Connection failed!")
    print(f"Error: {e}")
    print()
    print("Common solutions:")
    print("1. Reset PostgreSQL password:")
    print("   - Open pgAdmin or use: ALTER USER postgres PASSWORD 'your_new_password';")
    print("2. Update .env file with correct password")
    print("3. Use Windows authentication (if on Windows)")
