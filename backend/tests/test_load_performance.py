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


# ═══════════════════════════════════════════════════════════════════════
# Extended Load Suite — heavier concurrency, sustained bursts, throughput
# ═══════════════════════════════════════════════════════════════════════
# These mirror the k6 scenarios (k6-load-test.js) but run in-process, so
# they exercise the route handlers + middleware without network or DB.
# Run the k6 suite against a deployed environment for end-to-end numbers.


class TestHighConcurrencyLoad:
    """25 concurrent users hammering mixed endpoints — p95 stays bounded."""

    CONCURRENT = 25
    REQUESTS_PER_USER = 10
    P95_THRESHOLD_MS = 1500
    LOAD_TIMEOUT_S = 60

    ENDPOINTS = [
        ("GET", "/"),
        ("GET", "/health"),
        ("GET", "/api/v1/billing/pricing"),
        ("GET", "/api/v1/ai/tiers"),
        ("GET", "/api/v1/explore/health"),
    ]

    def test_high_concurrency_mixed_load(self, client):
        """25 workers × 10 requests across 5 endpoints — no 5xx, p95 bounded."""
        errors = []
        all_times = []

        def _worker(endpoint):
            method, path = endpoint
            times = []
            for _ in range(self.REQUESTS_PER_USER):
                start = time.perf_counter()
                resp = client.request(method, path)
                elapsed = (time.perf_counter() - start) * 1000
                if resp.status_code >= 500:
                    errors.append(f"{method} {path} -> {resp.status_code}")
                    continue
                times.append(elapsed)
            return times

        with ThreadPoolExecutor(max_workers=self.CONCURRENT) as pool:
            futures = [
                pool.submit(_worker, self.ENDPOINTS[i % len(self.ENDPOINTS)])
                for i in range(self.CONCURRENT)
            ]
            for future in as_completed(futures, timeout=self.LOAD_TIMEOUT_S):
                try:
                    all_times.extend(future.result())
                except Exception as e:
                    errors.append(str(e))

        p95 = statistics.quantiles(all_times, n=20)[-1] if len(all_times) >= 20 else max(all_times)
        print(f"\n  [LOAD-HI] {len(all_times)} requests, {self.CONCURRENT} workers, 5 endpoints")
        print(f"  [LOAD-HI]   avg={statistics.mean(all_times):.1f}ms  p95={p95:.1f}ms")

        assert not errors, f"High-concurrency errors: {errors[:3]}"
        assert p95 < self.P95_THRESHOLD_MS, (
            f"p95 {p95:.1f}ms exceeds {self.P95_THRESHOLD_MS}ms under 25-way concurrency"
        )


class TestSustainedBurst:
    """A sustained rapid-fire burst — mini soak — stays error-free."""

    WAVES = 10
    PER_WAVE = 30
    WAVE_DELAY_S = 0.05
    P95_THRESHOLD_MS = 2000

    def test_sustained_burst_no_errors(self, client):
        """300 requests in 10 waves across ~5s — zero 5xx."""
        all_times = []
        errors = []

        for _ in range(self.WAVES):
            with ThreadPoolExecutor(max_workers=10) as pool:
                futures = [
                    pool.submit(client.get, "/")
                    for _ in range(self.PER_WAVE)
                ]
                for f in as_completed(futures, timeout=15):
                    try:
                        start = time.perf_counter()
                        resp = f.result()
                        all_times.append((time.perf_counter() - start) * 1000)
                        if resp.status_code >= 500:
                            errors.append(str(resp.status_code))
                    except Exception as e:
                        errors.append(str(e))
            time.sleep(self.WAVE_DELAY_S)

        p95 = statistics.quantiles(all_times, n=20)[-1] if len(all_times) >= 20 else max(all_times)
        print(f"\n  [SOAK-MINI] {len(all_times)} requests in {self.WAVES} waves")
        print(f"  [SOAK-MINI]   avg={statistics.mean(all_times):.1f}ms  p95={p95:.1f}ms  errors={len(errors)}")

        assert not errors, f"Sustained burst produced {len(errors)} errors: {errors[:3]}"
        assert p95 < self.P95_THRESHOLD_MS, (
            f"p95 {p95:.1f}ms exceeds {self.P95_THRESHOLD_MS}ms during sustained burst"
        )


class TestThroughputStability:
    """Request throughput must not collapse as concurrency increases.

    In-process TestClient is GIL-bound (a single Python process), so threads
    do not scale linearly — the honest scaling signal comes from the k6 suite
    against a real uvicorn server. This test guards against *pathological*
    regressions: a serializing lock, O(n²) contention, or deadlock. The bar is
    deliberately low (35% of low-concurrency throughput, plus an absolute
    floor) to stay robust on noisy dev machines.
    """

    LOW_WORKERS = 4
    HIGH_WORKERS = 16
    REQUESTS = 80
    MIN_RATIO = 0.35
    MIN_REQ_S = 15.0

    @staticmethod
    def _throughput(client, workers: int, requests: int) -> float:
        """Run `requests` GET / calls across `workers` threads, return req/s."""
        start = time.perf_counter()
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(lambda _: client.get("/"), range(requests)))
        elapsed = time.perf_counter() - start
        return requests / elapsed

    def test_throughput_does_not_collapse(self, client):
        """16-worker throughput stays above a floor and a fraction of 4-worker."""
        low = self._throughput(client, self.LOW_WORKERS, self.REQUESTS)
        high = self._throughput(client, self.HIGH_WORKERS, self.REQUESTS)
        ratio = high / low if low > 0 else 0
        print(f"\n  [THROUGHPUT] {self.LOW_WORKERS} workers: {low:.0f} req/s   "
              f"{self.HIGH_WORKERS} workers: {high:.0f} req/s   ratio={ratio:.2f}")

        assert high > self.MIN_REQ_S, (
            f"Throughput collapsed to {high:.0f} req/s (< {self.MIN_REQ_S:.0f}) under concurrency"
        )
        assert ratio > self.MIN_RATIO, (
            f"Throughput degraded {ratio:.2f}x (16 workers vs 4) — expected > {self.MIN_RATIO}x"
        )
