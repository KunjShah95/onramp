import { chromium } from '@playwright/test'

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

const VIEWPORTS = [
  [320, 568, 'mobile-320'],
  [375, 667, 'mobile-375'],
  [768, 1024, 'tablet-768'],
  [1024, 768, 'laptop-1024'],
  [1440, 900, 'desktop-1440'],
]

const browser = await chromium.launch()

let issues = 0
for (const [path, name] of PAGES) {
  for (const [w, h, label] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await context.newPage()
    try {
      await page.goto(`http://localhost:5173${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(1200)

      const r = await page.evaluate(() => {
        const doc = document.documentElement
        const scrollW = doc.scrollWidth
        const clientW = doc.clientWidth
        if (scrollW <= clientW + 1) return null
        // find the outermost offenders
        const offenders = []
        const seen = new Set()
        const walk = (el) => {
          for (const child of el.children) {
            const rect = child.getBoundingClientRect()
            if (rect.right > clientW + 1 && rect.width > 0) {
              const key = `${child.tagName}.${(child.className || '').toString().slice(0, 60)}`
              if (!seen.has(key)) {
                seen.add(key)
                const txt = (child.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)
                offenders.push({ tag: child.tagName.toLowerCase(), cls: key.slice(key.indexOf('.') + 1), right: Math.round(rect.right), txt })
              }
            }
            if (offenders.length < 6) walk(child)
          }
        }
        walk(document.body)
        return { scrollW, clientW, offenders: offenders.slice(0, 6) }
      })

      if (r) {
        issues++
        console.log(`\n⚠️  ${name} @ ${label} (${w}px) — scrollWidth=${r.scrollW}px clientWidth=${r.clientW}px`)
        for (const o of r.offenders) {
          console.log(`    <${o.tag} class="${o.cls}"> right=${o.right}px "${o.txt}"`)
        }
      } else {
        console.log(`✅ ${name} @ ${label} (${w}px) — no horizontal scroll`)
      }
    } catch (e) {
      console.log(`❌ ${name} @ ${label} — ERROR: ${e.message?.slice(0, 100)}`)
    }
    await context.close()
  }
}

console.log(`\n═══ ${issues} page/viewport combos with horizontal overflow ═══`)
await browser.close()
