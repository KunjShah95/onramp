import { test, expect, type Page } from '@playwright/test'
import {
  mockNeonAuth,
  mockBackendAPIs,
  mockDashboardAPI,
  mockReposAPI,
  mockRepoHealthAPI,
} from './mocks'

/**
 * New-developer → allocated-repo access flow.
 *
 * Mirrors the backend E2E (backend/scripts/e2e_new_dev_repo_access.py) at the
 * UI level: a new dev signs in, the dashboard loads the repo allocated to
 * their team from GET /api/v1/repos, and the dev can pull live analysis for
 * that repo (Code Health page → POST .../repos/octocat/Hello-World/health).
 *
 * The Code Health metric is a <Link to="/code-health"> in DashboardPage, so
 * assertions scope to `a[href="/code-health"]` to avoid matching stray text.
 */
test.describe('New Dev → Allocated Repo Access', () => {
  test.beforeEach(async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockDashboardAPI(page)
    await mockReposAPI(page)
    await mockRepoHealthAPI(page)
  })

  /** Sign in and land on the dashboard. */
  async function signInAsNewDev(page: Page) {
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.waitForSelector('input#password', { timeout: 10_000 })
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
  }

  test('dashboard surfaces the repo allocated to the new dev via Code Health', async ({ page }) => {
    await signInAsNewDev(page)

    // Landing on the dashboard should fetch GET /api/v1/repos for the dev's
    // team, then pull a health score for the first (allocated) repo. The
    // "Repo Health" readout renders that score — proof the repo was visible.
    await expect(page.getByText('Mission Control')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Repo Health').first()).toBeVisible({ timeout: 15_000 })
    // Value comes from the mocked health endpoint for octocat/Hello-World
    await expect(page.getByText('85%').first()).toBeVisible({ timeout: 10_000 })
  })

  test('new dev can analyze the allocated repo on the Code Health page', async ({ page }) => {
    await signInAsNewDev(page)
    await page.goto('/code-health')
    await page.waitForSelector('input[placeholder="github.com/owner/repo"]', { timeout: 10_000 })

    // The dev analyzes the repo allocated to their team
    await page.fill('input[placeholder="github.com/owner/repo"]', 'octocat/Hello-World')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Results render from the mocked health endpoint
    await expect(page.getByText('Excellent').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Test Coverage').first()).toBeVisible()
    await expect(page.getByText('72%').first()).toBeVisible()
    // Recommendation list from the health payload
    await expect(page.getByText(/Add more tests/i).first()).toBeVisible()
  })

  test('code health link routes to the allocated repo analysis page', async ({ page }) => {
    await signInAsNewDev(page)
    await expect(page.getByText('Mission Control')).toBeVisible({ timeout: 15_000 })

    // The sidebar's Code Health link routes to /code-health
    await page.locator('aside a[href="/code-health"]').first().click()
    await expect(page).toHaveURL(/\/code-health/)
    await expect(page.getByPlaceholder(/github\.com\/owner\/repo/i)).toBeVisible()
  })

  test('dev with no allocated repo sees no repo-backed health on dashboard', async ({ page }) => {
    // Override the repos mock to return an empty list — the isolation case
    // mirrored from the backend E2E (outsider / no team allocation). This
    // MUST be registered before sign-in so the dashboard's repos query fires
    // against the empty mock deterministically (React Query caches the
    // beforeEach result for 60s; a late override would be a race).
    await page.route(/\/api\/v1\/repos(\?|$)/, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ repos: [] }),
      })
    })
    await signInAsNewDev(page)

    await expect(page.getByText('Mission Control')).toBeVisible({ timeout: 15_000 })
    // No repo → health never fetched → Repo Health renders the em-dash placeholder
    await expect(page.getByText('Repo Health').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('—').first()).toBeVisible({ timeout: 10_000 })
  })
})
