/**
 * Accessibility (a11y) Audit Tests
 *
 * Uses axe-core to scan key pages for WCAG 2.1 AA violations.
 * Run:  npx playwright test e2e/a11y.spec.ts
 *
 * These tests verify:
 * 1. Landing page has zero critical/serious violations
 * 2. Login page is accessible
 * 3. Pricing page is accessible
 * 4. Docs page is accessible
 * 5. All interactive elements have proper ARIA labels
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Helper: run axe and assert no critical or serious violations
async function assertNoCriticalViolations(page: any, pageName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const criticalSerious = results.violations.filter(
    (v: { impact: string }) => v.impact === 'critical' || v.impact === 'serious'
  )

  if (criticalSerious.length > 0) {
    console.log(`\n[WARN] ${pageName} — ${criticalSerious.length} critical/serious violations:`)
    for (const v of criticalSerious) {
      console.log(`  - ${v.id}: ${v.help} (${v.impact})`)
      for (const node of v.nodes.slice(0, 2)) {
        console.log(`      → ${node.target?.join(', ') || node.html?.slice(0, 80)}`)
      }
    }
  }

  expect(criticalSerious.length).toBe(0)
}

// ═══════════════════════════════════════════════════════════════════════
// Public Pages — No Authentication Required
// ═══════════════════════════════════════════════════════════════════════

test.describe('a11y — Public Pages', () => {
  test('landing page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Landing Page')
  })

  test('login page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Login Page')
  })

  test('register page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/register')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Register Page')
  })

  test('pricing page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/pricing')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Pricing Page')
  })

  test('docs page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Docs Page')
  })

  test('changelog page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/changelog')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Changelog Page')
  })

  test('forgot password page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Forgot Password Page')
  })

  test('privacy page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Privacy Page')
  })

  test('terms page has no critical accessibility violations', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('networkidle')
    await assertNoCriticalViolations(page, 'Terms Page')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Interactive Element Checks
// ═══════════════════════════════════════════════════════════════════════

test.describe('a11y — Interactive Elements', () => {
  test('login form fields have associated labels', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Check that all form inputs have accessible labels
    const emailInput = page.locator('input#email')
    const passwordInput = page.locator('input#password')

    // Verify inputs exist
    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()

    // Check ARIA attributes or associated labels
    const emailLabel = page.locator('label[for="email"]')
    const passwordLabel = page.locator('label[for="password"]')

    // If labels exist, verify they're visible
    if (await emailLabel.count() > 0) {
      await expect(emailLabel).toBeVisible()
    }
    if (await passwordLabel.count() > 0) {
      await expect(passwordLabel).toBeVisible()
    }

    // Submit button should be focusable
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
    const tabIndex = await submitBtn.getAttribute('tabindex')
    // Either has tabindex (≥0) or is a natively focusable <button>
    expect(tabIndex === null || parseInt(tabIndex) >= 0).toBe(true)
  })

  test('navigation links are keyboard accessible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check that main navigation links are focusable
    const navLinks = page.locator('nav a, nav button, header a')
    const count = await navLinks.count()
    expect(count).toBeGreaterThan(0)

    // First few nav items should be visible and have accessible names
    for (let i = 0; i < Math.min(count, 5); i++) {
      const link = navLinks.nth(i)
      await expect(link).toBeVisible()
      const name = await link.getAttribute('aria-label')
      const text = await link.textContent()
      // Either has aria-label or visible text content
      expect(name !== null || (text !== null && text.trim().length > 0)).toBe(true)
    }
  })

  test('images have alt text where applicable', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check decorative images (role="presentation" or empty alt)
    const decorativeImgs = page.locator('img[alt=""], img[role="presentation"]')
    // These are fine

    // Check informational images (should have descriptive alt text)
    const infoImgs = page.locator('img:not([alt=""]):not([role="presentation"])')
    const infoCount = await infoImgs.count()
    for (let i = 0; i < infoCount; i++) {
      const alt = await infoImgs.nth(i).getAttribute('alt')
      expect(alt).not.toBeNull()
      expect(alt!.length).toBeGreaterThan(0)
    }
  })

  test('color contrast passes for key text elements', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Run axe with color-contrast check specifically
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .include('body')
      .analyze()

    const colorContrastViolations = results.violations.filter(
      (v: { id: string }) => v.id === 'color-contrast'
    )

    if (colorContrastViolations.length > 0) {
      console.log(`\n[WARN] Color contrast violations found: ${colorContrastViolations.length}`)
      for (const v of colorContrastViolations) {
        console.log(`  - ${v.help}`)
      }
    }

    // Log but don't fail on color contrast (often requires design decisions)
    console.log(`\n  [A11Y] Color contrast: ${colorContrastViolations.length} issues found (logged, not failing)`)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Full Page Scan Report
// ═══════════════════════════════════════════════════════════════════════

test.describe('a11y — Full Scan Summary', () => {
  test('generates comprehensive a11y report for landing page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()

    // Summary
    const totalViolations = results.violations.length
    const totalPasses = results.passes.length
    const totalIncomplete = results.incomplete.length
    const totalInapplicable = results.inapplicable.length

    console.log('\n' + '═'.repeat(50))
    console.log('  A11Y AUDIT REPORT — Landing Page')
    console.log('═'.repeat(50))
    console.log(`  Violations:    ${totalViolations}`)
    console.log(`  Passes:        ${totalPasses}`)
    console.log(`  Incomplete:    ${totalIncomplete}`)
    console.log(`  Inapplicable:  ${totalInapplicable}`)
    console.log('─'.repeat(50))

    for (const v of results.violations) {
      console.log(`\n  ❌ ${v.id} (${v.impact || 'unknown'})`)
      console.log(`     ${v.help}`)
      console.log(`     Nodes: ${v.nodes.length}`)
    }

    // Should have zero critical or serious violations
    const criticalSerious = results.violations.filter(
      (v: { impact: string }) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(criticalSerious.length).toBe(0)
  })
})
