/**
 * k6 Load Test — Onramp API
 *
 * Measures throughput, latency, and error rate under simulated user load.
 *
 * Run against a staging/deployed environment:
 *
 *   k6 run k6-load-test.js -e BASE_URL=https://staging.onramp.dev/api/v1
 *
 * For local testing (requires backend on localhost:8000):
 *
 *   k6 run k6-load-test.js -e BASE_URL=http://localhost:8000/api/v1
 *
 * Install k6:  https://k6.io/docs/getting-started/installation/
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Custom metrics ───────────────────────────────────────────────────
const errorRate = new Rate('errors')
const latencyRoot = new Trend('latency_root')
const latencyHealth = new Trend('latency_health')
const latencyPricing = new Trend('latency_pricing')

// ── Configuration ────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000/api/v1'

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 20 },     // Ramp to 20 users
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    errors: ['rate<0.05'],              // Error rate < 5%
    http_req_duration: ['p(95)<2000'],  // 95% of requests < 2s
    latency_root: ['avg<200'],          // / root endpoint avg < 200ms
    latency_health: ['avg<100'],        // /health avg < 100ms
  },
}

// ── Test scenario ────────────────────────────────────────────────────
export default function () {
  group('Public Endpoints', () => {
    // GET /
    const rootRes = http.get(`${BASE_URL}/`)
    check(rootRes, { 'root status 200': (r) => r.status === 200 })
    latencyRoot.add(rootRes.timings.duration)
    errorRate.add(rootRes.status >= 400)

    // GET /health
    const healthRes = http.get(`${BASE_URL}/health`)
    check(healthRes, { 'health status 200': (r) => r.status === 200 })
    latencyHealth.add(healthRes.timings.duration)
    errorRate.add(healthRes.status >= 400)

    // GET /api/v1/billing/pricing
    const pricingRes = http.get(`${BASE_URL}/billing/pricing`)
    check(pricingRes, { 'pricing status 200': (r) => r.status === 200 })
    latencyPricing.add(pricingRes.timings.duration)
    errorRate.add(pricingRes.status >= 400)

    // GET /api/v1/ai/tiers
    const tiersRes = http.get(`${BASE_URL}/ai/tiers`)
    check(tiersRes, { 'tiers status 200': (r) => r.status === 200 })
    errorRate.add(tiersRes.status >= 400)
  })

  group('Auth Endpoints', () => {
    // POST /api/v1/auth/login (will 422 without body — testing validation path)
    const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
      email: 'test@onramp.dev',
      password: 'test123',
    }), { headers: { 'Content-Type': 'application/json' } })
    check(loginRes, {
      'login responded': (r) => r.status >= 200 && r.status < 500,
    })
    errorRate.add(loginRes.status >= 500)

    // GET /api/v1/auth/check-provider (missing email — 422)
    const checkRes = http.get(`${BASE_URL}/auth/check-provider`)
    check(checkRes, { 'check-provider 422': (r) => r.status === 422 })
    errorRate.add(checkRes.status >= 500)
  })

  // Simulate user think time (200-500ms)
  sleep(0.2 + Math.random() * 0.3)
}
