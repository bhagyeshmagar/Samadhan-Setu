import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Samadhan Setu"
    PROJECT_DESCRIPTION: str = "AI-Powered Grievance Redressal Platform"
    VERSION: str = "1.0.0"
    
    # Firebase Database credentials
    FIREBASE_CREDENTIALS_PATH: str = os.getenv("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")    
    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "samadhan-setu-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]
settings = Settings()
