"""
Script to verify Firestore database connection for Samadhan Setu.
Firestore is schemaless, so this script just ensures the credentials
are valid and the client can connect to the project.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db

try:
    print("Initializing Firebase Admin SDK...")
    # get_db returns the client directly
    db = get_db()
    
    # Perform a simple read test
    print("Testing connection to Firestore...")
    collections = db.collections()
    collection_names = [coll.id for coll in collections]
    
    print("\n✓ Successfully connected to Firestore!")
    print(f"✓ Found {len(collection_names)} existing collections.")
    if collection_names:
        print("  - " + "\n  - ".join(collection_names))
        
    print("\n✓ Database setup complete! No schema creation required for Firestore.")

except Exception as e:
    print(f"\n✗ Error connecting to Firestore: {e}")
    print("Please ensure your 'firebase-credentials.json' is valid and placed in the 'backend' folder.")
    exit(1)
