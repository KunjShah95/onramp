import fs from 'node:fs'
import path from 'node:path'

const SRC = 'src'
const appFile = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8')

// ── 1. Routes from App.tsx ──────────────────────────────────────────────
const allRoutes = [...appFile.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
const routes = [...new Set(allRoutes)]
  .filter((p) => p !== '*')
  .map((p) => (p.replace(/\/+$/, '') || '/'))

// ── 2. Collect every file in src ────────────────────────────────────────
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(full)
  }
  return out
}
const files = walk(SRC).filter((f) => !/\.(test|spec)\./.test(f))

// ── 3. Extract link/navigate targets ────────────────────────────────────
const targets = new Set()
const dynamicLinks = []
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const grab = (re) => [...text.matchAll(re)].map((m) => m[1])
  for (const t of [
    ...grab(/to="([^"]+)"/g),
    ...grab(/to=\{['"]([^'"]+)['"]\}/g),
    ...grab(/to=\{`([^`]+)`\}/g),
    ...grab(/href="([^"]+)"/g),
    ...grab(/navigate\(['"]([^'"]+)['"]\)/g),
    ...grab(/navigate\(`([^`]+)`\)/g),
    ...grab(/navigate\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]) {
    if (t.includes('${')) dynamicLinks.push(`${t}  <- ${path.relative(SRC, file)}`)
    else if (t.startsWith('/')) targets.add(t.split(/[?#]/)[0].replace(/\/+$/, '') || '/')
  }
}

// ── 4. Route matching (dynamic segments wildcard) ───────────────────────
function segments(p) {
  return p.split('/').filter(Boolean)
}
function matchesRoute(link, route) {
  const ls = segments(link)
  const rs = segments(route)
  if (rs.length !== ls.length) return false
  return rs.every((r, i) => r.startsWith(':') || r === ls[i])
}
function findRoute(link) {
  return routes.find((r) => matchesRoute(link, r)) || null
}

// ── 5. Orphan routes: no inbound link, no navigate, no dynamic ref ──────
const linked = new Set()
for (const t of targets) {
  const r = findRoute(t)
  if (r) linked.add(r)
}
const orphans = routes.filter((r) => !linked.has(r))

// ── 6. Dead links: targets that match no route (ignoring / and anchors) ─
const deadLinks = [...new Set([...targets].filter((t) => t !== '/' && !findRoute(t)))]

// ── 7. Page files not referenced anywhere in src ────────────────────────
const pageFiles = fs
  .readdirSync(path.join(SRC, 'pages'))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => f.replace(/\.tsx?$/, ''))
const allSrc = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const unreferencedPages = pageFiles.filter(
  (p) => !new RegExp(`['"]\\.\\.?/pages/${p}['"]|['"]@/pages/${p}['"]|from ['\"]\\.\\./pages/${p}`).test(allSrc) && !allSrc.includes(`pages/${p}`)
)

console.log('=== ROUTES (' + routes.length + ') ===')
console.log(routes.join('\n'))
console.log('\n=== ORPHAN ROUTES (no inbound link / navigate) ===')
console.log(orphans.length ? orphans.join('\n') : '(none)')
console.log('\n=== DYNAMIC LINKS (template literals, could not resolve) ===')
console.log(dynamicLinks.length ? dynamicLinks.join('\n') : '(none)')
console.log('\n=== DEAD LINKS (point at no route) ===')
console.log(deadLinks.length ? deadLinks.join('\n') : '(none)')
console.log('\n=== PAGE FILES NOT IMPORTED ANYWHERE ===')
console.log(unreferencedPages.length ? unreferencedPages.join('\n') : '(none)')
