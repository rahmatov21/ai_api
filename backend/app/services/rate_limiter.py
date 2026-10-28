import time
import threading
from typing import Dict, List, Tuple

class InMemoryRateLimiter:
    """
    Sliding window rate limiter for API endpoints.
    Tracks timestamps of requests within a rolling 60-second window.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._requests: Dict[str, List[float]] = {}
        self._last_cleanup = time.time()

    def check_rate_limit(self, identifier: str, limit_per_minute: int) -> Tuple[bool, int]:
        """
        Check if request is allowed under limit_per_minute.
        Returns:
            (allowed: bool, retry_after_seconds: int)
        """
        now = time.time()
        window_start = now - 60.0

        with self._lock:
            # Periodic cleanup every 5 minutes to prevent memory leak
            if now - self._last_cleanup > 300.0:
                self._cleanup(now)
                self._last_cleanup = now

            timestamps = self._requests.get(identifier, [])
            # Filter out entries older than rolling 60 seconds
            valid_timestamps = [t for t in timestamps if t > window_start]

            if len(valid_timestamps) >= limit_per_minute:
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, int(60.0 - (now - oldest_in_window)))
                self._requests[identifier] = valid_timestamps
                return False, retry_after

            # Allow and register request
            valid_timestamps.append(now)
            self._requests[identifier] = valid_timestamps
            return True, 0

    def _cleanup(self, now: float):
        window_start = now - 60.0
        keys_to_delete = []
        for key, ts_list in self._requests.items():
            valid = [t for t in ts_list if t > window_start]
            if not valid:
                keys_to_delete.append(key)
            else:
                self._requests[key] = valid
        for key in keys_to_delete:
            del self._requests[key]

# Global singleton
rate_limiter = InMemoryRateLimiter()
