/**
 * seo-assets.mjs — postbuild SEO pass (runs after `vite build`).
 *
 * 1. Resolves the canonical host from the built index.html (Vite already
 *    substitutes %VITE_APP_URL%), falling back to $VITE_APP_URL, then
 *    https://onramp.app. Rewrites that host into dist/sitemap.xml and
 *    dist/robots.txt so they never disagree with the canonical URLs.
 * 2. Generates per-route static snapshots (dist/seo/*.html) from
 *    dist/index.html with the correct <title>, description, canonical and
 *    OG/Twitter tags baked in. The SPA shell + JS are identical, so users
 *    see the same app — but crawlers / link unfurlers without JS get
 *    correct per-route metadata. Served via explicit rewrites in vercel.json.
 *
 * Route manifest mirrors the <Seo> props in src/pages/*.tsx — keep in sync
 * when adding public pages (LandingPage, PricingPage, WhyOnrampPage,
 * DocsPage, ChangelogPage, SupportPage, AboutPage, BlogPage, BlogPostPage,
 * ContactPage, CustomersPage, SecurityPage, SOC2Page, DPAPage, PrivacyPage,
 * TermsPage + slugs in src/data/blog.ts).
 *
 * --check mode: `node scripts/seo-assets.mjs --check` verifies the manifest
 * without building — every ROUTES entry must exist as a <Route path> in
 * src/App.tsx and every /blog/* slug must exist in src/data/blog.ts.
 * Wire it into CI so manifest drift fails fast. App routes NOT in ROUTES
 * are reported as info only (auth pages like /login are intentionally
 * excluded from snapshots).
 *
 * Host policy (fail-closed): when VITE_APP_URL is unset the canonical host
 * falls back to https://onramp.app. That is fine for local runs, but under
 * CI (process.env.CI set) it is a hard error — prod builds must set
 * VITE_APP_URL. Bypass explicitly with ALLOW_DEFAULT_HOST=1.
 *
 * Sitemap lastmod: stamped per-URL from git history (last commit touching
 * the route's source file, see ROUTE_SOURCES). Falls back to today when
 * git is unavailable (e.g. shallow/VCS-less CI).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const FALLBACK_HOST = 'https://onramp.app'

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Keep in sync with src/pages + src/data/blog.ts (see header comment).
const ROUTES = [
  {
    route: '/',
    file: 'index.html',
    title: 'Onramp · Onboarding in days, not months',
    description:
      'Onramp turns your repo into a live ramp — learning paths, graded tasks, and a review queue. New devs land their first merged PR faster, seniors stop re-answering the same questions.',
  },
  {
    route: '/why-onramp',
    file: 'why-onramp.html',
    title: 'Why Onramp, Not Coding Agents | Onramp',
    description:
      'Coding agents burn tokens re-reading your codebase on every change. Onramp indexes it once and answers from real context, a fraction of the cost at any team size.',
  },
  {
    route: '/docs',
    file: 'docs.html',
    title: 'Documentation · Onramp',
    description: 'Guides, API references, and setup walkthroughs for the whole Onramp platform.',
  },
  {
    route: '/changelog',
    file: 'changelog.html',
    title: 'Changelog · Onramp',
    description: 'Product updates and release notes for Onramp · the AI-powered developer onboarding platform.',
  },
  {
    route: '/support',
    file: 'support.html',
    title: 'Support · Onramp',
    description: 'How can we help? Pick a channel and we usually respond within one business day.',
  },
  {
    route: '/about',
    file: 'about.html',
    title: 'About · Onramp',
    description: 'The team and mission behind Onramp · AI-powered developer onboarding for modern engineering teams.',
  },
  {
    route: '/blog',
    file: 'blog.html',
    title: 'Blog · Onramp',
    description: 'Engineering insights, product updates, and best practices on developer onboarding and team velocity.',
  },
  {
    route: '/blog/onboarding-hidden-tax-engineering-velocity',
    file: 'blog-onboarding-hidden-tax-engineering-velocity.html',
    title: 'Why onboarding is the hidden tax on engineering velocity | Onramp Blog',
    description:
      "Every new hire spends their first weeks piecing together tribal knowledge. Here's how that adds up, and what you can do about it.",
    type: 'article',
  },
  {
    route: '/blog/introducing-architecture-drift-detection',
    file: 'blog-introducing-architecture-drift-detection.html',
    title: 'Introducing architecture drift detection | Onramp Blog',
    description:
      "Your codebase evolves. Your docs shouldn't lag behind. We're shipping real-time drift detection that flags deviations as they happen.",
    type: 'article',
  },
  {
    route: '/blog/how-we-built-codebase-aware-ai-mentor',
    file: 'blog-how-we-built-codebase-aware-ai-mentor.html',
    title: 'How we built a codebase-aware AI mentor | Onramp Blog',
    description:
      "Behind the scenes of Onramp's AI: how we parse, index, and ground answers in real repository structure, with tenant-scoped derived context.",
    type: 'article',
  },
  {
    route: '/blog/measuring-time-to-first-pr',
    file: 'blog-measuring-time-to-first-pr.html',
    title: 'Measuring time-to-first-PR: a framework for onboarding velocity | Onramp Blog',
    description:
      "If you can't measure it, you can't improve it. Here's how to benchmark and reduce the time between a developer's first commit and first merged PR.",
    type: 'article',
  },
  {
    route: '/blog/onramp-achieves-soc-2-type-ii-certification',
    file: 'blog-onramp-achieves-soc-2-type-ii-certification.html',
    title: 'SOC 2 Type II: work in progress | Onramp Blog',
    description:
      'SOC 2 Type II audit work is in progress. Onramp is not yet certified; see the security page for current status.',
    type: 'article',
  },
  {
    route: '/contact',
    file: 'contact.html',
    title: 'Contact · Onramp',
    description: 'Talk to the Onramp team. We get back to you within one business day.',
  },
  {
    route: '/customers',
    file: 'customers.html',
    title: 'Validation program · Onramp',
    description: 'Current Onramp validation signals and design-partner program for repository-grounded onboarding.',
  },
  {
    route: '/security',
    file: 'security.html',
    title: 'Security · Onramp',
    description:
      'Onramp security practices: encryption, access controls, SOC 2 Type II audit status, GDPR control progress, and a responsible disclosure program.',
  },
  {
    route: '/soc-2',
    file: 'soc-2.html',
    title: 'SOC 2 Type II · Onramp',
    description: 'SOC 2 Type II audit work in progress. Onramp is not yet certified.',
  },
  {
    route: '/dpa',
    file: 'dpa.html',
    title: 'Data processing status · Onramp',
    description: 'Current Onramp data-processing program status and DPA roadmap.',
  },
  {
    route: '/privacy',
    file: 'privacy.html',
    title: 'Privacy Policy · Onramp',
    description: 'How Onramp collects, uses, and protects your information across the web app, API, and SDK.',
  },
  {
    route: '/terms',
    file: 'terms.html',
    title: 'Terms of Service · Onramp',
    description: 'The terms that govern your use of Onramp, including liability limits and responsibilities when using AI-generated output.',
  },
]

function resolveBase(template) {
  const m = template.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)
  if (m && /^https?:\/\//.test(m[1])) return { base: m[1].replace(/\/+$/, '') || FALLBACK_HOST, fallback: false }
  const env = process.env.VITE_APP_URL?.replace(/\/+$/, '')
  if (env && /^https?:\/\//.test(env)) return { base: env, fallback: false }
  return { base: FALLBACK_HOST, fallback: true }
}

// Route → source file (relative to web/) for sitemap lastmod stamping.
const ROUTE_SOURCES = {
  '/': 'src/pages/LandingPage.tsx',
  '/why-onramp': 'src/pages/WhyOnrampPage.tsx',
  '/docs': 'src/pages/DocsPage.tsx',
  '/changelog': 'src/pages/ChangelogPage.tsx',
  '/support': 'src/pages/SupportPage.tsx',
  '/about': 'src/pages/AboutPage.tsx',
  '/blog': 'src/pages/BlogPage.tsx',
  '/contact': 'src/pages/ContactPage.tsx',
  '/customers': 'src/pages/CustomersPage.tsx',
  '/security': 'src/pages/SecurityPage.tsx',
  '/soc-2': 'src/pages/SOC2Page.tsx',
  '/dpa': 'src/pages/DPAPage.tsx',
  '/privacy': 'src/pages/PrivacyPage.tsx',
  '/terms': 'src/pages/TermsPage.tsx',
}
const BLOG_SOURCE = 'src/data/blog.ts'

function gitLastmod(relPath) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relPath], {
      cwd: join(root, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out
  } catch { /* git unavailable — fall through to today */ }
  return new Date().toISOString().slice(0, 10)
}

