"""
Dependency-free Prometheus metrics registry (text exposition format).

Implements the subset of the Prometheus exposition format needed for a
production FastAPI service without pulling in ``prometheus-client``:

    # TYPE onramp_http_requests_total counter
    onramp_http_requests_total{method="GET",route="/api/v1/dashboard/cto",status="200"} 42.0

Supported metric kinds: Counter, Gauge, Histogram. All label names are
sorted for deterministic output, matching what the official client library
produces, so `promtool check metrics` and PromQL queries work unchanged.

Thread-safe for uvicorn's multi-threaded / multi-worker deployments.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from collections import OrderedDict
from typing import Dict, Iterable, List, Optional, Tuple

__all__ = [
    "Counter",
    "Gauge",
    "Histogram",
    "REGISTRY",
    "register",
    "generate_metrics",
    "exposition",
]

# ── Registry ────────────────────────────────────────────────────────────────

_METRIC_NAME_RE = re.compile(r"^[a-zA-Z_:][a-zA-Z0-9_:]*$")
_LABEL_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


class _Registry:
    """Holds all registered metric families, keyed by metric name."""

    def __init__(self) -> None:
        self._families: "OrderedDict[str, _Metric]" = OrderedDict()
        self._lock = threading.RLock()

    def register(self, metric: "_Metric") -> "_Metric":
        with self._lock:
            existing = self._families.get(metric.name)
            if existing is not None and existing.type != metric.type:
                raise ValueError(
                    f"Metric {metric.name!r} already registered with type "
                    f"{existing.type} (cannot re-register as {metric.type})"
                )
            self._families[metric.name] = metric
        return metric

    def unregister(self, name: str) -> None:
        with self._lock:
            self._families.pop(name, None)

    def collect(self) -> List["_Metric"]:
        with self._lock:
            return list(self._families.values())


REGISTRY = _Registry()


def register(metric: "_Metric") -> "_Metric":
    """Register a metric with the global registry (no-op on duplicate name)."""
    return REGISTRY.register(metric)


# ── Label helper ────────────────────────────────────────────────────────────

def _format_labels(labels: Dict[str, str]) -> str:
    if not labels:
        return ""
    parts = []
    for key in sorted(labels):
        value = labels[key]
        if not isinstance(value, str):
            value = str(value)
        escaped = (
            value.replace("\\", "\\\\")
            .replace("\n", "\\n")
            .replace('"', '\\"')
        )
        parts.append(f'{key}="{escaped}"')
    return "{" + ",".join(parts) + "}"


# ── Base metric ─────────────────────────────────────────────────────────────

class _Metric:
    """Base class for all metric types."""

    type: str = "untyped"

    def __init__(self, name: str, documentation: str = "") -> None:
        if not _METRIC_NAME_RE.match(name):
            raise ValueError(f"Invalid metric name: {name!r}")
        self.name = name
        self.documentation = documentation
        self._values: "OrderedDict[Tuple[Tuple[str, str], ...], float]" = OrderedDict()
        self._lock = threading.RLock()

    def _labels_key(self, labels: Optional[Dict[str, str]]) -> Tuple[Tuple[str, str], ...]:
        if labels:
            for key in labels:
                if not _LABEL_NAME_RE.match(key):
                    raise ValueError(f"Invalid label name: {key!r}")
            return tuple(sorted((k, str(v)) for k, v in labels.items()))
        return ()

    def _collect_samples(self) -> List[Tuple[str, float, Dict[str, str]]]:
        """Return (suffix, value, labels) samples for exposition."""
        raise NotImplementedError


class Counter(_Metric):
    """Monotonically increasing counter (e.g. request totals, bytes served)."""

    type = "counter"

    def __init__(self, name: str, documentation: str = "", labelnames: Iterable[str] = ()) -> None:
        super().__init__(name, documentation)
        self._labelnames = tuple(labelnames)

    def inc(self, amount: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + float(amount)

    def _collect_samples(self):
        with self._lock:
            items = list(self._values.items())
        return [(self.name, value, dict(labels)) for labels, value in items]


class Gauge(_Metric):
    """A value that can go up and down (e.g. in-flight requests, queue depth)."""

    type = "gauge"

    def __init__(self, name: str, documentation: str = "", labelnames: Iterable[str] = ()) -> None:
        super().__init__(name, documentation)
        self._labelnames = tuple(labelnames)

    def set(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] = float(value)

    def inc(self, amount: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + float(amount)

    def dec(self, amount: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) - float(amount)

    def _collect_samples(self):
        with self._lock:
            items = list(self._values.items())
        return [(self.name, value, dict(labels)) for labels, value in items]


# Default histogram buckets — Prometheus's recommended default set.
DEFAULT_BUCKETS = (
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
)


class Histogram(_Metric):
    """Bucketed histogram for latency / size distributions.

    Emits ``_bucket`` (cumulative, with the ``le`` label), ``_sum`` and
    ``_count`` series per the Prometheus exposition format.
    """

    type = "histogram"

    def __init__(
        self,
        name: str,
        documentation: str = "",
        labelnames: Iterable[str] = (),
        buckets: Iterable[float] = DEFAULT_BUCKETS,
    ) -> None:
        super().__init__(name, documentation)
        self._labelnames = tuple(labelnames)
        self._buckets = tuple(sorted(float(b) for b in buckets))
        self._buckets_le = tuple(
            f"{b:.6g}" if b != float("inf") else "+Inf" for b in self._buckets
        ) + ("+Inf",)
        self._counts: Dict[Tuple, List[float]] = {}
        self._sums: Dict[Tuple, float] = {}
        self._counts_total: Dict[Tuple, float] = {}

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        key = self._labels_key(labels)
        with self._lock:
            counts = self._counts.setdefault(key, [0.0] * len(self._buckets))
            for i, upper in enumerate(self._buckets):
                if value <= upper:
                    counts[i] += 1.0
            self._sums[key] = self._sums.get(key, 0.0) + float(value)
            self._counts_total[key] = self._counts_total.get(key, 0.0) + 1.0

    def _collect_samples(self):
        with self._lock:
            keys = list(self._counts.keys())
        samples = []
        for key in keys:
            base = dict(key)
            counts = self._counts[key]
            cumulative = 0.0
            for i, le in enumerate(self._buckets_le):
                if i < len(self._buckets):
                    cumulative += counts[i]
                # The final "+Inf" bucket carries the total count.
                if i == len(self._buckets):
                    cumulative = self._counts_total.get(key, 0.0)
                labels = dict(base)
                labels["le"] = le
                samples.append((f"{self.name}_bucket", cumulative, labels))
            samples.append((f"{self.name}_sum", self._sums.get(key, 0.0), dict(base)))
            samples.append((f"{self.name}_count", self._counts_total.get(key, 0.0), dict(base)))
        return samples


# ── Exposition ───────────────────────────────────────────────────────────────

def _format_value(value: float) -> str:
    if value == float("inf"):
        return "+Inf"
    if value == float("-inf"):
        return "-Inf"
    # Prometheus floats: integer-valued floats render without a decimal.
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    return repr(value)


def exposition(metrics: Optional[Iterable[_Metric]] = None) -> str:
    """Render the Prometheus text exposition format for the given metrics."""
    if metrics is None:
        metrics = REGISTRY.collect()
    lines: List[str] = []
    for metric in metrics:
        lines.append(f"# HELP {metric.name} {metric.documentation or 'no help'}")
        lines.append(f"# TYPE {metric.name} {metric.type}")
        for suffix, value, labels in metric._collect_samples():
            lines.append(
                f"{suffix}{_format_labels(labels)} {_format_value(value)}"
            )
    return "\n".join(lines) + "\n"


def generate_metrics() -> str:
    """Render the full registry (used by the ``/metrics`` endpoint)."""
    return exposition()


# ── Well-known metrics (registered at import time) ─────────────────────────

HTTP_REQUESTS_TOTAL = register(Counter(
    "onramp_http_requests_total",
    "Total HTTP requests processed, by method, route and status class.",
    labelnames=("method", "route", "status"),
))
HTTP_REQUEST_DURATION = register(Histogram(
    "onramp_http_request_duration_seconds",
    "HTTP request latency in seconds, by method and route.",
    labelnames=("method", "route"),
))
HTTP_INFLIGHT = register(Gauge(
    "onramp_http_inflight_requests",
    "Number of HTTP requests currently being processed.",
))
LLM_CALLS_TOTAL = register(Counter(
    "onramp_llm_calls_total",
    "LLM provider calls, by provider and free/paid attribution.",
    labelnames=("provider", "free"),
))
LLM_CACHE_HITS = register(Counter(
    "onramp_llm_cache_hits_total",
    "LLM response-cache hits (exact + semantic), by tier.",
    labelnames=("tier",),
))
LLM_CACHE_MISSES = register(Counter(
    "onramp_llm_cache_misses_total",
    "LLM response-cache misses that required a provider call.",
))
EMBEDDING_CALLS_TOTAL = register(Counter(
    "onramp_embedding_calls_total",
    "Embedding provider calls, by provider.",
    labelnames=("provider",),
))
WS_CONNECTIONS_TOTAL = register(Counter(
    "onramp_ws_connections_total",
    "Total WebSocket connections accepted.",
))
WS_CONNECTIONS_ACTIVE = register(Gauge(
    "onramp_ws_connections_active",
    "WebSocket connections currently open.",
))


def _route_label(path: str) -> str:
    """Bucket high-cardinality paths into a stable route label.

    Numeric ids (/users/123) collapse to a placeholder so Prometheus
    cardinality stays bounded while still surfacing per-endpoint traffic.
    """
    parts = path.split("/")
    cleaned = [
        (
            "{" + "id" + "}"
            if re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", part)
            or re.fullmatch(r"\d+", part)
            else part
        )
        for part in parts
    ]
    return "/".join(cleaned)


def record_http(method: str, path: str, status: int, duration_s: float) -> None:
    """Record one finished HTTP request into the global registry."""
    route = _route_label(path)
    HTTP_REQUESTS_TOTAL.inc(
        labels={"method": method, "route": route, "status": str(status)}
    )
    HTTP_REQUEST_DURATION.observe(
        duration_s, labels={"method": method, "route": route}
    )


def record_llm_call(provider: str, free: bool) -> None:
    """Record a served LLM provider call."""
    LLM_CALLS_TOTAL.inc(
        labels={"provider": provider, "free": "true" if free else "false"}
    )


def record_cache_hit(tier: str = "redis") -> None:
    """Record an LLM response-cache hit (tier: 'redis' | 'semantic')."""
    LLM_CACHE_HITS.inc(labels={"tier": tier})


def record_cache_miss() -> None:
    """Record an LLM response-cache miss (a provider call will follow)."""
    LLM_CACHE_MISSES.inc()


def record_embedding_call(provider: str) -> None:
    """Record an embedding provider call."""
    EMBEDDING_CALLS_TOTAL.inc(labels={"provider": provider})


def record_ws_open() -> None:
    """Record a WebSocket connection open."""
    WS_CONNECTIONS_TOTAL.inc()
    WS_CONNECTIONS_ACTIVE.inc()


def record_ws_close() -> None:
    """Record a WebSocket connection close."""
    WS_CONNECTIONS_ACTIVE.dec()


def metrics_enabled() -> bool:
    """Whether the /metrics endpoint is enabled (default: on)."""
    return os.getenv("ENABLE_METRICS", "true").lower() not in ("0", "false", "no")
