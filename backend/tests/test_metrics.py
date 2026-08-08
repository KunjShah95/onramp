"""Tests for the dependency-free Prometheus metrics registry + /metrics endpoint."""

import os
os.environ.setdefault("STORAGE_BACKEND", "memory")

from fastapi.testclient import TestClient

from app import metrics
from app.main import app

import pytest


@pytest.fixture(autouse=True)
def _reset_registry():
    """Keep metric counters deterministic between tests."""
    for metric in metrics.REGISTRY.collect():
        if hasattr(metric, "_values"):
            metric._values.clear()
        if isinstance(metric, metrics.Histogram):
            metric._counts.clear()
            metric._sums.clear()
            metric._counts_total.clear()
    yield


def _text():
    return metrics.generate_metrics()


def test_counter_inc_and_exposition():
    c = metrics.Counter("test_counter_total", "doc")
    c.inc()
    c.inc(2)
    text = metrics.exposition([c])
    assert "# HELP test_counter_total doc" in text
    assert "# TYPE test_counter_total counter" in text
    assert "test_counter_total 3" in text


def test_counter_labels_sorted():
    c = metrics.Counter("test_labels_total", "doc")
    c.inc(labels={"b": "2", "a": "1"})
    text = metrics.exposition([c])
    # Labels must be rendered in alphabetical order.
    assert 'test_labels_total{a="1",b="2"} 1' in text


def test_label_value_escaping():
    c = metrics.Counter("test_escape_total", "doc")
    c.inc(labels={"route": '/api/v1/repos/{"owner":"x"}'})
    text = metrics.exposition([c])
    assert '\\"' in text


def test_gauge_set_inc_dec():
    g = metrics.Gauge("test_gauge", "doc")
    g.set(5)
    g.inc()
    g.dec(2)
    text = metrics.exposition([g])
    assert "test_gauge 4" in text


def test_histogram_buckets_sum_count():
    h = metrics.Histogram("test_hist_seconds", "doc")
    h.observe(0.01)
    h.observe(0.5)
    h.observe(2.0)
    text = metrics.exposition([h])
    # Count must equal number of observations.
    assert "test_hist_seconds_count 3" in text
    assert "test_hist_seconds_sum 2.51" in text
    # Cumulative buckets: le="0.005" -> 0, le="0.01" -> 1, le="+Inf" -> 3
    assert 'test_hist_seconds_bucket{le="0.005"} 0' in text
    assert 'test_hist_seconds_bucket{le="0.01"} 1' in text
    assert 'test_hist_seconds_bucket{le="+Inf"} 3' in text


def test_duplicate_name_different_type_raises():
    metrics.register(metrics.Counter("test_dup_total", "doc"))
    with pytest.raises(ValueError):
        metrics.register(metrics.Gauge("test_dup_total", "doc"))


def test_route_label_buckets_uuids():
    path = "/api/v1/teams/123/foo/550e8400-e29b-41d4-a716-446655440000"
    out = metrics._route_label(path)
    assert "{id}" in out
    assert "123" not in out
    assert "550e8400" not in out


def test_metrics_endpoint_returns_prometheus_text():
    client = TestClient(app)
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    assert "# HELP onramp_http_requests_total" in body
    assert "# TYPE onramp_http_requests_total counter" in body
    assert "onramp_llm_calls_total" in body


def test_metrics_endpoint_is_public_and_unwrapped():
    """/metrics must not be wrapped in the {success,data} envelope."""
    client = TestClient(app)
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert resp.text.startswith("# HELP")


def test_http_requests_recorded_by_middleware():
    client = TestClient(app)
    client.get("/health")
    text = metrics.generate_metrics()
    assert "onramp_http_requests_total" in text
    assert 'status="200"' in text


def test_metrics_disabled_env():
    """ENABLE_METRICS=false disables the flag helper."""
    old = os.environ.get("ENABLE_METRICS")
    try:
        os.environ["ENABLE_METRICS"] = "false"
        assert metrics.metrics_enabled() is False
    finally:
        if old is None:
            os.environ.pop("ENABLE_METRICS", None)
        else:
            os.environ["ENABLE_METRICS"] = old


def test_metrics_endpoint_respects_disable_flag(monkeypatch):
    """ENABLE_METRICS=false makes /metrics return 404 so scrapers fail loudly."""
    monkeypatch.setenv("ENABLE_METRICS", "false")
    client = TestClient(app)
    resp = client.get("/metrics")
    assert resp.status_code == 404


def test_openapi_declares_bearer_scheme():
    """The OpenAPI document must declare the BearerAuth security scheme."""
    schema = app.openapi()
    schemes = schema["components"]["securitySchemes"]
    assert "BearerAuth" in schemes
    assert schemes["BearerAuth"]["scheme"] == "bearer"
    assert schemes["BearerAuth"]["type"] == "http"


def test_openapi_does_not_claim_public_routes_require_auth():
    """No global security requirement — public routes stay unmarked."""
    schema = app.openapi()
    assert "security" not in schema
    health_op = schema["paths"]["/health"]["get"]
    assert "security" not in health_op
    login_op = schema["paths"]["/api/v1/auth/login"]["post"]
    assert "security" not in login_op


def test_record_llm_call_and_cache():
    metrics.record_llm_call("groq", free=True)
    metrics.record_llm_call("anthropic", free=False)
    metrics.record_cache_hit(tier="redis")
    metrics.record_cache_hit(tier="semantic")
    metrics.record_cache_miss()
    metrics.record_embedding_call("gemini")
    text = metrics.generate_metrics()
    assert 'onramp_llm_calls_total{free="true",provider="groq"} 1' in text
    assert 'onramp_llm_calls_total{free="false",provider="anthropic"} 1' in text
    assert 'onramp_llm_cache_hits_total{tier="redis"} 1' in text
    assert 'onramp_llm_cache_hits_total{tier="semantic"} 1' in text
    assert "onramp_llm_cache_misses_total 1" in text
    assert 'onramp_embedding_calls_total{provider="gemini"} 1' in text
