"""Load & Performance Tests — benchmark key API endpoints under concurrent load.

These tests verify that:
1. Key endpoints respond within acceptable time thresholds
2. The app handles concurrent requests without errors
3. Response times degrade gracefully under load
4. No endpoints return 5xx under concurrent stress

Run:  python -m pytest tests/test_load_performance.py -v --timeout=120

Note: These tests use the FastAPI TestClient (synchronous), so they test
route handler performance in isolation (no network, no real DB). For
realistic network + DB load testing, use the scripts/load_test.py script
against a staging environment.
"""

import time
import statistics
import pytest
from fastapi.testclient import TestClient
from concurrent.futures import ThreadPoolExecutor, as_completed


@pytest.fixture(scope="module")
def client():
    """Import the FastAPI app and create a test client."""
    from app.main import app
    with TestClient(app) as c:
        yield c


# ═══════════════════════════════════════════════════════════════════════
# Baseline Performance Tests
# ═══════════════════════════════════════════════════════════════════════


class TestEndpointLatency:
    """Each endpoint should respond within acceptable time thresholds."""

    LATENCY_THRESHOLD_MS = 500  # p95 should be under 500ms

    @pytest.mark.parametrize("method,path,desc", [
        ("GET", "/", "Root"),
        ("GET", "/health", "Health"),
        ("GET", "/api/v1/billing/pricing", "Pricing"),
        ("GET", "/api/v1/ai/tiers", "AI tiers"),
        ("GET", "/api/v1/explore/health", "Explore health"),
    ])
    def test_endpoint_under_threshold(self, client, method, path, desc):
        """Measure a single request and assert it completes under threshold."""
        start = time.perf_counter()
        resp = client.request(method, path)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert resp.status_code < 500, (
            f"{desc} ({method} {path}) returned {resp.status_code}"
        )
        assert elapsed_ms < self.LATENCY_THRESHOLD_MS, (
            f"{desc} took {elapsed_ms:.1f}ms, threshold is {self.LATENCY_THRESHOLD_MS}ms"
        )


# ═══════════════════════════════════════════════════════════════════════
# Average Latency Over Multiple Calls
# ═══════════════════════════════════════════════════════════════════════


class TestAverageLatency:
    """Average latency across multiple calls should be well under threshold."""

    SAMPLES = 20
    AVG_THRESHOLD_MS = 300
    P95_THRESHOLD_MS = 500

    def _sample_endpoint(self, client, method: str, path: str) -> list:
        """Make SAMPLES requests and return all elapsed times in ms."""
        times = []
        for _ in range(self.SAMPLES):
            start = time.perf_counter()
            resp = client.request(method, path)
            elapsed_ms = (time.perf_counter() - start) * 1000
            assert resp.status_code < 500, f"{method} {path} returned {resp.status_code}"
            times.append(elapsed_ms)
        return times

    def test_root_average_latency(self, client):
        times = self._sample_endpoint(client, "GET", "/")
        avg = statistics.mean(times)
        p95 = statistics.quantiles(times, n=20)[-1] if len(times) >= 20 else max(times)
        assert avg < self.AVG_THRESHOLD_MS, (
            f"Avg {avg:.1f}ms exceeds threshold {self.AVG_THRESHOLD_MS}ms"
        )
        assert p95 < self.P95_THRESHOLD_MS, (
            f"p95 {p95:.1f}ms exceeds threshold {self.P95_THRESHOLD_MS}ms"
        )

    def test_health_average_latency(self, client):
        times = self._sample_endpoint(client, "GET", "/health")
        avg = statistics.mean(times)
        assert avg < self.AVG_THRESHOLD_MS, (
            f"Avg {avg:.1f}ms exceeds threshold {self.AVG_THRESHOLD_MS}ms"
        )

    def test_pricing_average_latency(self, client):
        times = self._sample_endpoint(client, "GET", "/api/v1/billing/pricing")
        avg = statistics.mean(times)
        assert avg < self.AVG_THRESHOLD_MS, (
            f"Avg {avg:.1f}ms exceeds threshold {self.AVG_THRESHOLD_MS}ms"
        )


# ═══════════════════════════════════════════════════════════════════════
# Concurrent Load Tests
# ═══════════════════════════════════════════════════════════════════════


