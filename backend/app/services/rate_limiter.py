"""
In-memory Rate Limiter for Samadhan Setu
Provides sliding-window rate limiting for authentication and grievance lodging.
Thread-safe and async-friendly without external dependencies.
"""
import time
from collections import defaultdict, deque
from typing import Optional
from fastapi import Request, HTTPException, status

class SlidingWindowRateLimiter:
    def __init__(self):
        # Maps key -> deque of float timestamps
        self._records = defaultdict(deque)

    def check_rate_limit(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """
        Check if an action is within allowed rate limits.
        Returns True if allowed, False if limit exceeded.
        """
        now = time.time()
        cutoff = now - window_seconds
        queue = self._records[key]

        # Prune expired timestamps
        while queue and queue[0] < cutoff:
            queue.popleft()

        if len(queue) >= max_requests:
            return False

        queue.append(now)
        return True

    def enforce(self, key: str, max_requests: int, window_seconds: int, detail: str = "Too many requests. Please try again later."):
        """Enforces rate limit, raising HTTP 429 if exceeded."""
        if not self.check_rate_limit(key, max_requests, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=detail,
                headers={"Retry-After": str(window_seconds)},
            )

rate_limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP handling forward headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def limit_login_attempts(request: Request, email: Optional[str] = None):
    """Limit login attempts: 10 per minute per IP, 5 per minute per email."""
    ip = get_client_ip(request)
    rate_limiter.enforce(
        f"login_ip:{ip}",
        max_requests=10,
        window_seconds=60,
        detail="Too many login attempts from this network. Please wait a minute.",
    )
    if email:
        rate_limiter.enforce(
            f"login_email:{email.lower().strip()}",
            max_requests=5,
            window_seconds=60,
            detail="Too many failed login attempts for this account. Please wait a minute.",
        )
