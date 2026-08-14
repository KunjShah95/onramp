import { test, expect } from '@playwright/test'
import { mockNeonAuth, mockBackendAPIs, mockExploreAPI } from './mocks'

test.describe('Explore Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockExploreAPI(page)

    // Log in
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.waitForSelector('input#password', { timeout: 10_000 })
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Navigate to explore
    await page.goto('/explore')
    await page.waitForSelector('input[placeholder*="github.com/owner/repo"]', { timeout: 10_000 })
  })

  test('renders explore page header and search input', async ({ page }) => {
    await expect(page.getByText('Architecture Explorer').first()).toBeVisible()
    await expect(page.getByPlaceholder(/github\.com/i)).toBeVisible()
  })

  test('analyze button is disabled when repo name is empty', async ({ page }) => {
    const analyzeBtn = page.getByRole('button', { name: /analyze/i })
    await expect(analyzeBtn).toBeDisabled()
  })

  test('shows analysis results after submitting a repo URL', async ({ page }) => {
    await page.fill('input[placeholder*="github.com/owner/repo"]', 'github.com/test/repo')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Wait for results — metric cards show "Total Files: 2"
    await expect(page.getByText('2').first()).toBeVisible({ timeout: 10_000 })
    // Architecture pattern card shows "layered"
    await expect(page.getByText('layered').first()).toBeVisible()
    // Pattern heading appears
    await expect(page.getByText('Pattern').first()).toBeVisible()
  })

  test('displays architecture summary section', async ({ page }) => {
    await page.fill('input[placeholder*="github.com/owner/repo"]', 'github.com/test/repo')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Wait for services section
    await expect(page.getByText('Services').first()).toBeVisible({ timeout: 10_000 })
    // Service chips appear — use .first() to avoid strict mode
    await expect(page.getByText('frontend').first()).toBeVisible()
  })

  test('handles invalid repo URL gracefully', async ({ page }) => {
    // Override the mock to return an error
    await page.route('**/api/v1/explore/analyze', async (route) => {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Failed to analyze repository: Repository not found' }),
      })
    })

    await page.fill('input[placeholder*="github.com/owner/repo"]', 'github.com/invalid/repo')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Error message appears — use .first() to avoid strict mode
    await expect(page.getByText(/failed to analyze/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
