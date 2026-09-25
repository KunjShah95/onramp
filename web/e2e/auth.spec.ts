import { test, expect } from '@playwright/test'
import { mockNeonAuth, mockBackendAPIs, mockDashboardAPI, FAKE_UID, FAKE_EMAIL, FAKE_NAME } from './mocks'

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // Wait for the lazy-loaded page to render
    await page.waitForSelector('input#email', { timeout: 10_000 })
  })

  test('renders all login form elements', async ({ page }) => {
    // Brand header — page shows "Onramp"
    await expect(page.getByText('Onramp').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()

    // Social login — rendered as <a> tags; the "Continue with …" label is
    // exposed as the accessible name (aria-label), so query by role/name
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue with GitHub' })).toBeVisible()

    // Stage 1 — email only
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible()

    // Advance to stage 2 — password + final submit + links
    await page.fill('input#email', 'test@example.com')
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /forgot\?/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /create free account/i })).toBeVisible()
  })

  test('shows validation errors on empty submit', async ({ page }) => {
    // Stage 1 continue button is disabled while email is empty
    const continueBtn = page.getByRole('button', { name: /continue/i })
    await expect(continueBtn).toBeDisabled()
  })

  test('submit button enables when fields are filled', async ({ page }) => {
    await page.fill('input#email', 'test@example.com')
    await page.getByRole('button', { name: /continue/i }).click()
    const submitBtn = page.getByRole('button', { name: /sign in/i })
    // Disabled until a password is entered
    await expect(submitBtn).toBeDisabled()
    await page.fill('input#password', 'password123')
    await expect(submitBtn).toBeEnabled()
  })

  test('navigates to register page', async ({ page }) => {
    await page.getByRole('link', { name: /create free account/i }).click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('navigates to forgot password page', async ({ page }) => {
    await page.fill('input#email', 'test@example.com')
    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('link', { name: /forgot\?/i }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('social login buttons are present and clickable', async ({ page }) => {
    const googleLink = page.getByRole('link', { name: 'Continue with Google' })
    await expect(googleLink).toBeVisible()

    const githubLink = page.getByRole('link', { name: 'Continue with GitHub' })
    await expect(githubLink).toBeVisible()
  })
})

test.describe('Login Flow — End-to-End Auth', () => {
  test('successful email/password login redirects to dashboard', async ({ page }) => {
    // Mock Neon Auth + backend + dashboard APIs
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockDashboardAPI(page)

    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })

    // Stage 1 — submit email to advance
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.waitForSelector('input#password', { timeout: 10_000 })

    // Stage 2 — password + final submit
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')

    // Should redirect to dashboard — page title is "Mission Control"
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible({ timeout: 15_000 })
  })

  test('login page remains public when a session already exists', async ({ page }) => {
    // First log in
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockDashboardAPI(page)

    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.waitForSelector('input#password', { timeout: 10_000 })
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.waitForTimeout(500)

    // The login route is intentionally public; it must not perform a session
    // bootstrap or redirect away from a user who opens it directly.
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('input#email')).toBeVisible()
  })

  test('hydrates a session from an HttpOnly cookie', async ({ page }) => {
    await page.context().addCookies([{
      name: 'onramp_access_token',
      value: 'http-only-access-token',
      domain: 'localhost',
      path: '/api',
      httpOnly: true,
      sameSite: 'Lax',
    }])
    await mockBackendAPIs(page)
    // Replace the shared auth/me route with one that verifies the browser
    // actually sent the HttpOnly cookie on the cross-port API request.
    await page.unroute('**/api/v1/auth/me')
    let cookieWasSent = false
    await page.route('**/api/v1/auth/me', async (route) => {
      const headers = await route.request().allHeaders()
      cookieWasSent = (headers.cookie || '').includes('onramp_access_token=http-only-access-token')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid: FAKE_UID,
          email: FAKE_EMAIL,
          name: FAKE_NAME,
          provider: 'password',
        }),
      })
    })
    await mockDashboardAPI(page)

    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible({ timeout: 15_000 })
    expect(cookieWasSent).toBe(true)
  })
})

test.describe('Registration Page', () => {
  test('renders registration form', async ({ page }) => {
    await page.goto('/register')
    await page.waitForSelector('input#name', { timeout: 10_000 })

    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()
    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
  })

  test('navigates to login page from register', async ({ page }) => {
    await page.goto('/register')
    await page.waitForSelector('input#name', { timeout: 10_000 })
    await page.getByRole('link', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
