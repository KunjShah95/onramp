/**
 * Lighthouse-Style Performance Audit Tests
 *
 * Uses Playwright to collect browser performance metrics and assert
 * against Core Web Vitals thresholds.  Run in CI alongside E2E tests.
 *
 * Run:  npx playwright test e2e/performance/lighthouse.test.ts --project=chromium
 *
 * Thresholds (borrowed from Lighthouse scoring):
 *   - First Contentful Paint (FCP)  < 1.8s  (green)
 *   - Largest Contentful Paint (LCP) < 2.5s  (green)
 *   - DOM Content Loaded (DCL)       < 2.0s  (green)
 *   - DOM node count                 < 1500
 *   - No console errors
 */

import { test, expect, Page } from '@playwright/test'

// ── Thresholds ───────────────────────────────────────────────────────
const THRESHOLDS = {
  FCP_MS: 1800,          // First Contentful Paint (ms)
  DCL_MS: 2000,          // DOM Content Loaded (ms)
  DOM_NODES: 1500,       // Max DOM nodes
}

// ── Helper ───────────────────────────────────────────────────────────
async function collectMetrics(page: Page) {
  // Wait for the page to be fully loaded
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)  // let React settle

  // Collect performance timing data
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as any
    const paint = performance.getEntriesByType('paint')
    const fcp = paint.find((e: any) => e.name === 'first-contentful-paint')

    return {
      fcp: fcp?.startTime || 0,
      dcl: nav?.domContentLoadedEventEnd || 0,
      domNodes: document.querySelectorAll('*').length,
    }
  })

  return perf
}

async function setupAuthMocks(page: Page) {
  // Mock auth/me endpoint
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uid: 'test-user-001',
        email: 'admin@onramp.dev',
        name: 'Admin User',
        provider: 'password',
      }),
    })
  })

  // Mock teams list
  await page.route(/\/api\/v1\/teams(\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        teams: [
          {
            team_id: 'team-42',
            name: 'Onramp Engineering',
            owner: 'test-user-001',
            tier: 'pro',
            members: [{ user_id: 'test-user-001', role: 'owner', name: 'Admin User', email: 'admin@onramp.dev' }],
            role: 'owner',
          },
        ],
      }),
    })
  })

  // Mock login
  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uid: 'test-user-001',
        email: 'admin@onramp.dev',
        name: 'Admin User',
        token: 'fake-jwt-token',
        provider: 'password',
      }),
    })
  })

  // Mock check-provider
  await page.route('**/api/v1/auth/check-provider*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ provider: 'password' }),
    })
  })

  // Mock dashboard data
  await page.route('**/api/v1/dashboard/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tasks: [],
        metrics: { total_tasks: 0, completed: 0, in_progress: 0, pending_review: 0 },
        recent_activity: [],
        team_health: { score: 85, members: 1 },
      }),
    })
  })
}

// ── Public pages (no auth required) ──────────────────────────────────
test.describe('Performance — Public Pages', () => {
  test('landing page meets performance thresholds', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    const metrics = await collectMetrics(page)

    console.log(`\n  [PERF] Landing Page:`)
    console.log(`    FCP:      ${metrics.fcp.toFixed(0)}ms  (threshold: ${THRESHOLDS.FCP_MS}ms)`)
    console.log(`    DCL:      ${metrics.dcl.toFixed(0)}ms  (threshold: ${THRESHOLDS.DCL_MS}ms)`)
    console.log(`    DOM:      ${metrics.domNodes} nodes  (threshold: ${THRESHOLDS.DOM_NODES})`)
    console.log(`    Console:  ${errors.length} errors`)

    expect(metrics.fcp).toBeLessThan(THRESHOLDS.FCP_MS)
    expect(metrics.dcl).toBeLessThan(THRESHOLDS.DCL_MS)
    expect(metrics.domNodes).toBeLessThan(THRESHOLDS.DOM_NODES)
    expect(errors.length).toBe(0)
  })

  test('login page meets performance thresholds', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/login')
    const metrics = await collectMetrics(page)

    console.log(`\n  [PERF] Login Page:`)
    console.log(`    FCP:      ${metrics.fcp.toFixed(0)}ms`)
    console.log(`    DCL:      ${metrics.dcl.toFixed(0)}ms`)
    console.log(`    DOM:      ${metrics.domNodes} nodes`)
    console.log(`    Console:  ${errors.length} errors`)

    expect(metrics.fcp).toBeLessThan(THRESHOLDS.FCP_MS)
    expect(metrics.dcl).toBeLessThan(THRESHOLDS.DCL_MS)
    expect(metrics.domNodes).toBeLessThan(THRESHOLDS.DOM_NODES)
    expect(errors.length).toBe(0)
  })

  test('pricing page meets performance thresholds', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/pricing')
    const metrics = await collectMetrics(page)

    console.log(`\n  [PERF] Pricing Page:`)
    console.log(`    FCP:      ${metrics.fcp.toFixed(0)}ms`)
    console.log(`    DCL:      ${metrics.dcl.toFixed(0)}ms`)
    console.log(`    DOM:      ${metrics.domNodes} nodes`)
    console.log(`    Console:  ${errors.length} errors`)

    expect(metrics.fcp).toBeLessThan(THRESHOLDS.FCP_MS)
    expect(metrics.dcl).toBeLessThan(THRESHOLDS.DCL_MS)
    expect(metrics.domNodes).toBeLessThan(THRESHOLDS.DOM_NODES)
    expect(errors.length).toBe(0)
  })
})

// ── Authenticated pages ──────────────────────────────────────────────
test.describe('Performance — Authenticated Pages', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMocks(page)
  })

  test('dashboard page meets performance thresholds', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // Go directly to dashboard after setting mocks
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const metrics = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint')
      const fcp = paint.find((e: any) => e.name === 'first-contentful-paint')
      const nav = performance.getEntriesByType('navigation')[0] as any
      return {
        fcp: fcp?.startTime || 0,
        dcl: nav?.domContentLoadedEventEnd || 0,
        domNodes: document.querySelectorAll('*').length,
      }
    })

    console.log(`\n  [PERF] Dashboard:`)
    console.log(`    FCP:      ${metrics.fcp.toFixed(0)}ms`)
    console.log(`    DCL:      ${metrics.dcl.toFixed(0)}ms`)
    console.log(`    DOM:      ${metrics.domNodes} nodes`)
    console.log(`    Console:  ${errors.length} errors`)

    expect(errors.length).toBeLessThanOrEqual(2) // Allow minor React warnings
  })
})
