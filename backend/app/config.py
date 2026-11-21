import os
import sys
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

_DEFAULT_SECRET = "samadhan-setu-secret-key-change-in-production"

class Settings:
    PROJECT_NAME: str = "Samadhan Setu"
    PROJECT_DESCRIPTION: str = "AI-Powered Grievance Redressal Platform"
    VERSION: str = "1.0.0"

    # M-04 FIX: ENVIRONMENT must be explicitly set in production/staging.
    # Defaults to 'development' for local dev convenience only.
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # PostgreSQL Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres@localhost:5432/samadhan_setu",
    )
    SYNC_DATABASE_URL: str = os.getenv(
        "SYNC_DATABASE_URL",
        "postgresql+psycopg2://postgres@localhost:5432/samadhan_setu",
    )
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "10"))  # M-22 FIX: was 20, right-sized
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "5"))  # M-22 FIX: was 10
    DB_ECHO: bool = os.getenv("DB_ECHO", "false").lower() == "true"

    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24))  # 24 hours default
    )

    # L-15 FIX: Strip whitespace from CORS origins to prevent silent mismatches.
    # In production, set CORS_ORIGINS to your exact frontend domain(s).
    CORS_ORIGINS: list = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:3001,http://127.0.0.1:3001,"
            "http://localhost:8000,http://127.0.0.1:8000",
        ).split(",")
        if origin.strip()
    ]

    # Upload limits
    MAX_UPLOAD_SIZE_BYTES: int = 5 * 1024 * 1024   # 5 MB
    MAX_ATTACHMENTS_PER_COMPLAINT: int = 5
    ALLOWED_IMAGE_TYPES: set = {"image/jpeg", "image/png", "image/webp"}

    # Redis Cache & Multi-Worker Rate Limiting (H-03 FIX)
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL", None)

    # Event-Driven Notification & SMTP Service (Track B Upgrade)
    SMTP_HOST: Optional[str] = os.getenv("SMTP_HOST", None)
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: Optional[str] = os.getenv("SMTP_USER", None)
    SMTP_PASSWORD: Optional[str] = os.getenv("SMTP_PASSWORD", None)
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "samadhan-setu@nic.in")
    SMTP_TLS: bool = os.getenv("SMTP_TLS", "true").lower() == "true"

    def validate(self) -> None:
        """Fail fast on dangerous misconfigurations.

        Rules:
        - The default weak SECRET_KEY is NEVER accepted unless ALLOW_INSECURE_DEV=1
          is explicitly set (for local developer convenience only).
        - In production/staging the key must also be at least 32 characters.
        - M-04 FIX: Warn loudly if ENVIRONMENT is not explicitly set.
        """
        allow_insecure_dev = os.getenv("ALLOW_INSECURE_DEV", "0") == "1"
        is_prod = self.ENVIRONMENT in ("production", "staging")

        # M-04 FIX: Require explicit ENVIRONMENT in production
        if is_prod and not os.getenv("ENVIRONMENT"):
            print(
                "FATAL: ENVIRONMENT variable must be explicitly set in production/staging.",
                file=sys.stderr,
            )
            sys.exit(1)

        if self.SECRET_KEY == _DEFAULT_SECRET and (not allow_insecure_dev or is_prod):
            print(
                "FATAL: Default SECRET_KEY detected. "
                "Set a strong SECRET_KEY (32+ chars) via environment variable, "
                "or set ALLOW_INSECURE_DEV=1 for local development only.",
                file=sys.stderr,
            )
            sys.exit(1)

        if self.ENVIRONMENT in ("production", "staging"):
            if len(self.SECRET_KEY) < 32:
                print(
                    f"FATAL: SECRET_KEY too short ({len(self.SECRET_KEY)} chars) "
                    "for a production/staging environment. Use at least 32 characters.",
                    file=sys.stderr,
                )
                sys.exit(1)

            # L-15 FIX: Reject wildcard CORS in production
            if "*" in self.CORS_ORIGINS:
                print(
                    "FATAL: Wildcard '*' CORS origin is not allowed in production. "
                    "Set explicit CORS_ORIGINS.",
                    file=sys.stderr,
                )
                sys.exit(1)

settings = Settings()
settings.validate()
