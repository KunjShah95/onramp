// Screenshot every route, grouped by the user flows in docs/figma-kit/userflows.mmd.
// Usage: ONRAMP_DEMO_PASSWORD=... node scripts/capture-flow-screens.mjs  (web on :5173, api on :8000)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.resolve(process.env.OUT_DIR || '../screenshots');
const PASSWORD = process.env.ONRAMP_DEMO_PASSWORD;
if (!PASSWORD) {
  console.error('Set ONRAMP_DEMO_PASSWORD to the Foundation team account password.');
  process.exit(1);
}
const VIEWPORT = { width: 1440, height: 900 };
const USERS = (process.env.USERS || 'senior1@foundation.dev,junior1@foundation.dev').split(',');

// [flow, route, label] — order follows the flow diagram
const PUBLIC = [
  ['F7', '/', 'landing'],
  ['F7', '/why-onramp', 'why-onramp'],
  ['F7', '/pricing', 'pricing'],
  ['F7', '/docs', 'docs'],
  ['F7', '/blog', 'blog'],
  ['F7', '/customers', 'customers'],
  ['F7', '/compare', 'compare'],
  ['F1', '/register', 'register'],
  ['F2', '/login', 'login'],
  ['F2', '/join', 'join'],
  ['F2', '/forgot-password', 'forgot-password'],
  ['F2', '/reset-password', 'reset-password'],
  ['F2', '/verify-email', 'verify-email'],
  ['F2', '/set-password', 'set-password'],
  ['Other', '/about', 'about'],
  ['Other', '/contact', 'contact'],
  ['Other', '/changelog', 'changelog'],
  ['Other', '/security', 'security'],
  ['Other', '/trust', 'trust'],
  ['Other', '/soc-2', 'soc-2'],
  ['Other', '/dpa', 'dpa'],
  ['Other', '/privacy', 'privacy'],
  ['Other', '/terms', 'terms'],
  ['Other', '/this-page-does-not-exist', '404'],
];

const APP = [
  ['F2', '/onboarding-hub', 'onboarding-hub'],
  ['F2', '/dashboard', 'dashboard'],
  ['F1', '/explore', 'explore'],
  ['F1', '/learn', 'learn'],
  ['F1', '/first-issue', 'first-issue'],
  ['F1', '/tasks', 'tasks'],
  ['F1', '/reviews', 'reviews'],
  ['F1', '/my-progress', 'my-progress'],
  ['F3', '/autonomous', 'autopilot'],
  ['F4', '/pricing', 'pricing'],
  ['F4', '/billing', 'billing'],
  ['F5', '/developer-portal', 'developer-portal'],
  ['F5', '/settings', 'settings'],
  ['Other', '/ask', 'ask'],
  ['Other', '/team', 'team'],
  ['Other', '/profile', 'profile'],
  ['Other', '/notifications', 'notifications'],
  ['Other', '/onboarding-plan', 'onboarding-plan'],
  ['Other', '/senior-space', 'senior-space'],
  ['Other', '/dev-space', 'dev-space'],
  ['Other', '/code-health', 'code-health'],
  ['Other', '/drift', 'drift'],
  ['Other', '/ramp', 'ramp'],
  ['Other', '/marketplace', 'marketplace'],
  ['Other', '/playbooks', 'playbooks'],
  ['Other', '/pr-describe', 'pr-describe'],
  ['Other', '/reports', 'reports'],
  ['Other', '/wiki', 'wiki'],
  ['Other', '/work-graph', 'work-graph'],
  ['Other', '/support', 'support'],
  ['Other', '/executive', 'executive'],
  ['Other', '/hr-dashboard', 'hr-dashboard'],
  ['Other', '/hr/people', 'hr-people'],
  ['Other', '/admin', 'admin'],
  ['Other', '/admin/create-account', 'admin-create-account'],
  ['Other', '/admin/audit', 'admin-audit'],
  ['Other', '/admin/feature-flags', 'admin-feature-flags'],
];

async function settle(page) {
  await page.waitForTimeout(1500); // let the route render (SPA nav fires no load event)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // Remote DB is slow: wait until skeleton loaders are gone, twice in a row (lazy chunk → data fetch)
  for (let pass = 0; pass < 2; pass++) {
    await page
      .waitForFunction(() => !document.querySelector('.animate-skeleton, .animate-pulse'), null, { timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1000); // entrance animations
}

// AppShell scrolls inside <main> (h-screen + overflow-hidden), so fullPage alone stops at the fold.
// Grow the viewport to fit main's content, shoot, then restore.
async function fullShot(page, file) {
  const h = await page.evaluate(() => {
    const m = document.querySelector('main');
    if (!m || m.scrollHeight <= m.clientHeight) return 0;
    return Math.ceil(m.getBoundingClientRect().top + m.scrollHeight);
  });
  if (h > VIEWPORT.height) {
    await page.setViewportSize({ width: VIEWPORT.width, height: Math.min(h, 12000) });
    await page.waitForTimeout(800); // re-layout; panels below the fold only now start fetching
    await page
      .waitForFunction(() => !document.querySelector('main .animate-spin, main .animate-skeleton, main .animate-pulse'), null, { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: file, fullPage: true });
  if (h > VIEWPORT.height) await page.setViewportSize(VIEWPORT);
}

async function shoot(page, dir, i, [flow, route, label], log) {
  const file = path.join(dir, `${String(i + 1).padStart(2, '0')}_${flow}_${label}.png`);
  try {
    if (page.url().startsWith(BASE)) {
      // In-app navigation: a full reload re-hits /auth/me and trips the auth rate limiter
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
    } else {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    await settle(page);
    for (let n = 0; n < 5 && (await page.getByText('Connection interrupted').count()); n++) {
      await page.waitForTimeout(15000);
      await page.getByRole('button', { name: 'Retry' }).click().catch(() => {});
      await settle(page);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await fullShot(page, file);
    const landed = new URL(page.url()).pathname;
    if (landed !== route) fs.rmSync(file); // role-gated / alias: page would duplicate the landing one
    log.push({ flow, route, landed, file: path.relative(OUT, file), redirected: landed !== route });
    console.log(`  ok  ${route}${landed !== route ? `  -> ${landed}` : ''}`);
  } catch (e) {
    log.push({ flow, route, error: String(e.message).split('\n')[0] });
    console.log(`  ERR ${route}: ${e.message.split('\n')[0]}`);
  }
}

async function login(page, email) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', email);
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="password"]', { timeout: 15000 });
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  await settle(page);
}

const browser = await chromium.launch();
const log = {};

if (!process.env.SKIP_PUBLIC) {
  const dir = path.join(OUT, '00_public');
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  console.log('public');
  log.public = [];
  for (const [i, r] of PUBLIC.entries()) await shoot(page, dir, i, r, log.public);
  await ctx.close();
}

for (const email of USERS) {
  const who = email.split('@')[0];
  const dir = path.join(OUT, who);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  console.log(who);
  await login(page, email);
  console.log(`  logged in -> ${new URL(page.url()).pathname}`);
  await fullShot(page, path.join(dir, '00_F2_post-login.png'));
  log[who] = [];
  for (const [i, r] of APP.entries()) await shoot(page, dir, i, r, log[who]);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, `index${process.env.SKIP_PUBLIC ? '-' + Object.keys(log).join('-') : ''}.json`), JSON.stringify(log, null, 2));
console.log(`done -> ${OUT}`);
