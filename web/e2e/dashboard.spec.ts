import { test, expect } from '@playwright/test'
import {
  mockNeonAuth,
  mockBackendAPIs,
  mockDashboardAPI,
} from './mocks'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Set up all mocks and authenticate
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockDashboardAPI(page)

    // Log in and navigate to dashboard
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
  })

  test('renders dashboard header with team metrics', async ({ page }) => {
    // Header
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText(/8 members?/i)).toBeVisible()
    await expect(page.getByText(/5 trainees?/i)).toBeVisible()

    // Metric cards (some should have our mock data values)
    await expect(page.getByText('42')).toBeVisible() // total tasks
    await expect(page.getByText('43%')).toBeVisible() // completion rate
  })

  test('displays task distribution donut chart', async ({ page }) => {
    // The donut chart section
    await expect(page.getByText('Task Distribution')).toBeVisible()
    // All task states should appear in the legend
    await expect(page.getByText('Completed')).toBeVisible()
    await expect(page.getByText('In Progress')).toBeVisible()
    await expect(page.getByText('Pending Review')).toBeVisible()
    await expect(page.getByText('Blocked')).toBeVisible()
  })

  test('shows member completion bar chart', async ({ page }) => {
    await expect(page.getByText('Member Completion Rates')).toBeVisible()
    // Team member names from mock data
    await expect(page.getByText(/Alice Chen/i)).toBeVisible()
    await expect(page.getByText(/Bob Martinez/i)).toBeVisible()
  })

  test('pending reviews section shows review queue link', async ({ page }) => {
    await expect(page.getByText('Pending Reviews')).toBeVisible()
    // Should link to the review queue
    const reviewLink = page.getByRole('button', { name: /review queue/i })
    await expect(reviewLink).toBeVisible()
  })

  test('displays recent activity feed', async ({ page }) => {
    await expect(page.getByText('Recent Activity')).toBeVisible()
    // Recent activity from mock data
    await expect(page.getByText(/setup ci\/cd pipeline/i)).toBeVisible()
    await expect(page.getByText(/error boundary component/i)).toBeVisible()
  })

  test('tab navigation switches views', async ({ page }) => {
    // Click "Trainees" tab
    await page.getByRole('button', { name: /trainees/i }).click()
    await expect(page.getByText('All Team Members')).toBeVisible()
    await expect(page.getByText('Alice Chen')).toBeVisible()
    await expect(page.getByText('Carol Nguyen')).toBeVisible()

    // Click "Reviews" tab
    await page.getByRole('button', { name: /^reviews$/i }).click()
    await expect(page.getByText(/pending reviews/i)).toBeVisible()

    // Click "Activity" tab
    await page.getByRole('button', { name: /^activity$/i }).click()
    await expect(page.getByText(/recent activity/i)).toBeVisible()
  })

  test('requires senior+ role — member user gets blocked', async ({ page }) => {
    // Override team mock to return a "member" role
    await page.route('**/api/v1/teams?user=current-user', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          teams: [
            {
              team_id: 'team-42',
              name: 'Onramp Engineering',
              owner: 'owner-1',
              tier: 'pro',
              members: ['test-user-001'],
              created_at: '2025-01-01T00:00:00Z',
              role: 'member',
            },
          ],
        }),
      })
    })

    // Re-login
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'trainee@onramp.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')

    // Navigating to dashboard should redirect away
    await page.goto('/dashboard')
    // Should NOT show the dashboard
    await expect(page.getByText('Dashboard')).not.toBeVisible({ timeout: 5_000 })
  })
})
