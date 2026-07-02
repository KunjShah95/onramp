"""Unit tests for the per-key circuit breaker state machine."""

from app.circuit_breaker import CircuitBreaker, CLOSED, OPEN, HALF_OPEN


def make_breaker(**overrides):
    defaults = dict(
        failure_threshold=3,
        window_seconds=120.0,
        cooldown_seconds=300.0,
        probe_timeout_seconds=30.0,
    )
    defaults.update(overrides)
    return CircuitBreaker(**defaults)


def test_starts_closed_and_allows():
    cb = make_breaker()
    assert cb.allow("p", now=0.0)
    assert cb.state("p") == CLOSED


def test_opens_after_threshold_failures_within_window():
    cb = make_breaker()
    cb.record_failure("p", now=0.0)
    cb.record_failure("p", now=1.0)
    assert cb.state("p") == CLOSED
    cb.record_failure("p", now=2.0)
    assert cb.state("p") == OPEN
    assert not cb.allow("p", now=3.0)


def test_failures_outside_window_do_not_count():
    cb = make_breaker(window_seconds=10.0)
    cb.record_failure("p", now=0.0)
    cb.record_failure("p", now=1.0)
    # Third failure arrives after the first two fell out of the window
    cb.record_failure("p", now=50.0)
    assert cb.state("p") == CLOSED


def test_half_open_probe_after_cooldown():
    cb = make_breaker(cooldown_seconds=300.0)
    for t in (0.0, 1.0, 2.0):
        cb.record_failure("p", now=t)
    assert not cb.allow("p", now=100.0)
    # Cooldown expired: exactly one probe allowed
    assert cb.allow("p", now=310.0)
    assert cb.state("p") == HALF_OPEN
    assert not cb.allow("p", now=311.0)


def test_probe_success_closes_circuit():
    cb = make_breaker()
    for t in (0.0, 1.0, 2.0):
        cb.record_failure("p", now=t)
    assert cb.allow("p", now=310.0)
    cb.record_success("p")
    assert cb.state("p") == CLOSED
    assert cb.allow("p", now=311.0)


def test_probe_failure_reopens_circuit():
    cb = make_breaker(cooldown_seconds=300.0)
    for t in (0.0, 1.0, 2.0):
        cb.record_failure("p", now=t)
    assert cb.allow("p", now=310.0)
    cb.record_failure("p", now=311.0)
    assert cb.state("p") == OPEN
    assert not cb.allow("p", now=400.0)
    # New cooldown counted from the probe failure
    assert cb.allow("p", now=612.0)


def test_stuck_probe_does_not_deadlock():
    cb = make_breaker(probe_timeout_seconds=30.0)
    for t in (0.0, 1.0, 2.0):
        cb.record_failure("p", now=t)
    assert cb.allow("p", now=310.0)  # probe never reports back
    assert not cb.allow("p", now=320.0)
    assert cb.allow("p", now=341.0)  # probe timeout elapsed → new probe allowed


def test_keys_are_independent():
    cb = make_breaker()
    for t in (0.0, 1.0, 2.0):
        cb.record_failure("a", now=t)
    assert not cb.allow("a", now=3.0)
    assert cb.allow("b", now=3.0)


def test_status_snapshot():
    cb = make_breaker()
    cb.record_failure("a", now=0.0)
    status = cb.status()
    assert status["a"]["state"] == CLOSED
    assert status["a"]["recent_failures"] >= 0
