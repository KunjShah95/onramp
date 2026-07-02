"""Per-key circuit breaker for external dependencies (LLM providers, APIs).

State machine per key:

    CLOSED ──(threshold failures in window)──► OPEN
    OPEN ──(cooldown expires)──► HALF_OPEN (one probe allowed)
    HALF_OPEN ──probe success──► CLOSED
    HALF_OPEN ──probe failure──► OPEN (new cooldown)

The breaker only tracks state; callers decide what a failure is and must
call record_success/record_failure after every allowed attempt.
"""

import time
import threading

CLOSED = "closed"
OPEN = "open"
HALF_OPEN = "half_open"


class _KeyState:
    __slots__ = ("state", "failure_times", "opened_until", "probe_started")

    def __init__(self):
        self.state = CLOSED
        self.failure_times: list[float] = []
        self.opened_until = 0.0
        self.probe_started = 0.0


class CircuitBreaker:
    """Thread-safe circuit breaker keyed by an arbitrary string (e.g. provider name).

    Args:
        failure_threshold: consecutive-window failures before the circuit opens.
        window_seconds: sliding window in which failures are counted.
        cooldown_seconds: how long an open circuit rejects calls before probing.
        probe_timeout_seconds: if a half-open probe never reports back (caller
            crashed), allow a new probe after this long instead of deadlocking.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        window_seconds: float = 120.0,
        cooldown_seconds: float = 300.0,
        probe_timeout_seconds: float = 30.0,
    ):
        self.failure_threshold = failure_threshold
        self.window_seconds = window_seconds
        self.cooldown_seconds = cooldown_seconds
        self.probe_timeout_seconds = probe_timeout_seconds
        self._states: dict[str, _KeyState] = {}
        self._lock = threading.Lock()

    def _get(self, key: str) -> _KeyState:
        if key not in self._states:
            self._states[key] = _KeyState()
        return self._states[key]

    def allow(self, key: str, now: float | None = None) -> bool:
        """Whether a call to `key` may proceed right now."""
        now = time.monotonic() if now is None else now
        with self._lock:
            st = self._get(key)
            if st.state == CLOSED:
                return True
            if st.state == OPEN:
                if now < st.opened_until:
                    return False
                st.state = HALF_OPEN
                st.probe_started = now
                return True
            # HALF_OPEN: one probe at a time, but don't deadlock if it vanished
            if now - st.probe_started >= self.probe_timeout_seconds:
                st.probe_started = now
                return True
            return False

    def record_success(self, key: str) -> None:
        with self._lock:
            st = self._get(key)
            st.state = CLOSED
            st.failure_times.clear()
            st.opened_until = 0.0

    def record_failure(self, key: str, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            st = self._get(key)
            if st.state == HALF_OPEN:
                # Probe failed: straight back to OPEN for another cooldown.
                st.state = OPEN
                st.opened_until = now + self.cooldown_seconds
                return
            st.failure_times = [
                t for t in st.failure_times if now - t < self.window_seconds
            ]
            st.failure_times.append(now)
            if len(st.failure_times) >= self.failure_threshold:
                st.state = OPEN
                st.opened_until = now + self.cooldown_seconds
                st.failure_times.clear()

    def state(self, key: str) -> str:
        with self._lock:
            return self._get(key).state

    def status(self) -> dict:
        """Snapshot of all tracked keys, for health/debug endpoints."""
        now = time.monotonic()
        with self._lock:
            return {
                key: {
                    "state": st.state,
                    "recent_failures": len(
                        [t for t in st.failure_times if now - t < self.window_seconds]
                    ),
                    "retry_in_seconds": (
                        max(0, round(st.opened_until - now)) if st.state == OPEN else 0
                    ),
                }
                for key, st in self._states.items()
            }
