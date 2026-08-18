/**
 * Frontend Concurrent-Load Test
 *
 * Simulates N concurrent visitors hitting the site at once (the browser
 * equivalent of a k6 ramp). Asserts every page:
 *   - Renders its root content (React mounted, not a blank shell)
 *   - Produces zero console errors / page errors
 *   - Finishes within a generous time budget
 *
 * Runs against the Vite dev server like the rest of the e2e suite. For
 * lab-accurate production numbers, use `scripts/cwv-audit.mjs` against
 * `npm run build && npm run preview`.
 *
 * Run:  npx playwright test e2e/performance/load.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test'

const CONCURRENT_PAGES = 8
const ROUTES = ['/', '/pricing', '/login', '/security', '/team', '/why-onramp', '/about', '/customers']

// Dev-server numbers are inflated (cold transforms + no CDN); this is a
// hang-sentinel, not an SLO.
const MAX_LOAD_MS = 30_000

test.describe('Frontend — Concurrent Load', () => {
  test(`${CONCURRENT_PAGES} visitors load pages simultaneously`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pages = await Promise.all(
      Array.from({ length: CONCURRENT_PAGES }, () => context.newPage()),
    )

    const results = await Promise.all(
      pages.map(async (page, i) => {
        const errors: string[] = []
        page.on('console', (msg) => {
          if (msg.type() === 'error') errors.push(msg.text().slice(0, 150))
        })
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 150)}`))

        const route = ROUTES[i % ROUTES.length]
        const started = Date.now()
        try {
          await page.goto(route, { waitUntil: 'domcontentloaded', timeout: MAX_LOAD_MS })
          // Let React mount + first paint settle
          await page.waitForTimeout(800)
          const rootChildren = await page.evaluate(() => document.getElementById('root')?.childElementCount ?? 0)
          return {
            page: i + 1,
            route,
            ms: Date.now() - started,
            rootChildren,
            errors,
          }
        } catch (e: any) {
          return { page: i + 1, route, ms: Date.now() - started, rootChildren: 0, errors: [...errors, `goto: ${String(e.message).slice(0, 150)}`] }
        }
      }),
    )

    for (const r of results) {
      console.log(
        `  [LOAD] page ${r.page} ${r.route}: ${r.ms}ms, root nodes=${r.rootChildren}, ` +
        `errors=${r.errors.length}${r.errors.length ? ` (${r.errors[0]})` : ''}`,
      )
    }

    const times = results.map((r) => r.ms).sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    console.log(`  [LOAD] median load: ${median}ms (budget ${MAX_LOAD_MS}ms)`)

    // Every page must have mounted React content
    for (const r of results) {
      expect(r.rootChildren, `page ${r.page} (${r.route}) failed to render`).toBeGreaterThan(0)
      expect(r.errors, `page ${r.page} (${r.route}) produced console errors`).toEqual([])
    }
    expect(median).toBeLessThan(MAX_LOAD_MS)

    await context.close()
  })
})
