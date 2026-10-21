"""
database.py — PostgreSQL async session provider.
Replaces the old Firestore client. All routers use get_async_session().
"""
from .db.session import get_async_session, AsyncSessionLocal, async_engine

# Re-export the async session dependency so existing imports still work
get_db = get_async_session

__all__ = ["get_db", "get_async_session", "AsyncSessionLocal", "async_engine"]
