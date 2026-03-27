from .auth import router as auth_router
from .citizens import router as citizens_router
from .departments import router as departments_router
from .admin import router as admin_router
from .assignments import router as assignments_router
from .analytics import router as analytics_router

__all__ = [
    "auth_router",
    "citizens_router", 
    "departments_router",
    "admin_router",
    "assignments_router",
    "analytics_router"
]
