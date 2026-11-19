"""
In-memory Rate Limiter for Samadhan Setu
Provides sliding-window rate limiting for authentication and grievance lodging.
Thread-safe and async-friendly without external dependencies.

H-03 FIX:
- Added periodic TTL cleanup of expired entries to prevent unbounded memory growth.
- Added rate limiting for complaint submission (not just login).
- X-Forwarded-For is only trusted when the immediate peer IP is in TRUSTED_PROXY_IPS.
- Per-email lockouts keyed by IP+email pair to prevent cross-user DoS.
"""
import os
import time
from collections import defaultdict, deque
from typing import Optional, Set
from fastapi import Request, HTTPException, status

# H-03 FIX: Only trust forwarded headers from known reverse proxies
TRUSTED_PROXY_IPS: Set[str] = set(
    ip.strip()
    for ip in os.getenv("TRUSTED_PROXY_IPS", "127.0.0.1,::1").split(",")
    if ip.strip()
)

# Maximum unique keys before triggering a full cleanup sweep
_MAX_KEYS_BEFORE_CLEANUP = 50_000


class SlidingWindowRateLimiter:
    def __init__(self):
        # Maps key -> deque of float timestamps
        self._records: dict[str, deque] = defaultdict(deque)
        self._last_cleanup = time.time()

    def _maybe_cleanup(self):
        """H-03 FIX: Periodically evict entries whose entire window has expired."""
        now = time.time()
        # Run cleanup every 5 minutes or when key count gets too large
        if now - self._last_cleanup < 300 and len(self._records) < _MAX_KEYS_BEFORE_CLEANUP:
            return
        self._last_cleanup = now
        expired_keys = [
            k for k, q in self._records.items()
            if not q or q[-1] < now - 3600  # Evict keys idle for > 1 hour
        ]
        for k in expired_keys:
            del self._records[k]

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
        self._maybe_cleanup()
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
    """
    Extract client IP, only trusting X-Forwarded-For when the direct
    peer is a known trusted reverse proxy.
    """
    peer_ip = request.client.host if request.client else "127.0.0.1"

    # H-03 FIX: Only trust forwarded headers from known reverse proxies
    if peer_ip in TRUSTED_PROXY_IPS:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

    return peer_ip


def limit_login_attempts(request: Request, email: Optional[str] = None):
    """Limit login attempts: 10 per minute per IP, 5 per minute per IP+email pair."""
    ip = get_client_ip(request)
    rate_limiter.enforce(
        f"login_ip:{ip}",
        max_requests=10,
        window_seconds=60,
        detail="Too many login attempts from this network. Please wait a minute.",
    )
    if email:
        # H-03 FIX: Key by IP+email pair to prevent cross-user DoS via email lockout
        rate_limiter.enforce(
            f"login_pair:{ip}:{email.lower().strip()}",
            max_requests=5,
            window_seconds=60,
            detail="Too many failed login attempts. Please wait a minute.",
        )


def limit_complaint_submission(request: Request, user_id: str):
    """H-03 FIX: Limit complaint submissions: 10 per hour per user, 20 per hour per IP."""
    ip = get_client_ip(request)
    rate_limiter.enforce(
        f"complaint_ip:{ip}",
        max_requests=20,
        window_seconds=3600,
        detail="Too many complaints from this network. Please try again later.",
    )
    rate_limiter.enforce(
        f"complaint_user:{user_id}",
        max_requests=10,
        window_seconds=3600,
        detail="Submission limit reached. You can file up to 10 complaints per hour.",
    )
