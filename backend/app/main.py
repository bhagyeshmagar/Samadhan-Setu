"""
Samadhan Setu — AI-Powered Grievance Redressal Platform
Main FastAPI Application Entry Point (PostgreSQL edition)
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db.session import async_engine
from .routers import (
    auth_router, citizens_router, departments_router,
    admin_router, assignments_router, analytics_router, ai_insights_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify DB connectivity. Shutdown: dispose connection pool."""
    # Quick connectivity check — will raise if PG is unreachable
    async with async_engine.connect() as conn:
        await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
    print("[OK] PostgreSQL connection verified.")
    yield
    await async_engine.dispose()
    print("[OK] PostgreSQL connection pool closed.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import logging, traceback
    logging.error(f"Unhandled server error on {request.method} {request.url}: {exc}")
    traceback.print_exc()
    origin = request.headers.get("origin") or "*"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    )

# ── Static uploads (local disk — Phase 4 will swap to S3) ────────────────────
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(citizens_router)
app.include_router(departments_router)
app.include_router(admin_router)
app.include_router(assignments_router)
app.include_router(analytics_router)
app.include_router(ai_insights_router)


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "tagline": "Bridging Citizens and Government through AI",
        "version": settings.VERSION,
        "database": "PostgreSQL",
        "docs": "/docs",
        "status": "operational",
    }


@app.get("/health", tags=["Root"])
async def health_check():
    return {"status": "healthy", "database": "postgresql"}


@app.get("/api", tags=["Root"])
async def api_info():
    return {
        "endpoints": {
            "auth": {
                "register": "POST /api/auth/register",
                "login": "POST /api/auth/login",
                "login_json": "POST /api/auth/login/json",
                "profile": "GET /api/auth/me",
            },
            "citizens": {
                "submit": "POST /api/complaints/",
                "my_complaints": "GET /api/complaints/my",
                "public_feed": "GET /api/complaints/public",
                "detail": "GET /api/complaints/{id}",
                "upvote": "POST /api/complaints/{id}/upvote",
                "upload": "POST /api/complaints/{id}/upload",
            },
            "department": {
                "complaints": "GET /api/department/complaints",
                "update_status": "PUT /api/department/complaints/{id}/status",
                "stats": "GET /api/department/stats",
            },
            "admin": {
                "stats": "GET /api/admin/stats",
                "departments": "GET/POST /api/admin/departments",
                "users": "GET /api/admin/users",
                "sla": "GET/POST /api/admin/sla",
            },
        }
    }
