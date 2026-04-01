import os
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from .config import settings

# Global Firestore client
db_client = None

def init_db():
    """Initialize Firebase Admin SDK and Firestore client"""
    global db_client
    
    # Avoid initializing multiple times during reloads
    if not firebase_admin._apps:
        cred_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), settings.FIREBASE_CREDENTIALS_PATH)
        
        if not os.path.exists(cred_path):
            raise FileNotFoundError(f"Firebase credentials not found at {cred_path}. Please place your service account json file there.")
        
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("Firebase Admin initialized successfully.")
    
    if db_client is None:
        db_client = firestore.client()
        print("Firestore client initialized successfully.")

def get_db():
    """Dependency: returns the Firestore client."""
    if db_client is None:
        init_db()
    return db_client
