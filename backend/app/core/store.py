"""In-memory session store with expiry.

Analyses are temporary by design: uploaded data and results live only in the
server process memory for SESSION_TTL_MINUTES and are never written to disk.
This keeps customer data out of persistent storage (see README > Data retention).
"""
from __future__ import annotations

import threading
import time
import uuid
from collections import OrderedDict
from typing import Any

from ..config import get_settings


class SessionStore:
    def __init__(self, ttl_seconds: int, max_items: int):
        self.ttl = ttl_seconds
        self.max_items = max_items
        self._items: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()
        self._lock = threading.Lock()

    def _purge(self) -> None:
        now = time.time()
        for key in [k for k, (t, _) in self._items.items() if now - t > self.ttl]:
            self._items.pop(key, None)
        while len(self._items) > self.max_items:
            self._items.popitem(last=False)

    def put(self, value: Any, key: str | None = None) -> str:
        key = key or uuid.uuid4().hex[:12]
        with self._lock:
            self._items[key] = (time.time(), value)
            self._items.move_to_end(key)
            self._purge()
        return key

    def get(self, key: str) -> Any | None:
        with self._lock:
            self._purge()
            item = self._items.get(key)
            if item is None:
                return None
            self._items[key] = (time.time(), item[1])
            self._items.move_to_end(key)
            return item[1]

    def delete(self, key: str) -> bool:
        with self._lock:
            return self._items.pop(key, None) is not None

    def values(self) -> list[Any]:
        with self._lock:
            self._purge()
            return [v for _, v in self._items.values()]


_s = get_settings()
datasets = SessionStore(_s.session_ttl_minutes * 60, _s.max_sessions)
analyses = SessionStore(_s.session_ttl_minutes * 60, _s.max_sessions)
