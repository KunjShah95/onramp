import type { Page } from '@playwright/test'

/* ------------------------------------------------------------------ */
/*  Neon Auth mocking — intercepts Better Auth REST API calls          */
/* ------------------------------------------------------------------ */

const FAKE_UID = 'test-user-001'
const FAKE_SESSION_TOKEN = 'fake-session-token-abc123'
const FAKE_EMAIL = 'admin@codeflow.dev'
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
  await page.route('**/api/v1/auth/register', async (route) => {
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
            name: 'CodeFlow Engineering',
            owner: FAKE_UID,
            tier: 'pro',
            members: ['member-1', 'member-2'],
            created_at: '2025-01-01T00:00:00Z',
            role: 'owner',
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
  await page.route('**/api/v1/tasks', async (route) => {
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
