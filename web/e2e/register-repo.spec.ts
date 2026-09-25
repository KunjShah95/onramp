import { test, expect } from '@playwright/test'
import { mockNeonAuth, mockBackendAPIs, mockExploreAPI } from './mocks'

/**
 * An unregistered repo used to dead-end in a 403. Now Explore offers
 * "Add to my team" (senior roles), registers it, and retries the analysis.
 */
test.describe('Register repository from Explore', () => {
  test('403 not-registered → Add to my team → analysis succeeds', async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockExploreAPI(page)

    let registered = false
    const registrations: string[] = []
    // First analyze call is refused until the repo is registered.
    await page.route(/\/api\/v1\/explore\/analyze(?:\?|$)/, async (route) => {
      if (!registered) {
        return route.fulfill({ status: 403, contentType: 'application/json',
          body: JSON.stringify({ detail: 'Repository is not registered for an accessible team' }) })
      }
      return route.fallback()
    })
    await page.route(/\/api\/v1\/repos\?name=/, async (route) => {
      registrations.push(route.request().url())
      registered = true
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'r1', owner: 'acme', name: 'widgets', status: 'ready', last_analyzed: '' }) })
    })

    await page.goto('/login')
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    await page.goto('/explore')
    await page.fill('input[placeholder*="github.com/owner/repo"]', 'github.com/acme/widgets')
    await page.getByRole('button', { name: /analyze/i }).click()

    await expect(page.getByText(/isn.t registered to your team/)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /Add to my team/ }).click()

    await expect(page.getByText(/isn.t registered to your team/)).toBeHidden({ timeout: 10_000 })
    expect(registrations).toHaveLength(1)
    expect(registrations[0]).toContain('owner=acme')
    expect(registrations[0]).toContain('name=widgets')
    expect(decodeURIComponent(registrations[0])).toContain('url=https://github.com/acme/widgets')
  })
})
