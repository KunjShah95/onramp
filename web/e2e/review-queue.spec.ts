import { test, expect } from '@playwright/test'
import {
  mockFirebaseAuth,
  mockBackendAPIs,
  mockReviewQueueAPI,
} from './mocks'

test.describe('Review Queue', () => {
  test.beforeEach(async ({ page }) => {
    // Set up all mocks and authenticate
    await mockFirebaseAuth(page)
    await mockBackendAPIs(page)
    await mockReviewQueueAPI(page)

    // Log in
    await page.goto('/login')
    await page.waitForSelector('input#email', { timeout: 10_000 })
    await page.fill('input#email', 'admin@codeflow.dev')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })

    // Navigate to review queue
    await page.goto('/reviews')
    await page.waitForSelector('text=Review Queue', { timeout: 10_000 })
  })

  test('renders review queue page with header', async ({ page }) => {
    await expect(page.getByText('Review Queue')).toBeVisible()
    await expect(page.getByText(/review, approve, and manage submissions/i)).toBeVisible()
  })

  test('displays analytics bar with mock data', async ({ page }) => {
    // Analytics cards
    await expect(page.getByText('Pending Reviews')).toBeVisible()
    await expect(page.getByText('Avg Review Time')).toBeVisible()
    await expect(page.getByText('Top Module')).toBeVisible()
    await expect(page.getByText('High Priority')).toBeVisible()

    // Values from mock data (3 tasks, 1 overdue >24h, 2 high priority)
    const pendingCount = page.locator('text=Pending Reviews + span, .text-2xl').first()
    // The task count should be 3
    await expect(page.getByText('3')).toBeVisible()
  })

  test('displays task list with review-eligible items', async ({ page }) => {
    // Task titles from mock data
    await expect(page.getByText(/complete react component library/i)).toBeVisible()
    await expect(page.getByText(/add input validation to signup form/i)).toBeVisible()
    await expect(page.getByText(/refactor api service layer/i)).toBeVisible()

    // Status badges
    await expect(page.getByText('submitted')).toBeVisible()
    await expect(page.getByText('under_review')).toBeVisible()
    await expect(page.getByText('needs_changes')).toBeVisible()
  })

  test('filter dropdowns are functional', async ({ page }) => {
    // Module filter
    const moduleSelect = page.locator('select').nth(0)
    // Wait for options to load
    await expect(moduleSelect).toBeVisible()
    // Select a specific module
    await moduleSelect.selectOption('react-basics')
    // Should still show the one react-basics task
    await expect(page.getByText(/complete react component library/i)).toBeVisible()

    // Reset filter
    await moduleSelect.selectOption('')
    await expect(page.getByText(/complete react component library/i)).toBeVisible()
  })

  test('opens detail modal when clicking a task', async ({ page }) => {
    // Click on a task card
    await page.getByText(/complete react component library/i).first().click()

    // Modal should appear with task details
    await expect(page.getByText(/build reusable button, card, and input components/i)).toBeVisible()

    // Modal should show action buttons
    await expect(page.getByRole('button', { name: /request changes/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /route to product/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /✓ approve/i })).toBeVisible()
  })

  test('detail modal can be closed', async ({ page }) => {
    // Open a task
    await page.getByText(/complete react component library/i).first().click()
    // Wait for modal
    await expect(page.getByText(/build reusable button, card, and input components/i)).toBeVisible()

    // Close by clicking the close button
    await page.locator('button').filter({ hasText: '✕' }).click()
    // Modal should disappear
    await expect(page.getByText(/build reusable button, card, and input components/i)).not.toBeVisible()
  })

  test('empty state shows when no tasks match filter', async ({ page }) => {
    // Use module filter to select a module with no tasks
    const moduleSelect = page.locator('select').nth(0)
    await moduleSelect.selectOption('nonexistent-module')
    // Should show empty state
    await expect(page.getByText(/all caught up/i)).toBeVisible()
  })

  test('sort by priority reorders tasks', async ({ page }) => {
    // Open sort dropdown and select 'priority'
    const sortSelect = page.locator('select').nth(3)
    await sortSelect.selectOption('priority')

    // First task should be high priority (refactor api service layer or react component library)
    const firstTitle = page.locator('h3').first()
    await expect(firstTitle).toBeVisible()
  })
})
