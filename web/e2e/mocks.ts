import type { Page } from '@playwright/test'

/* ------------------------------------------------------------------ */
/*  Neon Auth mocking — intercepts Better Auth REST API calls          */
/* ------------------------------------------------------------------ */

const FAKE_UID = 'test-user-001'
const FAKE_SESSION_TOKEN = 'fake-session-token-abc123'
const FAKE_EMAIL = 'admin@onramp.dev'
const FAKE_NAME = 'Admin User'

const FAKE_USER = {
  id: FAKE_UID,
  email: FAKE_EMAIL,
  name: FAKE_NAME,
  image: null,
  emailVerified: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

/** Shared mock user, session, and team data used across all tests. */
export { FAKE_UID, FAKE_SESSION_TOKEN, FAKE_EMAIL, FAKE_NAME, FAKE_USER }

/**
 * Inject a mock Neon Auth client via window.__TEST_AUTH_CLIENT before the
 * app bundle loads.  This makes the E2E test fully self-contained — no real
 * auth server or HTTP mocking needed.
 *
 * The mock tracks state: `getSession` returns `{data: null}` until a
 * sign-in/sign-up call is made, after which it switches to the fake
 * user/session payload.  This lets tests start on the login page as an
 * unauthenticated user and then observe the post-login redirect.
 */
export async function mockNeonAuth(page: Page) {
  const mockUser = FAKE_USER
  const mockSessionToken = FAKE_SESSION_TOKEN

  await page.addInitScript(`
    (() => {
      let loggedIn = false;
      const FAKE_USER = ${JSON.stringify(mockUser)};
      const FAKE_TOKEN = ${JSON.stringify(mockSessionToken)};

      window.__TEST_AUTH_CLIENT = {
        signIn: {
          email: async () => {
            loggedIn = true;
            return { data: { user: FAKE_USER, session: { token: FAKE_TOKEN } } };
          },
          social: async () => {
            loggedIn = true;
            return { data: { user: FAKE_USER, session: { token: FAKE_TOKEN } } };
          },
        },
        signUp: {
          email: async () => {
            loggedIn = true;
            return { data: { user: FAKE_USER, session: { token: FAKE_TOKEN } } };
          },
        },
        getSession: async () => {
          if (loggedIn) {
            return {
              data: {
                session: { token: FAKE_TOKEN },
                user: FAKE_USER,
              },
            };
          }
          return { data: null };
        },
        signOut: async () => {
          loggedIn = false;
          return { data: {} };
        },
        forgetPassword: {
          emailOtp: async () => ({ data: {} }),
        },
        updateUser: async () => ({ data: { user: FAKE_USER } }),
      };
    })();
  `)
}

/* ------------------------------------------------------------------ */
/*  Backend API mocking — returns realistic test data                  */
/* ------------------------------------------------------------------ */

const MOCK_TEAM_ID = 'team-42'

export async function mockBackendAPIs(page: Page) {
  // ── Auth routes ──────────────────────────────────────────────────
  await page.route('**/api/v1/auth/login', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uid: FAKE_UID,
        email: FAKE_EMAIL,
        name: FAKE_NAME,
        provider: 'password',
        token: FAKE_SESSION_TOKEN,
      }),
    })
  })

  await page.route('**/api/v1/auth/register', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uid: FAKE_UID,
        email: FAKE_EMAIL,
        name: FAKE_NAME,
        provider: 'password',
        token: FAKE_SESSION_TOKEN,
      }),
    })
  })

  await page.route('**/api/v1/auth/me', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uid: FAKE_UID,
        email: FAKE_EMAIL,
        name: FAKE_NAME,
        provider: 'password',
      }),
    })
  })

  await page.route('**/api/v1/auth/check-provider*', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: FAKE_EMAIL, registered: true, provider: 'password' }),
    })
  })

  // Teams listing — uses regex to match any query params
  await page.route(/\/api\/v1\/teams(\?|$)/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        teams: [
          {
            team_id: MOCK_TEAM_ID,
            name: 'Onramp Engineering',
            owner: FAKE_UID,
            tier: 'pro',
            members: ['member-1', 'member-2'],
            created_at: '2025-01-01T00:00:00Z',
            role: 'admin',
          },
        ],
      }),
    })
  })
}

