/**
 * Bundle Size Analysis
 *
 * Reads the built JS/CSS bundle sizes from `dist/` after a production build
 * and asserts they stay within defined budgets.  Run after `npm run build`.
 *
 * Gzip metrics use real zlib compression (level 9) per file, matching what a
 * CDN/webserver actually serves — each chunk is fetched and decompressed
 * individually, so per-file gzip sums are the true on-wire weight.
 *
 * Run:  npm run build && npx vitest run test/bundle/bundle-analysis.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { gzipSync } from 'zlib'

const DIST_DIR = path.resolve(__dirname, '../../dist')

// ── Size budgets ────────────────────────────────────────────────────
// Gzip budgets are real zlib-gzipped KB. Raw budgets (index.html, total
// assets) measure bytes on disk. Adjust these as the app grows — run
// `npm run build` and check sizes.
// Current actuals (Aug 2026): 683KB JS gzipped, 92KB largest chunk
// gzipped (vendor-charts/Recharts), 20KB CSS gzipped, 5.2MB total raw
// assets. @phosphor-icons is deliberately NOT in a manual chunk (see
// vite.config.ts) — forcing it into one chunk put 443KB raw / ~96KB gzip on
// every page's critical path via modulepreload; Rollup now co-locates icons
// with the pages that use them. Babylon is lazy-only (the landing hero uses
// the static SVG map).
// JS and raw-asset budgets carry ~10-25% headroom so real regressions
// (accidental duplicate deps, un-lazy-loaded pages) still fail CI; CSS and
// index.html are generous caps that mainly guard against runaway growth.
const BUDGETS = {
  totalJsGzipKb: 1250,      // Total JS (all chunks, gzipped)
  maxChunkGzipKb: 330,      // Largest single JS chunk (gzipped)
  totalCssGzipKb: 50,       // Total CSS (all files, gzipped)
  maxHtmlKb: 50,            // index.html (raw)
  totalAssetsKb: 13800,     // All built assets combined, raw (React 19 + Recharts + Framer Motion + D3 + Babylon)
}

// Real gzip size of a file in KB (zlib, max compression). Replaces the old
// ~65% linear estimate, which roughly doubled the true on-wire weight of
// minified JS.
function gzipKbOf(filePath: string): number {
  return gzipSync(fs.readFileSync(filePath), { level: 9 }).length / 1024
}

describe('Bundle Size Budgets', () => {
  let files: string[]

  beforeAll(() => {
    if (!fs.existsSync(DIST_DIR)) {
      throw new Error(
        `dist/ directory not found at ${DIST_DIR}. Run 'npm run build' first.`
      )
    }
    files = getAllFiles(DIST_DIR)
  })

  it('total JS (gzipped) is under budget', () => {
    const jsFiles = files.filter(f => f.endsWith('.js'))
    const totalGzipKb = jsFiles.reduce((sum, f) => sum + gzipKbOf(f), 0)

    console.log(`\n  [BUNDLE] JS files: ${jsFiles.length}`)
    console.log(`  [BUNDLE] Total JS: ${totalGzipKb.toFixed(0)}KB gzipped`)

    for (const f of jsFiles.slice(0, 10)) {
      const rawKb = (fs.statSync(f).size / 1024).toFixed(0)
      console.log(`  [BUNDLE]   ${path.relative(DIST_DIR, f)}: ${rawKb}KB raw, ${gzipKbOf(f).toFixed(1)}KB gzip`)
    }

    expect(totalGzipKb).toBeLessThan(BUDGETS.totalJsGzipKb)
  })

  it('largest JS chunk (gzipped) is under budget', () => {
    const jsFiles = files.filter(f => f.endsWith('.js'))
    let largest = { file: '', gzip: 0 }
    for (const f of jsFiles) {
      const g = gzipKbOf(f)
      if (g > largest.gzip) largest = { file: f, gzip: g }
    }

    const rawKb = (fs.statSync(largest.file).size / 1024).toFixed(0)
    const relPath = path.relative(DIST_DIR, largest.file)
    console.log(`\n  [BUNDLE] Largest chunk: ${relPath} — ${rawKb}KB raw, ${largest.gzip.toFixed(1)}KB gzip`)

    expect(largest.gzip).toBeLessThan(BUDGETS.maxChunkGzipKb)
  })

  it('total CSS (gzipped) is under budget', () => {
    const cssFiles = files.filter(f => f.endsWith('.css'))
    const totalGzipKb = cssFiles.reduce((sum, f) => sum + gzipKbOf(f), 0)

    console.log(`\n  [BUNDLE] CSS files: ${cssFiles.length}`)
    console.log(`  [BUNDLE] Total CSS: ${totalGzipKb.toFixed(0)}KB gzipped`)

    expect(totalGzipKb).toBeLessThan(BUDGETS.totalCssGzipKb)
  })

  it('index.html size is under budget', () => {
    const htmlFile = path.join(DIST_DIR, 'index.html')
    if (!fs.existsSync(htmlFile)) {
      console.log('  [BUNDLE] No index.html found (SPA may not build static HTML)')
      return  // Skip if no index.html (e.g., Vite SPA with fallback)
    }
    const kb = fs.statSync(htmlFile).size / 1024
    console.log(`\n  [BUNDLE] index.html: ${kb.toFixed(1)}KB raw`)

    expect(kb).toBeLessThan(BUDGETS.maxHtmlKb)
  })

  it('total built assets are under budget', () => {
    const assetFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase()
      return ['.js', '.css', '.html', '.svg', '.png', '.ico', '.json'].includes(ext)
    })
    const totalBytes = assetFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0)
    const mb = (totalBytes / 1024 / 1024).toFixed(2)

    console.log(`\n  [BUNDLE] All built assets: ${assetFiles.length} files, ${mb}MB raw`)

    expect(totalBytes / 1024).toBeLessThan(BUDGETS.totalAssetsKb)
  })
})

// ── Helper: recursive file listing ──────────────────────────────────
function getAllFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }

  return files
}
