import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGES = [
  ['/', 'landing'],
  ['/login', 'login'],
  ['/register', 'register'],
  ['/pricing', 'pricing'],
  ['/docs', 'docs'],
  ['/changelog', 'changelog'],
  ['/forgot-password', 'forgot-password'],
  ['/privacy', 'privacy'],
  ['/terms', 'terms'],
  ['/about', 'about'],
  ['/why-onramp', 'why-onramp'],
  ['/contact', 'contact'],
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

async function settle(page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { opacity: 1 !important; transform: none !important; transition: none !important; animation: none !important; }',
  })
}

for (const [path, name] of PAGES) {
  try {
    await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500) // let lazy chunks + fonts settle
    await settle(page)
    await page.waitForTimeout(300)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()

    console.log(`\n═══ ${name} (${path}) ═══`)
    console.log(`  violations: ${results.violations.length}, passes: ${results.passes.length}, incomplete: ${results.incomplete.length}`)

    for (const v of results.violations) {
      console.log(`\n  ❌ ${v.id} (${v.impact}) — ${v.help}`)
      for (const node of v.nodes) {
        const target = node.target?.join(' ') || '?'
        const html = (node.html || '').replace(/\s+/g, ' ').slice(0, 160)
        const summary = node.failureSummary?.replace(/\n/g, ' | ').slice(0, 200) || ''
        console.log(`     • ${target}`)
        console.log(`       ${html}`)
        if (summary) console.log(`       ${summary}`)
      }
    }

    // Landmark + heading structure quick check
    const structure = await page.evaluate(() => {
      const roles = ['banner', 'navigation', 'main', 'contentinfo']
      const found = {}
      for (const r of roles) found[r] = document.querySelectorAll(`[role="${r}"], ${r === 'main' ? 'main' : r === 'navigation' ? 'nav' : r === 'banner' ? 'header' : 'footer'}`).length
      return found
    })
    console.log(`  landmarks: ${JSON.stringify(structure)}`)
  } catch (e) {
    console.log(`\n═══ ${name} (${path}) ═══ ERROR: ${e.message?.slice(0, 120)}`)
  }
}

await browser.close()