export async function mockDashboardAPI(page: Page) {
  await page.route('**/api/v1/dashboard/cto', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_tasks: 42,
        completed_tasks: 18,
        in_progress_tasks: 12,
        pending_review_tasks: 7,
        blocked_tasks: 5,
        completion_rate: 43,
        total_members: 8,
        total_trainees: 5,
        total_milestones: 3,
        unique_contributors: 6,
        first_prs_merged: 4,
        member_progress: [
          {
            user_id: 'member-1',
            name: 'Alice Chen',
            role: 'senior',
            total: 14,
            completed: 8,
            in_progress: 3,
            pending_review: 2,
            modules_unlocked: ['react-basics', 'testing'],
            completion_rate: 57,
          },
          {
            user_id: 'member-2',
            name: 'Bob Martinez',
            role: 'member',
            total: 10,
            completed: 4,
            in_progress: 5,
            pending_review: 1,
            modules_unlocked: ['react-basics'],
            completion_rate: 40,
          },
          {
            user_id: 'member-3',
            name: 'Carol Nguyen',
            role: 'member',
            total: 18,
            completed: 6,
            in_progress: 4,
            pending_review: 4,
            modules_unlocked: ['react-basics', 'testing', 'api-design'],
            completion_rate: 33,
          },
        ],
        pending_reviews: [
          {
            task_id: 'task-101',
            title: 'Implement user authentication flow',
            assigned_to: 'member-2',
            module: 'react-basics',
            pr_url: 'https://github.com/org/repo/pull/42',
            state: 'submitted',
            created_at: new Date(Date.now() - 12 * 3_600_000).toISOString(),
          },
          {
            task_id: 'task-102',
            title: 'Add unit tests for API client',
            assigned_to: 'member-3',
            module: 'testing',
            pr_url: null,
            state: 'under_review',
            created_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
          },
        ],
        recent_activity: [
          {
            task_id: 'task-201',
            title: 'Setup CI/CD pipeline',
            state: 'completed',
            assigned_to: 'member-1',
            module: 'infra',
            updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
          },
          {
            task_id: 'task-202',
            title: 'Error boundary component',
            state: 'submitted',
            assigned_to: 'member-2',
            module: 'react-basics',
            updated_at: new Date(Date.now() - 4 * 3_600_000).toISOString(),
          },
        ],
        actions: [],
      }),
    })
  })
}

export async function mockReviewQueueAPI(page: Page) {
  await page.route(/\/api\/v1\/tasks(\?|$)/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tasks: [
          {
            task_id: 'task-301',
            team_id: MOCK_TEAM_ID,
            created_by: 'member-2',
            assigned_to: 'member-2',
            title: 'Complete React component library',
            description: 'Build reusable Button, Card, and Input components',
            module: 'react-basics',
            state: 'submitted',
            priority: 'high',
            pr_url: 'https://github.com/org/repo/pull/55',
            branch: 'feat/component-library',
            repo_url: null,
            unlock_modules: [],
            review_feedback: null,
            ai_review: null,
            product_signoff: false,
            estimated_hours: 8,
            created_at: new Date(Date.now() - 48 * 3_600_000).toISOString(),
            updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
            completed_at: null,
          },
          {
            task_id: 'task-302',
            team_id: MOCK_TEAM_ID,
            created_by: 'member-3',
            assigned_to: 'member-3',
            title: 'Add input validation to signup form',
            description: 'Email format, password strength, required fields',
            module: 'testing',
            state: 'under_review',
            priority: 'medium',
            pr_url: null,
            branch: 'feat/signup-validation',
            repo_url: null,
            unlock_modules: [],
            review_feedback: null,
            ai_review: null,
            product_signoff: false,
            estimated_hours: 4,
            created_at: new Date(Date.now() - 24 * 3_600_000).toISOString(),
            updated_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
            completed_at: null,
          },
          {
            task_id: 'task-303',
            team_id: MOCK_TEAM_ID,
            created_by: 'member-1',
            assigned_to: 'member-1',
            title: 'Refactor API service layer',
            description: 'Extract HTTP client, add error handling, add retry logic',
            module: 'api-design',
            state: 'needs_changes',
            priority: 'high',
            pr_url: 'https://github.com/org/repo/pull/58',
            branch: 'refactor/api-layer',
            repo_url: null,
            unlock_modules: [],
            review_feedback: { message: 'Please add error boundary tests' },
            ai_review: null,
            product_signoff: false,
            estimated_hours: 6,
            created_at: new Date(Date.now() - 72 * 3_600_000).toISOString(),
            updated_at: new Date(Date.now() - 10 * 3_600_000).toISOString(),
            completed_at: null,
          },
        ],
        count: 3,
      }),
    })
  })
}

/* ------------------------------------------------------------------ */
/*  Explore page mock                                                  */
/* ------------------------------------------------------------------ */

export async function mockExploreAPI(page: Page) {
  await page.route('**/api/v1/explore/analyze', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        repo: 'org/repo',
        entities: {
          files: [
            { path: 'src/index.ts', language: 'typescript', classes: [], functions: [{ name: 'main', args: [], lineno: 1 }], imports: ['react'], exports: [], dependencies: [] },
            { path: 'src/app.tsx', language: 'typescript', classes: [{ name: 'App', methods: ['render'], bases: [], lineno: 1 }], functions: [], imports: ['react'], exports: [], dependencies: [] },
          ],
          classes: [{ name: 'App', methods: ['render'], bases: [], lineno: 1 }],
          functions: [{ name: 'main', args: [], lineno: 1 }],
          imports: [{ module: 'react', file: 'src/index.ts', language: 'typescript' }],
          exports: [{ name: 'App', file: 'src/app.tsx', language: 'typescript' }],
        },
        services: [
          { name: 'frontend', files: ['src/index.ts', 'src/app.tsx'], description: 'React frontend application' },
          { name: 'api', files: ['src/api.ts'], description: 'API client layer' },
          { name: 'utils', files: ['src/utils.ts'], description: 'Utility functions' },
        ],
        dependencies: {
          frontend: ['api', 'utils'],
          api: ['utils'],
        },
        circular_dependencies: [],
        architecture_pattern: 'layered',
        architecture_diagram: '',
      }),
    })
  })

  await page.route('**/api/v1/explore/health*', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'healthy', uptime: 99.9 }),
    })
  })
}

