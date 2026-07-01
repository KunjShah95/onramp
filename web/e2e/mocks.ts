import type { Page } from '@playwright/test'

/* ------------------------------------------------------------------ */
/*  Firebase Auth mocking — intercepts Identity Toolkit REST calls      */
/* ------------------------------------------------------------------ */

const FAKE_UID = 'test-user-001'
const FAKE_ID_TOKEN = 'fake-id-token-abc123'
const FAKE_REFRESH_TOKEN = 'fake-refresh-token-xyz789'
const FAKE_EMAIL = 'admin@codeflow.dev'
const FAKE_NAME = 'Admin User'

/**
 * Install route interceptors that mock Firebase Auth REST endpoints
 * plus all backend API endpoints the tests rely on.
 */
export async function mockFirebaseAuth(page: Page) {
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    const url = route.request().url()

    // signInWithPassword
    if (url.includes('signInWithPassword')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: FAKE_UID,
          email: FAKE_EMAIL,
          displayName: FAKE_NAME,
          idToken: FAKE_ID_TOKEN,
          registered: true,
          refreshToken: FAKE_REFRESH_TOKEN,
          expiresIn: '3600',
        }),
      })
    }

    // getAccountInfo (lookup)
    if (url.includes('lookup')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#GetAccountInfoResponse',
          users: [
            {
              localId: FAKE_UID,
              email: FAKE_EMAIL,
              displayName: FAKE_NAME,
              providerUserInfo: [
                { providerId: 'password', federatedId: FAKE_EMAIL },
              ],
            },
          ],
        }),
      })
    }

    // signUp (createUserWithEmailAndPassword)
    if (url.includes('signUp')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'identitytoolkit#SignupNewUserResponse',
          localId: FAKE_UID,
          email: FAKE_EMAIL,
          idToken: FAKE_ID_TOKEN,
          refreshToken: FAKE_REFRESH_TOKEN,
          expiresIn: '3600',
        }),
      })
    }

    // Default: pass through (or return 200 for unhandled)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

  // Secure Token API (token refresh)
  await page.route('**/securetoken.googleapis.com/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: FAKE_ID_TOKEN,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: FAKE_REFRESH_TOKEN,
        id_token: FAKE_ID_TOKEN,
        user_id: FAKE_UID,
        project_id: 'test-project',
      }),
    })
  })

  // Allow Firebase Auth emulator calls through if VITE_USE_FIREBASE_EMULATORS=true
  await page.route('**://localhost:9099/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })
}

/* ------------------------------------------------------------------ */
/*  Backend API mocking — returns realistic test data                  */
/* ------------------------------------------------------------------ */

const MOCK_TEAM_ID = 'team-42'

export async function mockBackendAPIs(page: Page) {
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

  await page.route('**/api/v1/teams?user=current-user', async (route) => {
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

  await page.route('**/api/v1/auth/check-provider*', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: FAKE_EMAIL, registered: true, provider: 'password' }),
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
  await page.route('**/api/v1/tasks*', async (route) => {
    const url = route.request().url()
    // Don't intercept non-review API calls like progress
    if (url.includes('/progress/')) {
      return route.continue()
    }

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


