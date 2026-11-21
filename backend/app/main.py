"""
Samadhan Setu — AI-Powered Grievance Redressal Platform
Main FastAPI Application Entry Point (PostgreSQL edition)
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import settings
from .db.session import async_engine, get_async_session
from .routers import (
    auth_router, citizens_router, departments_router,
    admin_router, assignments_router, analytics_router, ai_insights_router,
    notifications_router, media_router,
)

_is_prod = settings.ENVIRONMENT.lower() in ("production", "prod")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify DB connectivity and start autonomous SLA daemon. Shutdown: cancel tasks and dispose connection pool."""
    # Quick connectivity check — will raise if PG is unreachable
    async with async_engine.connect() as conn:
        await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
    print("[OK] PostgreSQL connection verified.")

    import asyncio
    from app.services.sla_daemon import sla_background_loop
    sla_task = asyncio.create_task(sla_background_loop(300))

    yield

    # Graceful shutdown: cancel SLA background task and await its completion
    sla_task.cancel()
    try:
        await sla_task
    except (asyncio.CancelledError, Exception):
        pass

    # Graceful disposal of pooled database connections
    try:
        await async_engine.dispose()
    except (asyncio.CancelledError, Exception):
        pass
    print("[OK] PostgreSQL connection pool closed.")



app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
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

# ── Security Headers ─────────────────────────────────────────────────────────
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if _is_prod:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    return response

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import logging, traceback, uuid
    req_id = str(uuid.uuid4())
    logging.error(f"[{req_id}] Unhandled server error on {request.method} {request.url}: {exc}")
    traceback.print_exc()

    headers = {}
    origin = request.headers.get("origin")
    if origin and (origin in settings.CORS_ORIGINS or "*" in settings.CORS_ORIGINS):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        headers["Access-Control-Allow-Headers"] = "*"

    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. Please try again later.",
            "request_id": req_id,
        },
        headers=headers,
    )

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(citizens_router)
app.include_router(departments_router)
app.include_router(admin_router)
app.include_router(assignments_router)
app.include_router(analytics_router)
app.include_router(ai_insights_router)
app.include_router(notifications_router)
app.include_router(media_router)


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
async def health_check(session=Depends(get_async_session)):
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "disconnected", "detail": str(e)}
        )
    return {"status": "healthy", "database": "postgresql", "db_status": "connected"}


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