class TestConcurrentLoad:
    """Simulate concurrent users hitting the API simultaneously."""

    CONCURRENT_USERS = 10
    REQUESTS_PER_USER = 5
    LOAD_TIMEOUT_S = 30

    def _make_requests(self, client, method: str, path: str, count: int) -> list:
        """Make `count` sequential requests and return elapsed times."""
        times = []
        for _ in range(count):
            start = time.perf_counter()
            resp = client.request(method, path)
            elapsed_ms = (time.perf_counter() - start) * 1000
            assert resp.status_code < 500, f"{method} {path} returned {resp.status_code}"
            times.append(elapsed_ms)
        return times

    def test_concurrent_root(self, client):
        """10 concurrent users each make 5 requests to /."""
        errors = []
        all_times = []

        with ThreadPoolExecutor(max_workers=self.CONCURRENT_USERS) as pool:
            futures = [
                pool.submit(self._make_requests, client, "GET", "/", self.REQUESTS_PER_USER)
                for _ in range(self.CONCURRENT_USERS)
            ]
            for future in as_completed(futures, timeout=self.LOAD_TIMEOUT_S):
                try:
                    times = future.result()
                    all_times.extend(times)
                except Exception as e:
                    errors.append(str(e))

        assert not errors, f"Concurrent load errors: {errors[:3]}"
        assert len(all_times) == self.CONCURRENT_USERS * self.REQUESTS_PER_USER, (
            f"Expected {self.CONCURRENT_USERS * self.REQUESTS_PER_USER} results, got {len(all_times)}"
        )

        avg = statistics.mean(all_times)
        p95 = statistics.quantiles(all_times, n=20)[-1] if len(all_times) >= 20 else max(all_times)
        p99 = statistics.quantiles(all_times, n=100)[-1] if len(all_times) >= 100 else max(all_times)

        # Log performance stats (can be parsed in CI)
        print(f"\n  [PERF] GET / — {len(all_times)} requests across {self.CONCURRENT_USERS} concurrent users")
        print(f"  [PERF]   avg={avg:.1f}ms  p95={p95:.1f}ms  p99={p99:.1f}ms")

        assert p95 < 1000, f"p95 {p95:.1f}ms exceeds 1000ms under concurrent load"

    def test_concurrent_health(self, client):
        """10 concurrent users hit /health simultaneously."""
        all_times = []

        with ThreadPoolExecutor(max_workers=self.CONCURRENT_USERS) as pool:
            futures = [
                pool.submit(self._make_requests, client, "GET", "/health", self.REQUESTS_PER_USER)
                for _ in range(self.CONCURRENT_USERS)
            ]
            for future in as_completed(futures, timeout=self.LOAD_TIMEOUT_S):
                times = future.result()
                all_times.extend(times)

        avg = statistics.mean(all_times)
        p95 = statistics.quantiles(all_times, n=20)[-1] if len(all_times) >= 20 else max(all_times)

        print(f"\n  [PERF] GET /health — {len(all_times)} requests across {self.CONCURRENT_USERS} concurrent users")
        print(f"  [PERF]   avg={avg:.1f}ms  p95={p95:.1f}ms")

        assert p95 < 1000, f"p95 {p95:.1f}ms exceeds 1000ms under concurrent load"

    def test_mixed_concurrent_load(self, client):
        """Mix of different endpoints under concurrent load."""
        endpoints = [
            ("GET", "/"),
            ("GET", "/health"),
            ("GET", "/api/v1/billing/pricing"),
            ("GET", "/api/v1/ai/tiers"),
        ]
        errors = []

        def _hit_endpoint(args):
            method, path = args
            times = []
            for _ in range(3):
                start = time.perf_counter()
                resp = client.request(method, path)
                elapsed = (time.perf_counter() - start) * 1000
                assert resp.status_code < 500, f"{method} {path} returned {resp.status_code}"
                times.append(elapsed)
            return times

        with ThreadPoolExecutor(max_workers=len(endpoints)) as pool:
            futures = [
                pool.submit(_hit_endpoint, (method, path))
                for method, path in endpoints
            ]
            for future in as_completed(futures, timeout=15):
                try:
                    future.result()
                except Exception as e:
                    errors.append(str(e))

        assert not errors, f"Mixed load errors: {errors[:3]}"
        print(f"\n  [PERF] Mixed endpoints: {len(endpoints)} concurrent, all passed")


# ═══════════════════════════════════════════════════════════════════════
# Stress Test — Error Rate Under Load
# ═══════════════════════════════════════════════════════════════════════


class TestStressErrorRate:
    """Under moderate stress, the error rate should be zero."""

    TOTAL_REQUESTS = 100
    MAX_WORKERS = 20

    def test_zero_error_rate_under_stress(self, client):
        """100 rapid requests across 20 threads should all succeed."""
        errors = []
        successes = 0

        def _request():
            nonlocal successes
            resp = client.get("/")
            if resp.status_code >= 500:
                return False
            successes += 1
            return True

        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as pool:
            futures = [pool.submit(_request) for _ in range(self.TOTAL_REQUESTS)]
            for future in as_completed(futures, timeout=30):
                try:
                    if not future.result():
                        errors.append("5xx response")
                except Exception as e:
                    errors.append(str(e))

        error_rate = len(errors) / self.TOTAL_REQUESTS * 100
        print(f"\n  [STRESS] {self.TOTAL_REQUESTS} requests — {successes} success, {len(errors)} errors ({error_rate:.1f}%)")

        assert error_rate == 0, (
            f"Error rate {error_rate:.1f}% ({len(errors)} errors out of {self.TOTAL_REQUESTS})"
        )
