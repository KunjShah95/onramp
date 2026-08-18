/**
 * Onramp API — Full-Scale Load Test Suite (k6)
 *
 * Five scenarios cover the standard load-testing profile:
 *
 *   smoke   — 2 VUs, quick sanity that every endpoint responds
 *   load    — ramping 0 → 20 → 50 VUs (normal + peak traffic)
 *   stress  — ramping 0 → 100 → 200 VUs (find the breaking point)
 *   spike   — 150 VUs instantly, 30s hold, instant drop (surge handling)
 *   soak    — constant 40 VUs for 10 minutes (endurance / leaks)
 *
 * Run against a staging/deployed environment:
 *
 *   k6 run k6-load-test.js -e BASE_URL=https://staging.onramp.dev/api/v1
 *   k6 run k6-load-test.js -e BASE_URL=https://staging.onramp.dev/api/v1 -e SCENARIO=stress
 *
 * Local (backend on localhost:8000):
 *
 *   k6 run k6-load-test.js -e BASE_URL=http://localhost:8000/api/v1 -e SCENARIO=smoke
 *
 * Install k6:  https://k6.io/docs/getting-started/installation/
 *
 * NOTE on local Windows dev machines: Windows' security stack inspects each
 * new TCP connection, adding ~200ms to the FIRST request per connection.
 * Keep-alive requests after that are sub-millisecond. k6 reuses connections
 * per VU, so throughput/error-rate results are valid; absolute p95 latency
 * will be inflated by ~200ms on a local Windows box. Use a Linux CI runner
 * or a staging deployment for lab-accurate latency thresholds.
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Custom metrics ───────────────────────────────────────────────────
const errorRate = new Rate('errors')
const latencyP50 = new Trend('latency_p50')
const latencyHealth = new Trend('latency_health')
const latencyPricing = new Trend('latency_pricing')

// ── Configuration ────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000/api/v1'
const SCENARIO = (__ENV.SCENARIO || 'default').toLowerCase()

// Public + validation endpoints. Authenticated flows need real credentials,
// so they're covered by the pytest suite (in-process) instead.
const PUBLIC_ENDPOINTS = [
  { method: 'GET', path: '/', name: 'root' },
  { method: 'GET', path: '/health', name: 'health' },
  { method: 'GET', path: '/api/v1/billing/pricing', name: 'pricing' },
  { method: 'GET', path: '/api/v1/ai/tiers', name: 'tiers' },
  { method: 'GET', path: '/api/v1/explore/health', name: 'explore_health' },
  { method: 'GET', path: '/api/v1/auth/check-provider?email=nobody@onramp.dev', name: 'check_provider' },
]

// ── Scenarios ────────────────────────────────────────────────────────
// Default runs smoke + a light load pass so `k6 run k6-load-test.js` is
// fast (<1min). Override with -e SCENARIO=<name>.
const scenarios = {
  smoke: {
    executor: 'shared-iterations',
    vus: 2,
    iterations: 40,
    maxDuration: '30s',
    tags: { scenario: 'smoke' },
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '2m', target: 50 },
      { duration: '1m', target: 20 },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '30s',
    tags: { scenario: 'load' },
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50 },
      { duration: '1m', target: 100 },
      { duration: '1m', target: 150 },
      { duration: '1m', target: 200 },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '1m',
    tags: { scenario: 'stress' },
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 150 },
      { duration: '30s', target: 150 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '30s',
    tags: { scenario: 'spike' },
  },
  soak: {
    executor: 'constant-vus',
    vus: 40,
    duration: '10m',
    tags: { scenario: 'soak' },
  },
}

// Light per-scenario weight on /metrics (a scrape every ~10s per VU keeps
// the registry exercise real without hammering it).
const METRICS_EVERY_N = 10

// k6's built-in http_req_failed counts ANY 4xx as failed. The auth
// validation paths below legitimately return 401/422, so thresholds gate on
// the custom `errors` metric (5xx + network errors only) instead.
const isServerError = (r) => r.status >= 500

export const options = {
  scenarios: SCENARIO === 'default'
    ? { smoke: scenarios.smoke, load: scenarios.load }
    : { [SCENARIO]: scenarios[SCENARIO] || scenarios.load },
  // stress/spike intentionally push past capacity — the point is to find the
  // breaking point, so latency gates are loose and the real gate is the
  // error rate. load/soak get strict SLO-style gates.
  thresholds: (SCENARIO === 'stress' || SCENARIO === 'spike')
    ? {
        errors: ['rate<0.02'],                    // <2% 5xx even at breaking point
        http_req_duration: ['p(95)<10000'],       // probe capacity, not latency
      }
    : {
        errors: ['rate<0.01'],                    // <1% 5xx/network error rate
        http_req_duration: ['p(95)<2000', 'p(99)<4000'],
        // Median health latency — robust to the one-time ~200ms first-connection
        // cost on local Windows boxes; a genuinely slow handler shows up in the
        // median since most requests reuse keep-alive connections.
        latency_health: ['med<50'],
      },
  // Realistic think time distribution (100–700ms) — do not hammer with 0 sleep.
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

function hit(endpoint) {
  const res = http.request(endpoint.method, `${BASE_URL}${endpoint.path}`, null, {
    tags: { endpoint: endpoint.name },
  })
  check(res, {
    [`${endpoint.name} responded`]: () => res.status < 500,
  })
  errorRate.add(isServerError(res))
  return res
}

export default function () {
  // Public read endpoints
  for (const ep of PUBLIC_ENDPOINTS) {
    const res = hit(ep)
    // /health feeds the latency threshold trend
    if (ep.name === 'health') latencyHealth.add(res.timings.duration)
  }

  // Readiness gate — 200 when DB+Redis are up, 503 when a dependency is
  // down. Both are valid responses for this probe; only network errors count.
  const ready = http.get(`${BASE_URL.replace(/\/api\/v1$/, '')}/ready`, { tags: { endpoint: 'ready' } })
  check(ready, { 'ready probe responded': (r) => r.status === 200 || r.status === 503 })
  errorRate.add(ready.status === 0)

  // Periodic /metrics scrape (Prometheus-style)
  if (__ITER % METRICS_EVERY_N === 0) {
    const m = http.get(`${BASE_URL.replace(/\/api\/v1$/, '')}/metrics`, { tags: { endpoint: 'metrics' } })
    errorRate.add(m.status >= 500)
  }

  // Auth validation path — login with bad creds exercises the 401 path,
  // not real authentication.
  const login = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'loadtest@onramp.dev',
    password: 'wrong-password',
  }), { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth_login' } })
  check(login, { 'login validation path responded': (r) => r.status < 500 })
  errorRate.add(isServerError(login))

  // p50 trend from the last request for summary readability
  latencyP50.add(login.timings.duration)

  sleep(0.1 + Math.random() * 0.6)
}
