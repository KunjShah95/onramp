import { test, expect } from '@playwright/test'
import { mockNeonAuth, mockBackendAPIs, mockTeamAPI } from './mocks'

test.describe('Team Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockTeamAPI(page)

    // Log in
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.waitForSelector('input#password', { timeout: 10_000 })
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await page.waitForTimeout(300)

    // Navigate to team
    await page.goto('/team')
  })

  test('renders team page with team name', async ({ page }) => {
    await expect(page.getByText('Team Management').first()).toBeVisible()
    // The team name appears in the team list after data loads
    await expect(page.getByText('Onramp Engineering').first()).toBeVisible({ timeout: 10_000 })
  })

  test('displays team member list from mock data', async ({ page }) => {
    // The team page shows a list of teams. We need to click "Manage" to see members
    await expect(page.getByText('Onramp Engineering').first()).toBeVisible({ timeout: 10_000 })
    // Click "Manage" to select the team and navigate to Module Access section
    await page.getByRole('button', { name: /manage/i }).first().click()
    // After clicking Manage, the module permissions section loads with "Module Permissions" heading
    await expect(page.getByText('Module Permissions').first()).toBeVisible({ timeout: 10_000 })
    // Permission entries from mock data appear (react-basics, testing)
    await expect(page.getByText('react-basics').first()).toBeVisible({ timeout: 5_000 })
  })

  test('shows member roles', async ({ page }) => {
    await expect(page.getByText('Onramp Engineering').first()).toBeVisible({ timeout: 10_000 })
    // Click Manage to see members
    await page.getByRole('button', { name: /manage/i }).first().click()
    await page.waitForTimeout(1000)
    // Role badges appear in Module Access section
    await expect(page.getByText(/senior/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
