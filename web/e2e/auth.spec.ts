import { test, expect } from '@playwright/test'
import { mockFirebaseAuth, mockBackendAPIs } from './mocks'

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // Wait for the lazy-loaded page to render
    await page.waitForSelector('input#email', { timeout: 10_000 })
  })

  test('renders all login form elements', async ({ page }) => {
    // Brand header
    await expect(page.getByText('CodeFlow 2.0')).toBeVisible()
    await expect(page.getByText('Log in to your workspace')).toBeVisible()

    // Social login buttons
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible()

    // Email/password form
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

    // Navigation links
    await expect(page.getByRole('link', { name: /forgot\?/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /register/i })).toBeVisible()
  })

  test('shows validation errors on empty submit', async ({ page }) => {
    // The submit button should be disabled when fields are empty
    const submitBtn = page.getByRole('button', { name: /sign in/i })
    await expect(submitBtn).toBeDisabled()
  })

  test('submit button enables when fields are filled', async ({ page }) => {
    await page.fill('input#email', 'test@example.com')
    await page.fill('input#password', 'password123')
    const submitBtn = page.getByRole('button', { name: /sign in/i })
    await expect(submitBtn).toBeEnabled()
  })

  test('navigates to register page', async ({ page }) => {
    await page.getByRole('link', { name: /register/i }).click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('navigates to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: /forgot\?/i }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })

  test('social login buttons are present and clickable', async ({ page }) => {
    const googleBtn = page.getByRole('button', { name: /continue with google/i })
    await expect(googleBtn).toBeEnabled()

    const githubBtn = page.getByRole('button', { name: /continue with github/i })
    await expect(githubBtn).toBeEnabled()
  })
})

test.describe('Login Flow — End-to-End Auth', () => {
  test('successful email/password login redirects to dashboard', async ({ page }) => {
    // Mock Firebase Auth endpoints + backend APIs
    await mockFirebaseAuth(page)
    await mockBackendAPIs(page)

    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })

    await page.fill('input#email', 'admin@codeflow.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')

    // Should redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page.getByText(/senior dashboard/i)).toBeVisible({ timeout: 10_000 })
  })

  test('login page redirects to dashboard when already authenticated', async ({ page }) => {
    // First log in
    await mockFirebaseAuth(page)
    await mockBackendAPIs(page)

    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@codeflow.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Navigate back to login — should be redirected away
    await page.goto('/login')
    await page.waitForURL('**/dashboard', { timeout: 10_000 })
  })
})

test.describe('Registration Page', () => {
  test('renders registration form', async ({ page }) => {
    await page.goto('/register')
    await page.waitForSelector('input#name', { timeout: 10_000 })

    await expect(page.getByText(/create your account/i)).toBeVisible()
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
