"""
Samadhan Setu - AI-Powered Grievance Redressal Platform
Main FastAPI Application Entry Point
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import auth_router, citizens_router, departments_router, admin_router, assignments_router, analytics_router

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for static file serving
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Include routers
app.include_router(auth_router)
app.include_router(citizens_router)
app.include_router(departments_router)
app.include_router(admin_router)
app.include_router(assignments_router)
app.include_router(analytics_router)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()


@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "name": settings.PROJECT_NAME,
        "tagline": "Bridging Citizens and Government through AI",
        "version": settings.VERSION,
        "docs": "/docs",
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


# API info endpoint
@app.get("/api")
async def api_info():
    """API overview"""
    return {
        "endpoints": {
            "auth": {
                "register": "POST /api/auth/register",
                "login": "POST /api/auth/login",
                "profile": "GET /api/auth/me"
            },
            "citizens": {
                "submit": "POST /api/complaints",
                "my_complaints": "GET /api/complaints/my",
                "public_feed": "GET /api/complaints/public",
                "upvote": "POST /api/complaints/{id}/upvote"
            },
            "department": {
                "complaints": "GET /api/department/complaints",
                "update_status": "PUT /api/department/complaints/{id}/status"
            },
            "admin": {
                "stats": "GET /api/admin/stats",
                "departments": "GET/POST /api/admin/departments",
                "mappings": "GET/POST /api/admin/mappings",
                "sla": "GET/POST /api/admin/sla"
            }
        }
    }
