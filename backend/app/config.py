import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Samadhan Setu"
    PROJECT_DESCRIPTION: str = "AI-Powered Grievance Redressal Platform"
    VERSION: str = "1.0.0"
    
    # Database - PostgreSQL (set DATABASE_URL env var for your connection)
    # Format: postgresql://user:password@host:port/dbname
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/samadhan_setu")
    
    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "samadhan-setu-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # CORS
    CORS_ORIGINS: list = ["*"]

settings = Settings()
