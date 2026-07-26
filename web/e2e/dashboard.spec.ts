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
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.waitForSelector('text=Mission Control', { timeout: 10_000 })
  })

  test('renders dashboard header with crew metrics', async ({ page }) => {
    await expect(page.getByText('Mission Control').first()).toBeVisible()
    await expect(page.getByText(/8 crew/i)).toBeVisible()
    await expect(page.getByText(/5 trainees?/i)).toBeVisible()

    const totalTasks = page.locator('text=42').first()
    await expect(totalTasks).toBeVisible()
    await expect(page.getByText('43%').first()).toBeVisible()
  })

  test('displays task distribution donut chart', async ({ page }) => {
    await expect(page.getByText('Task Distribution').first()).toBeVisible()
    await expect(page.getByText('Completed').first()).toBeVisible()
    await expect(page.getByText('In Progress').first()).toBeVisible()
    await expect(page.getByText('Pending Review').first()).toBeVisible()
    await expect(page.getByText('Blocked').first()).toBeVisible()
  })

  test('shows crew completion bar chart', async ({ page }) => {
    await expect(page.getByText('Crew Completion').first()).toBeVisible()
    await expect(page.getByText('Alice Chen').first()).toBeVisible({ timeout: 5_000 })
  })

  test('pending reviews section shows review queue link', async ({ page }) => {
    await expect(page.getByText('Pending Reviews').first()).toBeVisible()
    const reviewBtn = page.getByRole('button', { name: /review queue/i })
    await expect(reviewBtn).toBeVisible()
  })

  test('displays recent activity feed', async ({ page }) => {
    await expect(page.getByText('Recent Activity').first()).toBeVisible()
    await expect(page.getByText(/setup ci\/cd pipeline/i)).toBeVisible()
    await expect(page.getByText(/error boundary component/i)).toBeVisible()
  })

  test('tab navigation switches views', async ({ page }) => {
    // Click "Crew" tab — the tabs are the first group of buttons with these labels
    // Tab buttons are in the header, before any panel buttons
    await page.locator('button').filter({ hasText: /^Crew/ }).first().click()
    await expect(page.getByText('Crew Roster').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Alice Chen').first()).toBeVisible()

    // Click "Reviews" tab
    await page.locator('button').filter({ hasText: /^Reviews/ }).first().click()
    await expect(page.getByText(/pending reviews/i).first()).toBeVisible()

    // Click "Overview" tab
    await page.locator('button').filter({ hasText: /^Overview/ }).first().click()
    await expect(page.getByText('Mission Control')).toBeVisible()
  })
})