/* ------------------------------------------------------------------ */
/*  Team page mock                                                    */
/* ------------------------------------------------------------------ */

export async function mockTeamAPI(page: Page) {
  await page.route('**/api/v1/teams/*/members', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { user_id: 'member-1', name: 'Alice Chen', role: 'senior' },
        { user_id: 'member-2', name: 'Bob Martinez', role: 'member' },
        { user_id: 'member-3', name: 'Carol Nguyen', role: 'member' },
        { user_id: 'member-4', name: 'Dave Park', role: 'tester' },
      ]),
    })
  })

  await page.route('**/api/v1/teams/*/module-permissions', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        permissions: [
          { id: 'perm-1', user_id: 'member-1', user_name: 'Alice Chen', module: 'react-basics', granted_by: 'system', granted_at: new Date().toISOString(), source: 'manual' },
          { id: 'perm-2', user_id: 'member-2', user_name: 'Bob Martinez', module: 'react-basics', granted_by: 'system', granted_at: new Date().toISOString(), source: 'manual' },
          { id: 'perm-3', user_id: 'member-2', user_name: 'Bob Martinez', module: 'testing', granted_by: 'system', granted_at: new Date().toISOString(), source: 'manual' },
        ],
        modules: ['react-basics', 'testing', 'api-design', 'infra'],
        count: 3,
      }),
    })
  })

  await page.route('**/api/v1/dashboard/team', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        members: [
          { name: 'Alice Chen', user_id: 'member-1', role: 'senior', total_tasks: 14, completed_tasks: 8, in_progress_tasks: 3, pending_review: 2, modules_unlocked: ['react-basics', 'testing'], completion_rate: 57 },
          { name: 'Bob Martinez', user_id: 'member-2', role: 'member', total_tasks: 10, completed_tasks: 4, in_progress_tasks: 5, pending_review: 1, modules_unlocked: ['react-basics'], completion_rate: 40 },
          { name: 'Carol Nguyen', user_id: 'member-3', role: 'member', total_tasks: 18, completed_tasks: 6, in_progress_tasks: 4, pending_review: 4, modules_unlocked: ['react-basics', 'testing', 'api-design'], completion_rate: 33 },
        ],
      }),
    })
  })
}

/* ------------------------------------------------------------------ */
/*  Billing page mock                                                 */
/* ------------------------------------------------------------------ */

export async function mockBillingAPI(page: Page) {
  await page.route('**/api/v1/billing/pricing', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tiers: [
          { tier: 'free', price_monthly: 0, price_yearly: 0, features: ['1 member', '1 repo', '50 credits/mo'] },
          { tier: 'startup', price_monthly: 49, price_yearly: 499, features: ['5 members', '10 repos', '5000 credits/mo'] },
          { tier: 'professional', price_monthly: 299, price_yearly: 2999, features: ['20 members', '50 repos', '50000 credits/mo'] },
          { tier: 'enterprise', price_monthly: 0, price_yearly: 0, features: ['Custom', 'Unlimited', 'Dedicated support'] },
        ],
      }),
    })
  })

  await page.route('**/api/v1/billing/subscriptions/*', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team_id: MOCK_TEAM_ID,
          tier: 'pro',
          price: 49,
          billing_cycle: 'monthly',
          status: 'active',
          created_at: '2025-06-01T00:00:00Z',
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })
}

/* ------------------------------------------------------------------ */
/*  Allocated repo access — new dev → repo visibility → health          */
/* ------------------------------------------------------------------ */

const ALLOCATED_REPO = {
  id: 'repo-hello-world',
  name: 'Hello-World',
  owner: 'octocat',
  status: 'ready',
  last_analyzed: new Date().toISOString(),
}

/**
 * Mock GET /api/v1/repos — the repo allocated to the (new) dev's team.
 * The regex intentionally matches `/repos` and `/repos?team_id=...` but NOT
 * `/repos/{owner}/{repo}/health`, mirroring the teams-list convention.
 */
export async function mockReposAPI(page: Page) {
  await page.route(/\/api\/v1\/repos(\?|$)/, async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ repos: [ALLOCATED_REPO] }),
    })
  })
}

/**
 * Mock POST /api/v1/repos/octocat/Hello-World/health — the health score the
 * dashboard and Code Health page fetch for the allocated repo.
 */
export async function mockRepoHealthAPI(page: Page) {
  await page.route('**/api/v1/repos/octocat/Hello-World/health', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        overall_score: 85,
        test_coverage: 72,
        maintainability: 8,
        complexity: 'moderate',
        recommendations: ['Add more tests', 'Document public APIs'],
      }),
    })
  })
}
