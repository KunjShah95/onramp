import { test, expect } from '@playwright/test'
import {
  mockNeonAuth,
  mockBackendAPIs,
  mockReviewQueueAPI,
} from './mocks'

test.describe('Review Queue', () => {
  test.beforeEach(async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockReviewQueueAPI(page)

    // Log in
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.waitForTimeout(300)

    // Navigate to review queue
    await page.goto('/reviews')
    await page.waitForSelector('text=Review Queue', { timeout: 10_000 })
  })

  test('renders review queue page with header', async ({ page }) => {
    await expect(page.getByText('Review Queue').first()).toBeVisible()
    await expect(page.getByText(/review pending pull requests/i)).toBeVisible()
  })

  test('displays task list with review-eligible items', async ({ page }) => {
    // Wait for the cascading data fetches: listTeams → setTeamId → listTasks
    // Use a generous timeout for data to load through the mock chain
    await page.waitForTimeout(5000)
    await expect(page.getByText(/complete react component library/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/add input validation to signup form/i).first()).toBeVisible()
    await expect(page.getByText(/refactor api service layer/i).first()).toBeVisible()
  })

  test('shows filter tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^all$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^pending$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^in review$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^approved$/i }).first()).toBeVisible()
  })

  test('filters tasks by status', async ({ page }) => {
    await page.getByRole('button', { name: /^approved$/i }).first().click()
    await page.waitForTimeout(500)
    await expect(page.getByText(/queue is clear/i)).toBeVisible({ timeout: 5_000 })
  })

  test('shows quick stats', async ({ page }) => {
    await expect(page.getByText('Pending').first()).toBeVisible()
    await expect(page.getByText('In Review').first()).toBeVisible()
    await expect(page.getByText('Approved').first()).toBeVisible()
  })

  test('status labels show correct state', async ({ page }) => {
    await page.waitForTimeout(500)
    const statusLabel = page.getByText(/^Pending( |$)/).first()
    await expect(statusLabel).toBeVisible({ timeout: 10_000 })
  })
})
