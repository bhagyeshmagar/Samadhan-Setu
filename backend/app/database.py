"""
database.py — PostgreSQL async session provider.
Replaces the old Firestore client. All routers use get_async_session().
"""
from .db.session import get_async_session, AsyncSessionLocal, async_engine

# Re-export the async session dependency so existing imports still work
get_db = get_async_session

def init_db():
    """No-op stub for backward compatibility with tests/scripts."""
    pass

__all__ = ["get_db", "get_async_session", "AsyncSessionLocal", "async_engine", "init_db"]
