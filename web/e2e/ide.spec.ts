import { test, expect, type Page } from '@playwright/test'
import { mockNeonAuth, mockBackendAPIs, mockDashboardAPI, mockReposAPI } from './mocks'

/**
 * In-browser IDE (Autonomous Coding): open repo → tree → file → agent proposal
 * lands as a working-copy change → commit sends the edited content → PR link.
 * GitHub-backed endpoints are mocked; nothing leaves the browser.
 */
const IDE = '**/api/v1/repos/octocat/Hello-World/ide'

async function mockIde(page: Page) {
  const commits: any[] = []
  await page.route(`${IDE}/tree*`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ref: 'main', sha: 'abc1234def', truncated: false, entries: [
      { path: 'src', type: 'dir', size: null },
      { path: 'src/greet.py', type: 'file', size: 30 },
      { path: 'README.md', type: 'file', size: 12 },
    ] }),
  }))
  await page.route(`${IDE}/file*`, (route) => {
    const path = new URL(route.request().url()).searchParams.get('path')
    const content = path === 'src/greet.py' ? "def greet():\n    return 'helo'\n" : '# Hello\n'
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ path, ref: 'main', size: content.length, binary: false, too_large: false, content }) })
  })
  await page.route(`${IDE}/propose`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, status: 'proposed', summary: 'typo',
      analysis: { root_cause: 'Typo in greeting string', blast_radius: 'greet() only', confidence: 0.92, affected_entities: [] },
      fixes: [{ file_path: 'src/greet.py', search_string: "'helo'", replace_string: "'hello'", reasoning: 'Fix typo' }] }),
  }))
  await page.route(`${IDE}/commit`, (route) => {
    commits.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ branch: 'onramp/fix-typo', commit_sha: 'feedbeef1234', commit_url: 'https://github.com/octocat/Hello-World/commit/feedbeef1234',
        files: 1, pr_number: 42, pr_url: 'https://github.com/octocat/Hello-World/pull/42' }) })
  })
  return commits
}

test.describe('IDE — Autonomous Coding', () => {
  test.beforeEach(async ({ page }) => {
    await mockNeonAuth(page)
    await mockBackendAPIs(page)
    await mockDashboardAPI(page)
    await mockReposAPI(page)
    await page.goto('/login')
    await page.fill('input#email', 'admin@onramp.dev')
    await page.click('button[type="submit"]')
    await page.fill('input#password', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
  })

  test('agent proposal becomes a reviewable change and ships as a PR', async ({ page }) => {
    const commits = await mockIde(page)
    await page.goto('/autonomous?repo=octocat/Hello-World')

    // Tree loads from the workspace
    await page.getByRole('button', { name: /src/ }).first().click()
    await expect(page.getByRole('button', { name: 'greet.py' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/files at abc1234/)).toBeVisible()

    // Quick-open filter finds files
    await page.getByLabel('Filter files').fill('readme')
    await expect(page.getByRole('button', { name: 'README.md' })).toBeVisible()
    await page.getByLabel('Filter files').fill('')

    // Brief → agent proposes → change is applied to the working copy
    await page.getByRole('button', { name: 'Coding agent' }).click()
    await page.getByLabel('Agent brief').fill('Fix the greeting typo')
    await page.getByRole('button', { name: /Propose changes/ }).click()
    await expect(page.getByText('Typo in greeting string').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/1\/1 proposed edit/)).toBeVisible()

    // Source control lists the modified file; commit opens a PR
    await page.getByRole('button', { name: /Source Control/ }).click()
    await expect(page.getByText('greet.py').first()).toBeVisible()
    await page.getByLabel('Commit message').fill('fix: greeting typo')
    await page.getByRole('button', { name: /Commit & open PR/ }).click()
    await expect(page.getByRole('link', { name: /PR #42/ }).first()).toBeVisible({ timeout: 10_000 })

    expect(commits).toHaveLength(1)
    expect(commits[0].base).toBe('main')
    expect(commits[0].open_pr).toBe(true)
    expect(commits[0].files).toEqual([{ path: 'src/greet.py', content: "def greet():\n    return 'hello'\n" }])
  })
})
