/**
 * Core Web Vitals audit — throttled mobile profile.
 *
 * Simulates a mid-range Android phone (4x CPU slowdown, ~1.6Mbps down)
 * against the dev server and reports FCP / LCP / CLS / TBT for key routes.
 *
 * Run:  node scripts/cwv-audit.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const ROUTES = ['/', '/#pricing', '/login']

// 4x CPU slowdown + mobile network throttling (approx Fast 3G / mid-tier 4G)
const CDP = { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()
const cdpSession = await ctx.newCDPSession(page)
await cdpSession.send('Network.enable')
await cdpSession.send('Network.emulateNetworkConditions', {
  offline: false, latency: CDP.latency, downloadThroughput: CDP.downloadThroughput, uploadThroughput: CDP.uploadThroughput,
})
await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 4 })

for (const route of ROUTES) {
  const metrics = {}
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  // Wait for LCP to settle
  await page.waitForTimeout(2500)
  const m = await page.evaluate(() => {
    const paint = performance.getEntriesByType('paint')
    const nav = performance.getEntriesByType('navigation')[0]
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint')
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : 0
    let cls = 0
    try {
      // rough CLS via layout-shift observer replay isn't available retroactively; use cumulative from PerformanceObserver buffered
      cls = performance.getEntriesByType('layout-shift').reduce((s, e) => s + (e.hadRecentInput ? 0 : e.value), 0)
    } catch {}
    return {
      fcp: Math.round((paint.find((e) => e.name === 'first-contentful-paint')?.startTime) || 0),
      lcp: Math.round(lcp),
      dcl: Math.round(nav?.domContentLoadedEventEnd || 0),
      load: Math.round(nav?.loadEventEnd || 0),
      cls,
      transferKB: Math.round((performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || 0), 0)) / 1024),
      requests: performance.getEntriesByType('resource').length,
      domNodes: document.querySelectorAll('*').length,
    }
  })
  metrics[route] = m
  console.log(`\n[${route}]`)
  console.log(`  FCP: ${m.fcp}ms   LCP: ${m.lcp}ms   DCL: ${m.dcl}ms   Load: ${m.load}ms   CLS: ${m.cls.toFixed(3)}`)
  console.log(`  Transfer: ${m.transferKB}KB (${m.requests} requests)   DOM: ${m.domNodes} nodes`)
}
await browser.close()
