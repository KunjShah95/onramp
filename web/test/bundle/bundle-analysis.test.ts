/**
 * Bundle Size Analysis
 *
 * Reads the built JS/CSS bundle sizes from `dist/` after a production build
 * and asserts they stay within defined budgets.  Run after `npm run build`.
 *
 * Run:  npm run build && npx vitest run test/bundle/bundle-analysis.test.ts
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const DIST_DIR = path.resolve(__dirname, '../../dist')

// ── Size budgets (gzipped) ──────────────────────────────────────────
// Adjust these as the app grows.  Run `npm run build` and check sizes.
// Current actuals (Aug 2026): 1338KB JS, 268KB largest chunk, 69KB CSS,
// 9.96MB total assets.  Budgets include ~10-25% headroom so real regressions
// (accidental duplicate deps, un-lazy-loaded pages) still fail CI.
const BUDGETS = {
  totalJsGzipKb: 1500,      // Total JS (all chunks, gzipped)
  maxChunkGzipKb: 300,      // Largest single JS chunk (gzipped)
  totalCssGzipKb: 100,      // Total CSS (all files, gzipped)
  maxHtmlKb: 50,            // index.html
  totalAssetsKb: 11000,     // All built assets combined (React 19 + Recharts + Framer Motion + D3)
}

// Simple gzip-size estimation (reads file sizes; actual gzip is ~60-70% of original)
function estimateGzipSize(bytes: number): number {
  return Math.round(bytes * 0.65 / 1024)  // ~65% compression ratio
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

  it('total JS (gzip estimated) is under budget', () => {
    const jsFiles = files.filter(f => f.endsWith('.js'))
    const totalBytes = jsFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0)
    const gzipKb = estimateGzipSize(totalBytes)

    console.log(`\n  [BUNDLE] JS files: ${jsFiles.length}`)
    console.log(`  [BUNDLE] Total JS: ${(totalBytes / 1024).toFixed(0)}KB raw, ~${gzipKb}KB gzip`)

    for (const f of jsFiles.slice(0, 10)) {
      const kb = (fs.statSync(f).size / 1024).toFixed(0)
      console.log(`  [BUNDLE]   ${path.relative(DIST_DIR, f)}: ${kb}KB`)
    }

    expect(gzipKb).toBeLessThan(BUDGETS.totalJsGzipKb)
  })

  it('largest JS chunk (gzip estimated) is under budget', () => {
    const jsFiles = files.filter(f => f.endsWith('.js'))
    const largest = jsFiles.reduce(
      (max, f) => {
        const size = fs.statSync(f).size
        return size > max.size ? { file: f, size } : max
      },
      { file: '', size: 0 }
    )

    const gzipKb = estimateGzipSize(largest.size)
    const relPath = path.relative(DIST_DIR, largest.file)
    console.log(`\n  [BUNDLE] Largest chunk: ${relPath} — ${(largest.size / 1024).toFixed(0)}KB raw, ~${gzipKb}KB gzip`)

    expect(gzipKb).toBeLessThan(BUDGETS.maxChunkGzipKb)
  })

  it('total CSS (gzip estimated) is under budget', () => {
    const cssFiles = files.filter(f => f.endsWith('.css'))
    const totalBytes = cssFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0)
    const gzipKb = estimateGzipSize(totalBytes)

    console.log(`\n  [BUNDLE] CSS files: ${cssFiles.length}`)
    console.log(`  [BUNDLE] Total CSS: ${(totalBytes / 1024).toFixed(0)}KB raw, ~${gzipKb}KB gzip`)

    expect(gzipKb).toBeLessThan(BUDGETS.totalCssGzipKb)
  })

  it('index.html size is under budget', () => {
    const htmlFile = path.join(DIST_DIR, 'index.html')
    if (!fs.existsSync(htmlFile)) {
      console.log('  [BUNDLE] No index.html found (SPA may not build static HTML)')
      return  // Skip if no index.html (e.g., Vite SPA with fallback)
    }
    const kb = fs.statSync(htmlFile).size / 1024
    console.log(`\n  [BUNDLE] index.html: ${kb.toFixed(1)}KB`)

    expect(kb).toBeLessThan(BUDGETS.maxHtmlKb)
  })

  it('total built assets are under budget', () => {
    const assetFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase()
      return ['.js', '.css', '.html', '.svg', '.png', '.ico', '.json'].includes(ext)
    })
    const totalBytes = assetFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0)
    const mb = (totalBytes / 1024 / 1024).toFixed(2)

    console.log(`\n  [BUNDLE] All built assets: ${assetFiles.length} files, ${mb}MB`)

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