function stampLastmod(xml, base) {
  return xml.replace(/<url>([\s\S]*?)<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)
    if (!loc) return block
    let route = loc[1].startsWith(base) ? loc[1].slice(base.length) : null
    if (route == null) return block
    if (route === '') route = '/'
    const source = route.startsWith('/blog/') ? BLOG_SOURCE : ROUTE_SOURCES[route]
    if (!source) return block
    const date = gitLastmod(source)
    if (/<lastmod>/.test(block)) {
      return block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`)
    }
    return block.replace(/<\/loc>/, `</loc>\n    <lastmod>${date}</lastmod>`)
  })
}

// ── --check mode: manifest sync verification (no build needed) ──
if (process.argv.includes('--check')) {
  const errors = []
  const appSrc = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
  const appPaths = new Set([...appSrc.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))
  for (const entry of ROUTES) {
    if (entry.route.startsWith('/blog/')) continue // checked against blog data below
    if (!appPaths.has(entry.route)) {
      errors.push(`ROUTES entry '${entry.route}' has no <Route path> in src/App.tsx`)
    }
  }
  const blogSrc = readFileSync(join(root, 'src', 'data', 'blog.ts'), 'utf8')
  const slugs = new Set([...blogSrc.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]))
  for (const entry of ROUTES) {
    if (!entry.route.startsWith('/blog/')) continue
    const slug = entry.route.slice('/blog/'.length)
    if (!slugs.has(slug)) errors.push(`blog ROUTES entry '${entry.route}' has no slug in src/data/blog.ts`)
  }
  const manifestRoutes = new Set(ROUTES.map((e) => e.route))
  const marker = 'Protected routes'
  const publicSection = appSrc.includes(marker) ? appSrc.slice(0, appSrc.indexOf(marker)) : appSrc
  const publicPaths = [...publicSection.matchAll(/path="([^"]+)"/g)].map((m) => m[1])
  for (const p of publicPaths) {
    if (p !== '*' && !p.includes(':') && !manifestRoutes.has(p)) {
      console.log(`[seo-assets:check] info: App public route '${p}' has no snapshot (auth pages are intentionally excluded)`)
    }
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`[seo-assets:check] ERROR: ${e}`)
    process.exit(1)
  }
  console.log(`[seo-assets:check] ok — ${ROUTES.length} manifest entries in sync`)
  process.exit(0)
}

function buildSnapshot(template, base, entry) {
  const url = `${base}${entry.route === '/' ? '/' : entry.route}`
  const type = entry.type ?? 'website'
  const image = `${base}/og-image.png`
  let html = template
  // Unresolved Vite placeholder (VITE_APP_URL unset at build time) → use resolved base.
  html = html.split('%VITE_APP_URL%').join(base)
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(entry.title)}</title>`)
  html = html.replace(
    /(<meta[^>]*name="description"[^>]*content=")[^"]*(")/,
    (_m, a, b) => `${a}${esc(entry.description)}${b}`,
  )
  html = html.replace(
    /(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")/,
    (_m, a, b) => `${a}${esc(url)}${b}`,
  )
  const prop = (p, v) =>
    html.replace(
      new RegExp(`(<meta[^>]*property="${p}"[^>]*content=")[^"]*(")`),
      (_m, a, b) => `${a}${esc(v)}${b}`,
    )
  const name = (n, v) =>
    html.replace(
      new RegExp(`(<meta[^>]*name="${n}"[^>]*content=")[^"]*(")`),
      (_m, a, b) => `${a}${esc(v)}${b}`,
    )
  html = prop('og:title', entry.title)
  html = prop('og:description', entry.description)
  html = prop('og:type', type)
  html = prop('og:url', url)
  html = prop('og:image', image)
  html = prop('og:image:alt', entry.title)
  html = name('twitter:title', entry.title)
  html = name('twitter:description', entry.description)
  html = name('twitter:image', image)
  html = name('twitter:image:alt', entry.title)
  return html
}

const indexPath = join(dist, 'index.html')
if (!existsSync(indexPath)) {
  console.error('[seo-assets] dist/index.html not found — run `vite build` first.')
  process.exit(1)
}
const template = readFileSync(indexPath, 'utf8')
const { base, fallback } = resolveBase(template)
console.log(`[seo-assets] canonical host: ${base}${fallback ? ' (fallback)' : ''}`)

// Fail-closed host: a prod/CI build without VITE_APP_URL would ship
// snapshots + sitemap pointing at the placeholder host. Refuse, unless
// explicitly bypassed with ALLOW_DEFAULT_HOST=1.
if (fallback && !process.env.ALLOW_DEFAULT_HOST) {
  if (process.env.CI) {
    console.error('[seo-assets] ERROR: VITE_APP_URL is unset — refusing to build SEO assets against the fallback host. Set VITE_APP_URL (or ALLOW_DEFAULT_HOST=1 to override).')
    process.exit(1)
  }
  console.warn('[seo-assets] VITE_APP_URL is unset — using fallback host https://onramp.app (local only).')
}

// 1. Host rewrite for sitemap + robots so they match the canonical URLs.
for (const asset of ['sitemap.xml', 'robots.txt']) {
  const p = join(dist, asset)
  if (!existsSync(p)) {
    console.warn(`[seo-assets] dist/${asset} missing — skipping.`)
    continue
  }
  let after = readFileSync(p, 'utf8').split(FALLBACK_HOST).join(base)
  if (asset === 'sitemap.xml') {
    const stamped = stampLastmod(after, base)
    if (stamped !== after) {
      after = stamped
      console.log('[seo-assets] stamped sitemap lastmod from git history')
    }
  }
  const before = readFileSync(p, 'utf8')
  if (after !== before) {
    writeFileSync(p, after)
    console.log(`[seo-assets] rewrote host in dist/${asset}`)
  } else {
    console.log(`[seo-assets] dist/${asset} already host-consistent`)
  }
}

// 2. Per-route snapshots.
const seoDir = join(dist, 'seo')
mkdirSync(seoDir, { recursive: true })
for (const entry of ROUTES) {
  const html = buildSnapshot(template, base, entry)
  writeFileSync(join(seoDir, entry.file), html)
}
console.log(`[seo-assets] wrote ${ROUTES.length} snapshots to dist/seo/`)
