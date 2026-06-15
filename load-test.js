import http from 'k6/http';
import { check, sleep } from 'k6';
import { RateThresholds, PercentileThresholds } from 'k6/metrics';

export const options = {
  scenarios: {
    // Smoke test - verify basic functionality
    smoke_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { test_type: 'smoke' },
      exec: 'smokeTest',
    },

    // Load test - normal expected traffic
    load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'load' },
      exec: 'loadTest',
    },

    // Stress test - push beyond normal capacity
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 400 },
        { duration: '5m', target: 400 },
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'stress' },
      exec: 'stressTest',
    },

    // Spike test - sudden traffic surge
    spike_test: {
      executor: 'stepping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 0 },
        { duration: '30s', target: 500 },
        { duration: '1m', target: 500 },
        { duration: '30s', target: 0 },
      ],
      tags: { test_type: 'spike' },
      exec: 'spikeTest',
    },

    // Soak test - extended duration testing
    soak_test: {
      executor: 'constant-vus',
      vus: 50,
      duration: '24h',
      tags: { test_type: 'soak' },
      exec: 'soakTest',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>100'],
    checks: ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

export function smokeTest() {
  const res = http.get(`${BASE_URL}/`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has version': (r) => r.body.includes('version'),
  });
  sleep(1);
}

export function loadTest() {
  const res = http.get(`${BASE_URL}/`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);

  const health = http.get(`${BASE_URL}/api/v1/observability/health`);
  check(health, {
    'health endpoint works': (r) => r.status === 200,
  });
}

export function stressTest() {
  loadTest();

  const endpoints = [
    '/adk/agents',
    '/adk/health',
    '/analytics',
    '/learning',
  ];

  const randomEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(`${BASE_URL}${randomEndpoint}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  
  check(res, {
    'stress endpoint responds': (r) => r.status < 500,
  });
}

export function spikeTest() {
  const batchSize = 100;
  const requests = [];

  for (let i = 0; i < batchSize; i++) {
    requests.push(http.asyncRequest(
      'GET',
      `${BASE_URL}/`,
      null,
      { headers: { 'Authorization': `Bearer ${API_KEY}` } }
    ));
  }

  const responses = Promise.all(requests);
  
  let successCount = 0;
  responses.forEach(res => {
    if (res.status === 200) successCount++;
  });

  check({ success: successCount }, {
    'spike: >80% success rate': (r) => r.success > (batchSize * 0.8),
  });
}

export function soakTest() {
  const res = http.get(`${BASE_URL}/`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });

  check(res, {
    'soak: endpoint stable': (r) => r.status === 200,
  });

  sleep(Math.random() * 5 + 1);
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: `Test completed: ${data.state}`,
  };
}
