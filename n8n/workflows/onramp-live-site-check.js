// Onramp live site check — source for the "Run Live Checks" Code node in
// onramp-live-site-check.json (regenerate: python n8n/workflows/build_live_check_workflow.py).
//
// Hits the live frontend + API (and the local stack when present), verifies
// status codes / auth guards / CORS / n8n HMAC round-trips, returns one report.
const crypto = require('crypto')

const FRONTEND = ($env.LIVE_FRONTEND_URL || 'https://developer-onboard.vercel.app').replace(/\/$/, '')
const API = ($env.LIVE_API_URL || 'https://onramp-tlfo.onrender.com').replace(/\/$/, '')
const LOCAL_API = ($env.LOCAL_API_URL || 'http://host.docker.internal:8000').replace(/\/$/, '')
const SECRET = $env.N8N_INBOUND_SECRET || ''

const signed = (body, secret = SECRET) => {
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('hex')
  return { 'Content-Type': 'application/json', 'X-N8N-Timestamp': ts, 'X-N8N-Signature': sig }
}
const ping = JSON.stringify({ action: 'ping', source: 'n8n-live-check' })

const checks = [
  // API first: a sleeping Render instance needs up to ~60s to wake.
  { group: 'api', name: 'Liveness /health', url: `${API}/health`, expect: [200], bodyHas: '"ok"' },
  { group: 'api', name: 'Readiness /ready (DB + Redis)', url: `${API}/ready`, expect: [200] },
  { group: 'api', name: 'Auth guard: /auth/me without token', url: `${API}/api/v1/auth/me`, expect: [401] },
  { group: 'api', name: 'Auth guard: /dashboard/work-graphs without token', url: `${API}/api/v1/dashboard/work-graphs`, expect: [401, 403] },
  {
    group: 'api', name: 'CORS preflight from live frontend', method: 'OPTIONS', url: `${API}/api/v1/auth/login`,
    headers: { Origin: FRONTEND, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    expect: [200, 204], header: ['access-control-allow-origin', FRONTEND],
  },
  { group: 'frontend', name: 'Landing page', url: `${FRONTEND}/`, expect: [200], bodyHas: 'id="root"' },
  { group: 'frontend', name: 'Login page', url: `${FRONTEND}/login`, expect: [200], bodyHas: 'id="root"' },
  { group: 'frontend', name: 'Register page', url: `${FRONTEND}/register`, expect: [200], bodyHas: 'id="root"' },
  { group: 'frontend', name: 'Docs page', url: `${FRONTEND}/docs`, expect: [200] },
  { group: 'frontend', name: 'Changelog page', url: `${FRONTEND}/changelog`, expect: [200] },
  { group: 'frontend', name: 'Privacy page', url: `${FRONTEND}/privacy`, expect: [200] },
  { group: 'frontend', name: 'SPA deep link /code-health', url: `${FRONTEND}/code-health`, expect: [200], bodyHas: 'id="root"' },
  { group: 'frontend', name: 'SPA deep link /work-graph', url: `${FRONTEND}/work-graph`, expect: [200], bodyHas: 'id="root"' },
  { group: 'frontend', name: 'robots.txt', url: `${FRONTEND}/robots.txt`, expect: [200] },
  { group: 'frontend', name: 'Latest build deployed (bundle has Work Graph route)', special: 'bundle' },
  { group: 'n8n', name: 'Live API accepts signed n8n ping', method: 'POST', url: `${API}/api/v1/webhooks/n8n`, body: ping, headers: signed(ping), expect: [200] },
  { group: 'n8n', name: 'Live API rejects forged signature', method: 'POST', url: `${API}/api/v1/webhooks/n8n`, body: ping, headers: signed(ping, 'wrong-secret'), expect: [401] },
  { group: 'n8n', name: 'Local backend accepts signed n8n ping', method: 'POST', url: `${LOCAL_API}/api/v1/webhooks/n8n`, body: ping, headers: signed(ping), expect: [200], optional: true },
  {
    group: 'n8n', name: 'Automation bus answers test.ping', method: 'POST', url: 'http://localhost:5678/webhook/onramp',
    body: JSON.stringify({ event: 'test.ping', source: 'onramp', timestamp: Math.floor(Date.now() / 1000), data: {} }),
    headers: { 'Content-Type': 'application/json' }, expect: [200],
  },
]

const request = async (c) => {
  const started = Date.now()
  try {
    const res = await this.helpers.httpRequest({
      method: c.method || 'GET', url: c.url, headers: c.headers || {}, body: c.body,
      returnFullResponse: true, ignoreHttpStatusErrors: true, json: false, timeout: 90000,
    })
    const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? '')
    return { status: res.statusCode, headers: res.headers || {}, body, ms: Date.now() - started }
  } catch (e) {
    return { status: 0, headers: {}, body: '', error: String(e.message || e).slice(0, 200), ms: Date.now() - started }
  }
}

const results = []
for (const c of checks) {
  if (c.special === 'bundle') {
    const index = await request({ url: `${FRONTEND}/` })
    const src = (index.body.match(/src="(\/assets\/index-[^"]+\.js)"/) || [])[1]
    const js = src ? await request({ url: FRONTEND + src }) : { status: 0, body: '', ms: 0 }
    const ok = js.status === 200 && js.body.includes('/work-graph')
    results.push({ group: c.group, name: c.name, ok, status: js.status, ms: index.ms + js.ms, detail: src ? (ok ? `${src} contains /work-graph` : `${src} has no /work-graph route (old deploy)`) : 'entry bundle not found in index.html' })
    continue
  }
  const r = await request(c)
  const problems = []
  if (!c.expect.includes(r.status)) problems.push(`HTTP ${r.status} (expected ${c.expect.join('/')})`)
  if (c.bodyHas && !r.body.includes(c.bodyHas)) problems.push(`body missing ${c.bodyHas}`)
  if (c.header) {
    const got = r.headers[c.header[0]]
    if (got !== c.header[1] && got !== '*') problems.push(`${c.header[0]}=${got ?? 'absent'}`)
  }
  if (r.error) problems.push(r.error)
  const ok = problems.length === 0
  results.push({
    group: c.group, name: c.name, ok, status: r.status, ms: r.ms,
    skipped: !ok && c.optional && r.status === 0,
    detail: ok ? r.body.slice(0, 140).replace(/\s+/g, ' ') : problems.join('; ') + (r.body ? ` · ${r.body.slice(0, 160).replace(/\s+/g, ' ')}` : ''),
  })
}

const counted = results.filter((r) => !r.skipped)
return [{
  json: {
    checked_at: new Date().toISOString(),
    targets: { frontend: FRONTEND, api: API, local_api: LOCAL_API },
    summary: {
      total: counted.length,
      passed: counted.filter((r) => r.ok).length,
      failed: counted.filter((r) => !r.ok).length,
      skipped: results.length - counted.length,
    },
    results,
  },
}]
