/**
 * Mobile Responsiveness Audit
 *
 * Loads every key route at mobile viewport widths and reports:
 *   - Horizontal overflow (document wider than viewport) + the culprits
 *   - Console errors
 *
 * Run:  node scripts/mobile-audit.mjs
 * Requires the dev server on :5173.
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const VIEWPORTS = [
  { name: 'iPhone SE (375)', width: 375, height: 667 },
  { name: 'iPhone 14 (390)', width: 390, height: 844 },
  { name: 'Pixel 7 (412)', width: 412, height: 915 },
]

const PUBLIC_ROUTES = ['/', '/pricing', '/about', '/why-onramp', '/customers', '/blog', '/contact', '/login', '/register', '/security', '/privacy', '/terms', '/team', '/support', '/soc2']
const AUTH_ROUTES = ['/dashboard', '/tasks', '/explore', '/review-queue', '/billing', '/team', '/settings', '/api-keys', '/audit-log', '/marketplace', '/wiki', '/docs', '/profile']

// Mock auth for authed routes so they render
async function mockAuth(page) {
  await page.route('**/api/v1/auth/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: 'u1', email: 'a@b.dev', name: 'Test User', provider: 'password' }) }))
  await page.route(/\/api\/v1\/teams(\?|$)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teams: [{ team_id: 't1', name: 'Test Team', owner: 'u1', role: 'admin', members: [{ user_id: 'u1', role: 'admin', name: 'Test User', email: 'a@b.dev' }] }] }) }))
  await page.route('**/api/v1/dashboard/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [], metrics: {}, recent_activity: [], team_health: {} }) }))
}

function findOverflow(page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth
    const viewport = window.innerWidth
    if (docWidth <= viewport + 1) return { overflow: false, docWidth, viewport, culprits: [] }
    // Find elements sticking out past the right edge
    const culprits = []
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > viewport + 2 && r.width > 20) {
        culprits.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').slice(0, 120),
          right: Math.round(r.right),
          left: Math.round(r.left),
          width: Math.round(r.width),
        })
      }
    })
    culprits.sort((a, b) => b.right - a.right)
    return { overflow: true, docWidth, viewport, culprits: culprits.slice(0, 8) }
  })
}

const results = []
for (const vp of VIEWPORTS) {
  for (const route of [...PUBLIC_ROUTES, ...AUTH_ROUTES]) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)) })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 120)}`))
    try {
      if (AUTH_ROUTES.includes(route)) await mockAuth(page)
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(600)
      const o = await findOverflow(page)
      results.push({ route, vp: vp.name, ...o, errors })
    } catch (e) {
      results.push({ route, vp: vp.name, error: e.message.slice(0, 100), errors })
    } finally {
      await browser.close()
    }
  }
}

// Report
let fails = 0
for (const r of results) {
  if (r.error) { fails++; console.log(`❌ ${r.vp} ${r.route}: ${r.error}`); continue }
  if (r.overflow) {
    fails++
    console.log(`❌ ${r.vp} ${r.route}: overflow ${r.docWidth}px > ${r.viewport}px`)
    for (const c of r.culprits.slice(0, 4)) {
      console.log(`     <${c.tag}> right=${c.right} w=${c.width} class="${c.cls}"`)
    }
  } else if (r.errors.length) {
    console.log(`⚠️  ${r.vp} ${r.route}: ${r.errors.length} console error(s)`)
    for (const e of r.errors.slice(0, 2)) console.log(`     ${e}`)
  } else {
    console.log(`✅ ${r.vp} ${r.route}`)
  }
}
console.log(`\n${results.length - fails}/${results.length} checks clean`)
process.exit(fails > 0 ? 1 : 0)
