import { test, expect } from '@playwright/test'
import {
  mockNeonAuth,
  mockBackendAPIs,
  mockDashboardAPI,
} from './mocks'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
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
    await page.waitForSelector('text=Mission Control', { timeout: 10_000 })
  })

  test('renders dashboard header with crew metrics', async ({ page }) => {
    await expect(page.getByText('Mission Control').first()).toBeVisible()
    await expect(page.getByText(/8 crew/i).first()).toBeVisible()
    await expect(page.getByText(/5 trainees?/i).first()).toBeVisible()

    const totalTasks = page.locator('text=42').first()
    await expect(totalTasks).toBeVisible()
    await expect(page.getByText('43%').first()).toBeVisible()
  })

  test('displays task distribution donut chart', async ({ page }) => {
    await expect(page.getByText('Signal Matrix').first()).toBeVisible()
    await expect(page.getByText('Completed').first()).toBeVisible()
    await expect(page.getByText('In Progress').first()).toBeVisible()
    await expect(page.getByText('Pending Review').first()).toBeVisible()
    await expect(page.getByText('Blocked').first()).toBeVisible()
  })

  test('shows velocity trajectory chart', async ({ page }) => {
    await expect(page.getByText('Velocity').first()).toBeVisible()
  })

  test('pending reviews section shows review queue link', async ({ page }) => {
    await expect(page.getByText('Review Queue').first()).toBeVisible()
    const reviewBtn = page.getByRole('button', { name: /review queue/i })
    await expect(reviewBtn).toBeVisible()
  })

  test('displays review queue items', async ({ page }) => {
    await expect(page.getByText(/implement user authentication flow/i)).toBeVisible()
    await expect(page.getByText(/add unit tests for api client/i)).toBeVisible()
  })

  test('tab navigation switches views', async ({ page }) => {
    // Click "Reviews" tab — switches to the pending reviews panel
    await page.locator('button').filter({ hasText: /^Reviews/ }).first().click()
    await expect(page.getByText('Pending Reviews').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/implement user authentication flow/i).first()).toBeVisible()

    // Click "DORA" tab
    await page.locator('button').filter({ hasText: /^DORA/ }).first().click()
    await expect(page.getByText('DORA Metrics').first()).toBeVisible()

    // Click "Overview" tab
    await page.locator('button').filter({ hasText: /^Overview/ }).first().click()
    await expect(page.getByText('Mission Control')).toBeVisible()
  })
})
