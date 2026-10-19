import os
import sys
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_SECRET = "samadhan-setu-secret-key-change-in-production"

class Settings:
    PROJECT_NAME: str = "Samadhan Setu"
    PROJECT_DESCRIPTION: str = "AI-Powered Grievance Redressal Platform"
    VERSION: str = "1.0.0"

    # Environment: 'development' | 'staging' | 'production'
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Firebase Database credentials
    FIREBASE_CREDENTIALS_PATH: str = os.getenv(
        "FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json"
    )

    # PostgreSQL Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres@localhost:5432/samadhan_setu",
    )
    SYNC_DATABASE_URL: str = os.getenv(
        "SYNC_DATABASE_URL",
        "postgresql+psycopg2://postgres@localhost:5432/samadhan_setu",
    )
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "20"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    DB_ECHO: bool = os.getenv("DB_ECHO", "false").lower() == "true"

    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24))  # 24 hours default
    )

    # CORS — lock down in production via env var
    CORS_ORIGINS: list = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")

    # Upload limits
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024   # 5 MB
    MAX_ATTACHMENTS_PER_COMPLAINT: int = 5
    ALLOWED_IMAGE_TYPES: set = {"image/jpeg", "image/png", "image/webp"}

    def validate(self) -> None:
        """Fail fast on dangerous misconfigurations."""
        if self.ENVIRONMENT != "development" and self.SECRET_KEY == _DEFAULT_SECRET:
            print(
                "FATAL: Default SECRET_KEY detected in non-development environment. "
                "Set a strong SECRET_KEY via the environment variable and restart.",
                file=sys.stderr,
            )
            sys.exit(1)

settings = Settings()
settings.validate()

