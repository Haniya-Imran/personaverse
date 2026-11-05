"""Tiny per-client sliding-window rate limiter (no external services needed)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, limit: int, window_s: int):
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        fwd = request.headers.get("x-forwarded-for", "")
        client = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        now = time.time()
        with self._lock:
            q = self._hits[client]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "Too many requests. Wait a few minutes and try again."},
                )
            q.append(now)


upload_limit = RateLimiter(20, 600)
analysis_limit = RateLimiter(40, 600)
persona_limit = RateLimiter(30, 600)
