import { test, expect } from '@playwright/test'
import { mockNeonAuth, mockBackendAPIs, mockBillingAPI } from './mocks'

test.describe('Billing Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockBillingAPI(page)

    // Log in
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.waitForTimeout(500)

    // Navigate to billing
    await page.goto('/billing')
    await page.waitForSelector('text=Billing & Plans', { timeout: 10_000 })
  })

  test('renders billing page header', async ({ page }) => {
    await expect(page.getByText('Billing & Plans').first()).toBeVisible()
  })

  test('displays current subscription from mock data', async ({ page }) => {
    // The subscription card shows "Current Plan" heading
    await expect(page.getByText('Current Plan').first()).toBeVisible()
    // The tier badge shows "pro" — the subscription badge is capitalized "PRO"
    // to avoid ambiguity, also check the price
    await expect(page.getByText('$49').first()).toBeVisible()
  })

  test('shows pricing tier cards', async ({ page }) => {
    await expect(page.getByText('Available Plans').first()).toBeVisible()
    // Free tier card should be visible
    await expect(page.getByText('Free').first()).toBeVisible()
    // Professional tier should be visible
    await expect(page.getByText('Professional').first()).toBeVisible()
  })

  test('displays plan features', async ({ page }) => {
    // Feature items are shown with checkmarks
    await expect(page.getByText('1 team member').first()).toBeVisible()
    await expect(page.getByText('Community support').first()).toBeVisible()
  })

  test('shows Choose buttons for non-current tiers', async ({ page }) => {
    // At least one "Choose" button should be visible
    const chooseBtn = page.getByRole('button', { name: /choose/i }).first()
    await expect(chooseBtn).toBeVisible({ timeout: 5_000 })
  })

  test('shows active subscription status', async ({ page }) => {
    // The subscription status badge — use .first()
    await expect(page.getByText('active').first()).toBeVisible({ timeout: 5_000 })
  })
})
