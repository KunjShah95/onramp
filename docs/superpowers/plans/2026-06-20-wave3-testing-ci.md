# Wave 3: Testing & CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI pipeline, frontend test framework + full page coverage, and backend coverage reporting.

**Architecture:** Single GitHub Actions workflow with matrix jobs (backend + 7 microservices + frontend). vitest for frontend tests with @testing-library/react. pytest-cov for backend coverage at 70% threshold.

**Tech Stack:** GitHub Actions, vitest, @testing-library/react, jsdom, pytest-cov

---

### Task 1: Test Infrastructure — setup, config, shared utils

**Files:**
- Modify: `web/package.json`
- Modify: `web/vite.config.ts`
- Create: `web/src/test/setup.ts`
- Create: `web/src/test/test-utils.tsx`

- [ ] **Step 1: Install test dependencies**

Run:
```bash
cd web
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add test script to package.json**

Edit `web/package.json` — add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Add vitest config to vite.config.ts**

Read `web/vite.config.ts`, add `test` section:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
```

- [ ] **Step 4: Create test setup file**

`web/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Create shared test utilities**

`web/src/test/test-utils.tsx`:
```tsx
import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import { AuthProvider } from '../context/AuthContext'

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export * from '@testing-library/react'
export { customRender as render }
export { default as userEvent } from '@testing-library/user-event'
```

- [ ] **Step 6: Run test to verify setup works**

Create a quick smoke test to validate setup:
`web/src/test/setup.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('vitest runs correctly', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `cd web && npm run test`
Expected: PASS

- [ ] **Step 7: Remove smoke test and commit**

```bash
rm web/src/test/setup.test.tsx
git add web/package.json web/vite.config.ts web/src/test/
git commit -m "test: add vitest + React Testing Library setup with shared providers"
```

---

### Task 2: Auth Page Tests — Login, Register, ForgotPassword, JoinPage, WaitlistPage

**Files:**
- Create: `web/src/pages/Login.test.tsx`
- Create: `web/src/pages/Register.test.tsx`
- Create: `web/src/pages/ForgotPassword.test.tsx`
- Create: `web/src/pages/JoinPage.test.tsx`
- Create: `web/src/pages/WaitlistPage.test.tsx`

- [ ] **Step 1: Write Login tests**

`web/src/pages/Login.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Login from './Login'

vi.mock('../lib/api', () => ({
  login: vi.fn(),
}))

import { login } from '../lib/api'

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login form', () => {
    render(<Login />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup()
    render(<Login />)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
  })

  it('calls login API on valid submit', async () => {
    const mockLogin = vi.mocked(login)
    mockLogin.mockResolvedValue({ token: 'fake-token', user: { id: '1', email: 'test@test.com' } })
    const user = userEvent.setup()
    render(<Login />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' })
    })
  })

  it('displays API error on failure', async () => {
    const mockLogin = vi.mocked(login)
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    const user = userEvent.setup()
    render(<Login />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('navigates to register page', () => {
    render(<Login />)
    expect(screen.getByRole('link', { name: /create account/i })).toHaveAttribute('href', '/register')
  })
})
```

- [ ] **Step 2: Write Register tests**

`web/src/pages/Register.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Register from './Register'

vi.mock('../lib/api', () => ({
  register: vi.fn(),
}))

import { register } from '../lib/api'

describe('Register', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the registration form', () => {
    render(<Register />)
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('validates password confirmation match', async () => {
    const user = userEvent.setup()
    render(<Register />)
    await user.type(screen.getByLabelText(/^password$/i), 'pass123')
    await user.type(screen.getByLabelText(/confirm password/i), 'pass456')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
  })

  it('calls register API on valid submit', async () => {
    const mockRegister = vi.mocked(register)
    mockRegister.mockResolvedValue({ token: 'fake-token', user: { id: '1', email: 'a@b.com' } })
    const user = userEvent.setup()
    render(<Register />)
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 3: Write ForgotPassword tests**

`web/src/pages/ForgotPassword.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import ForgotPassword from './ForgotPassword'

vi.mock('../lib/api', () => ({
  forgotPassword: vi.fn(),
}))

import { forgotPassword } from '../lib/api'

describe('ForgotPassword', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the forgot password form', () => {
    render(<ForgotPassword />)
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('calls forgotPassword API on submit', async () => {
    const mockForgot = vi.mocked(forgotPassword)
    mockForgot.mockResolvedValue({})
    const user = userEvent.setup()
    render(<ForgotPassword />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => {
      expect(mockForgot).toHaveBeenCalledWith('test@test.com')
    })
  })
})
```

- [ ] **Step 4: Write JoinPage and WaitlistPage tests**

`web/src/pages/JoinPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import JoinPage from './JoinPage'

vi.mock('../lib/api', () => ({ join: vi.fn() }))
import { join } from '../lib/api'

describe('JoinPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders join form', () => {
    render(<JoinPage />)
    expect(screen.getByRole('heading', { name: /join/i })).toBeInTheDocument()
  })

  it('submits join code', async () => {
    const mockJoin = vi.mocked(join)
    mockJoin.mockResolvedValue({})
    const user = userEvent.setup()
    render(<JoinPage />)
    await user.type(screen.getByLabelText(/join code/i), 'ABC123')
    await user.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => {
      expect(mockJoin).toHaveBeenCalledWith('ABC123')
    })
  })
})
```

`web/src/pages/WaitlistPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import WaitlistPage from './WaitlistPage'

vi.mock('../lib/api', () => ({ joinWaitlist: vi.fn() }))
import { joinWaitlist } from '../lib/api'

describe('WaitlistPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders waitlist form', () => {
    render(<WaitlistPage />)
    expect(screen.getByRole('heading', { name: /waitlist/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('submits email to waitlist', async () => {
    const mockWaitlist = vi.mocked(joinWaitlist)
    mockWaitlist.mockResolvedValue({})
    const user = userEvent.setup()
    render(<WaitlistPage />)
    await user.type(screen.getByLabelText(/email/i), 'test@test.com')
    await user.click(screen.getByRole('button', { name: /join waitlist/i }))
    await waitFor(() => {
      expect(mockWaitlist).toHaveBeenCalledWith('test@test.com')
    })
  })
})
```

- [ ] **Step 5: Run all 5 auth page tests**

Run: `cd web && npm run test`
Expected: All 5 test files PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Login.test.tsx web/src/pages/Register.test.tsx web/src/pages/ForgotPassword.test.tsx web/src/pages/JoinPage.test.tsx web/src/pages/WaitlistPage.test.tsx
git commit -m "test: add auth page tests (Login, Register, ForgotPassword, Join, Waitlist)"
```

---

### Task 3: Public Page Tests — LandingPage, PricingPage, ChangelogPage, DocsPage

**Files:**
- Create: `web/src/pages/LandingPage.test.tsx`
- Create: `web/src/pages/PricingPage.test.tsx`
- Create: `web/src/pages/ChangelogPage.test.tsx`
- Create: `web/src/pages/DocsPage.test.tsx`

- [ ] **Step 1: Write LandingPage tests**

`web/src/pages/LandingPage.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '../test/test-utils'
import LandingPage from './LandingPage'

describe('LandingPage', () => {
  it('renders hero section', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { name: /codeflow/i })).toBeInTheDocument()
  })

  it('renders CTA buttons', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: /get started/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders feature highlights', () => {
    render(<LandingPage />)
    expect(screen.getByText(/features/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write PricingPage test**

`web/src/pages/PricingPage.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '../test/test-utils'
import PricingPage from './PricingPage'

describe('PricingPage', () => {
  it('renders pricing tiers', () => {
    render(<PricingPage />)
    expect(screen.getByText(/free/i)).toBeInTheDocument()
    expect(screen.getByText(/pro/i)).toBeInTheDocument()
    expect(screen.getByText(/enterprise/i)).toBeInTheDocument()
  })

  it('renders CTA to get started', () => {
    render(<PricingPage />)
    expect(screen.getByRole('link', { name: /get started/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Write ChangelogPage and DocsPage tests**

`web/src/pages/ChangelogPage.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '../test/test-utils'
import ChangelogPage from './ChangelogPage'

describe('ChangelogPage', () => {
  it('renders changelog content', () => {
    render(<ChangelogPage />)
    expect(screen.getByRole('heading', { name: /changelog/i })).toBeInTheDocument()
  })
})
```

`web/src/pages/DocsPage.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '../test/test-utils'
import DocsPage from './DocsPage'

describe('DocsPage', () => {
  it('renders documentation', () => {
    render(<DocsPage />)
    expect(screen.getByRole('heading', { name: /documentation/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm run test`
Expected: All 4 test files PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LandingPage.test.tsx web/src/pages/PricingPage.test.tsx web/src/pages/ChangelogPage.test.tsx web/src/pages/DocsPage.test.tsx
git commit -m "test: add public page tests (Landing, Pricing, Changelog, Docs)"
```

---

### Task 4: Protected Core Page Tests — DashboardPage, BillingPage, Settings, Profile, ApiKeysPage

**Files:**
- Create: `web/src/pages/DashboardPage.test.tsx`
- Create: `web/src/pages/BillingPage.test.tsx`
- Create: `web/src/pages/Settings.test.tsx`
- Create: `web/src/pages/Profile.test.tsx`
- Create: `web/src/pages/ApiKeysPage.test.tsx`

- [ ] **Step 1: Write DashboardPage tests**

Read `web/src/pages/DashboardPage.tsx` to understand current structure, then create:

`web/src/pages/DashboardPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import DashboardPage from './DashboardPage'

vi.mock('../lib/api', () => ({
  getDashboard: vi.fn(),
}))

import { getDashboard } from '../lib/api'

describe('DashboardPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows loading state', () => {
    vi.mocked(getDashboard).mockReturnValue(new Promise(() => {}))
    render(<DashboardPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders dashboard data', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      metrics: { totalRepos: 10, totalPRs: 25, activeUsers: 5 },
      recentActivity: [],
    })
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument()
    })
  })

  it('shows error state', async () => {
    vi.mocked(getDashboard).mockRejectedValue(new Error('Failed to load'))
    render(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Write BillingPage tests**

Read `web/src/pages/BillingPage.tsx` to understand Stripe Checkout redirect flow, then create:

`web/src/pages/BillingPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import BillingPage from './BillingPage'

vi.mock('../lib/api', () => ({
  getSubscriptions: vi.fn(),
  createCheckoutSession: vi.fn(),
}))

import { getSubscriptions, createCheckoutSession } from '../lib/api'

describe('BillingPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders pricing tiers', async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({ tier: 'free', status: 'active' })
    render(<BillingPage />)
    await waitFor(() => {
      expect(screen.getByText(/free/i)).toBeInTheDocument()
      expect(screen.getByText(/pro/i)).toBeInTheDocument()
    })
  })

  it('redirects to Stripe Checkout on upgrade click', async () => {
    vi.mocked(getSubscriptions).mockResolvedValue({ tier: 'free', status: 'active' })
    vi.mocked(createCheckoutSession).mockResolvedValue({ url: 'https://checkout.stripe.com/test' })
    delete (window as any).location
    window.location = { href: '' } as any
    const user = userEvent.setup()
    render(<BillingPage />)
    await waitFor(() => {
      expect(screen.getByText(/pro/i)).toBeInTheDocument()
    })
    const upgradeButtons = screen.getAllByRole('button', { name: /upgrade/i })
    await user.click(upgradeButtons[0])
    await waitFor(() => {
      expect(createCheckoutSession).toHaveBeenCalled()
    })
  })

  it('handles return redirect and fetches subscription', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?session_id=cs_test_123', href: '' },
      writable: true,
    })
    vi.mocked(getSubscriptions).mockResolvedValue({ tier: 'pro' })
    render(<BillingPage />)
    await waitFor(() => {
      expect(screen.getByText(/pro/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Write Settings tests**

Read `web/src/pages/Settings.tsx` to understand GitHub PAT test button flow, then create:

`web/src/pages/Settings.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Settings from './Settings'

vi.mock('../lib/api', () => ({
  getIntegrations: vi.fn(),
  updateIntegration: vi.fn(),
  testGithubToken: vi.fn(),
}))

import { getIntegrations, updateIntegration, testGithubToken } from '../lib/api'

describe('Settings', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders settings page', async () => {
    vi.mocked(getIntegrations).mockResolvedValue([])
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText(/github token/i)).toBeInTheDocument()
    })
  })

  it('tests GitHub token and shows success result', async () => {
    vi.mocked(getIntegrations).mockResolvedValue([])
    vi.mocked(testGithubToken).mockResolvedValue({ username: 'testuser', scopes: ['repo'] })
    const user = userEvent.setup()
    render(<Settings />)
    await user.type(screen.getByLabelText(/personal access token/i), 'ghp_test123')
    await user.click(screen.getByRole('button', { name: /test/i }))
    await waitFor(() => {
      expect(screen.getByText(/testuser/i)).toBeInTheDocument()
    })
  })

  it('shows error on failed token test', async () => {
    vi.mocked(getIntegrations).mockResolvedValue([])
    vi.mocked(testGithubToken).mockRejectedValue(new Error('Invalid token'))
    const user = userEvent.setup()
    render(<Settings />)
    await user.type(screen.getByLabelText(/personal access token/i), 'ghp_bad')
    await user.click(screen.getByRole('button', { name: /test/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid token/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Write Profile and ApiKeysPage tests**

`web/src/pages/Profile.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import Profile from './Profile'

vi.mock('../lib/api', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}))

import { getProfile, updateProfile } from '../lib/api'

describe('Profile', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders profile information', async () => {
    vi.mocked(getProfile).mockResolvedValue({ name: 'Test User', email: 'test@test.com' })
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument()
    })
  })

  it('saves profile changes', async () => {
    vi.mocked(getProfile).mockResolvedValue({ name: 'Test', email: 'test@test.com' })
    vi.mocked(updateProfile).mockResolvedValue({})
    const user = userEvent.setup()
    render(<Profile />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText(/name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Name')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalled()
    })
  })
})
```

`web/src/pages/ApiKeysPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import ApiKeysPage from './ApiKeysPage'

vi.mock('../lib/api', () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}))

import { getApiKeys, createApiKey, revokeApiKey } from '../lib/api'

describe('ApiKeysPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders API keys list', async () => {
    vi.mocked(getApiKeys).mockResolvedValue([{ id: '1', name: 'My Key', createdAt: '2024-01-01' }])
    render(<ApiKeysPage />)
    await waitFor(() => {
      expect(screen.getByText('My Key')).toBeInTheDocument()
    })
  })

  it('creates a new API key', async () => {
    vi.mocked(getApiKeys).mockResolvedValue([])
    vi.mocked(createApiKey).mockResolvedValue({ id: '2', name: 'New Key', key: 'sk-xxx' })
    const user = userEvent.setup()
    render(<ApiKeysPage />)
    await user.type(screen.getByLabelText(/key name/i), 'New Key')
    await user.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith('New Key')
    })
  })

  it('revokes an API key', async () => {
    vi.mocked(getApiKeys).mockResolvedValue([{ id: '1', name: 'My Key', createdAt: '2024-01-01' }])
    vi.mocked(revokeApiKey).mockResolvedValue({})
    const user = userEvent.setup()
    render(<ApiKeysPage />)
    await waitFor(() => {
      expect(screen.getByText('My Key')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /revoke/i }))
    await waitFor(() => {
      expect(revokeApiKey).toHaveBeenCalledWith('1')
    })
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd web && npm run test`
Expected: All 5 test files PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/DashboardPage.test.tsx web/src/pages/BillingPage.test.tsx web/src/pages/Settings.test.tsx web/src/pages/Profile.test.tsx web/src/pages/ApiKeysPage.test.tsx
git commit -m "test: add protected core page tests (Dashboard, Billing, Settings, Profile, ApiKeys)"
```

---

### Task 5: Team & Task Page Tests — TeamPage, TasksPage, TraineeDashboard, NotificationsPage, ExplorePage

**Files:**
- Create: `web/src/pages/TeamPage.test.tsx`
- Create: `web/src/pages/TasksPage.test.tsx`
- Create: `web/src/pages/TraineeDashboard.test.tsx`
- Create: `web/src/pages/NotificationsPage.test.tsx`
- Create: `web/src/pages/ExplorePage.test.tsx`

- [ ] **Step 1: Write TeamPage and TasksPage tests**

`web/src/pages/TeamPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import TeamPage from './TeamPage'

vi.mock('../lib/api', () => ({
  getTeam: vi.fn(),
  inviteMember: vi.fn(),
  removeMember: vi.fn(),
}))

import { getTeam, inviteMember, removeMember } from '../lib/api'

describe('TeamPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders team members', async () => {
    vi.mocked(getTeam).mockResolvedValue([{ id: '1', name: 'Alice', email: 'alice@test.com', role: 'admin' }])
    render(<TeamPage />)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
  })

  it('invites a new member', async () => {
    vi.mocked(getTeam).mockResolvedValue([])
    vi.mocked(inviteMember).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TeamPage />)
    await user.type(screen.getByLabelText(/email/i), 'new@test.com')
    await user.click(screen.getByRole('button', { name: /invite/i }))
    await waitFor(() => {
      expect(inviteMember).toHaveBeenCalledWith('new@test.com')
    })
  })

  it('removes a team member', async () => {
    vi.mocked(getTeam).mockResolvedValue([{ id: '1', name: 'Alice', email: 'alice@test.com', role: 'member' }])
    vi.mocked(removeMember).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TeamPage />)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => {
      expect(removeMember).toHaveBeenCalledWith('1')
    })
  })
})
```

`web/src/pages/TasksPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import TasksPage from './TasksPage'

vi.mock('../lib/api', () => ({
  getTasks: vi.fn(),
  createTask: vi.fn(),
  completeTask: vi.fn(),
}))

import { getTasks, createTask, completeTask } from '../lib/api'

describe('TasksPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders task list', async () => {
    vi.mocked(getTasks).mockResolvedValue([{ id: '1', title: 'Setup CI', status: 'pending' }])
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getByText('Setup CI')).toBeInTheDocument()
    })
  })

  it('creates a new task', async () => {
    vi.mocked(getTasks).mockResolvedValue([])
    vi.mocked(createTask).mockResolvedValue({ id: '2', title: 'New Task', status: 'pending' })
    const user = userEvent.setup()
    render(<TasksPage />)
    await user.type(screen.getByLabelText(/task title/i), 'New Task')
    await user.click(screen.getByRole('button', { name: /add task/i }))
    await waitFor(() => {
      expect(createTask).toHaveBeenCalled()
    })
  })

  it('marks task as complete', async () => {
    vi.mocked(getTasks).mockResolvedValue([{ id: '1', title: 'Setup CI', status: 'pending' }])
    vi.mocked(completeTask).mockResolvedValue({})
    const user = userEvent.setup()
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getByText('Setup CI')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(completeTask).toHaveBeenCalledWith('1')
    })
  })

  it('shows empty state', async () => {
    vi.mocked(getTasks).mockResolvedValue([])
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getByText(/no tasks/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Write TraineeDashboard, NotificationsPage, ExplorePage tests**

`web/src/pages/TraineeDashboard.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import TraineeDashboard from './TraineeDashboard'

vi.mock('../lib/api', () => ({ getTraineeMetrics: vi.fn() }))
import { getTraineeMetrics } from '../lib/api'

describe('TraineeDashboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders trainee metrics', async () => {
    vi.mocked(getTraineeMetrics).mockResolvedValue({
      completedTasks: 5, inProgress: 2, streak: 3,
    })
    render(<TraineeDashboard />)
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('shows loading state', () => {
    vi.mocked(getTraineeMetrics).mockReturnValue(new Promise(() => {}))
    render(<TraineeDashboard />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
```

`web/src/pages/NotificationsPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import NotificationsPage from './NotificationsPage'

vi.mock('../lib/api', () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}))

import { getNotifications, markNotificationRead } from '../lib/api'

describe('NotificationsPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders notification list', async () => {
    vi.mocked(getNotifications).mockResolvedValue([
      { id: '1', message: 'PR reviewed', read: false, createdAt: '2024-01-01' },
    ])
    render(<NotificationsPage />)
    await waitFor(() => {
      expect(screen.getByText('PR reviewed')).toBeInTheDocument()
    })
  })

  it('marks notification as read', async () => {
    vi.mocked(getNotifications).mockResolvedValue([
      { id: '1', message: 'PR reviewed', read: false, createdAt: '2024-01-01' },
    ])
    vi.mocked(markNotificationRead).mockResolvedValue({})
    const user = userEvent.setup()
    render(<NotificationsPage />)
    await waitFor(() => {
      expect(screen.getByText('PR reviewed')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /mark read/i }))
    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith('1')
    })
  })

  it('shows empty state', async () => {
    vi.mocked(getNotifications).mockResolvedValue([])
    render(<NotificationsPage />)
    await waitFor(() => {
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument()
    })
  })
})
```

`web/src/pages/ExplorePage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import ExplorePage from './ExplorePage'

vi.mock('../lib/api', () => ({ searchRepos: vi.fn() }))
import { searchRepos } from '../lib/api'

describe('ExplorePage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders search input', () => {
    render(<ExplorePage />)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('performs search and shows results', async () => {
    vi.mocked(searchRepos).mockResolvedValue([
      { id: '1', name: 'react', description: 'A JavaScript library' },
    ])
    const user = userEvent.setup()
    render(<ExplorePage />)
    await user.type(screen.getByPlaceholderText(/search/i), 'react')
    await user.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => {
      expect(searchRepos).toHaveBeenCalledWith('react')
      expect(screen.getByText('react')).toBeInTheDocument()
    })
  })

  it('shows loading while searching', async () => {
    vi.mocked(searchRepos).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ExplorePage />)
    await user.type(screen.getByPlaceholderText(/search/i), 'react')
    await user.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => {
      expect(screen.getByText(/searching/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Run tests**

Run: `cd web && npm run test`
Expected: All 5 test files PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TeamPage.test.tsx web/src/pages/TasksPage.test.tsx web/src/pages/TraineeDashboard.test.tsx web/src/pages/NotificationsPage.test.tsx web/src/pages/ExplorePage.test.tsx
git commit -m "test: add team and task page tests (Team, Tasks, TraineeDashboard, Notifications, Explore)"
```

---

### Task 6: AI & Content Page Tests — FirstIssuePage, PRDescriptionPage, OnboardingReportPage, PlaybooksPage, LearnPage, AskPage

**Files:**
- Create: `web/src/pages/FirstIssuePage.test.tsx`
- Create: `web/src/pages/PRDescriptionPage.test.tsx`
- Create: `web/src/pages/OnboardingReportPage.test.tsx`
- Create: `web/src/pages/PlaybooksPage.test.tsx`
- Create: `web/src/pages/LearnPage.test.tsx`
- Create: `web/src/pages/AskPage.test.tsx`

- [ ] **Step 1: Write FirstIssuePage and PRDescriptionPage tests**

`web/src/pages/FirstIssuePage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import FirstIssuePage from './FirstIssuePage'

vi.mock('../lib/api', () => ({
  getFirstIssues: vi.fn(),
  claimIssue: vi.fn(),
}))

import { getFirstIssues, claimIssue } from '../lib/api'

describe('FirstIssuePage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders issue list', async () => {
    vi.mocked(getFirstIssues).mockResolvedValue([
      { id: '1', title: 'Fix bug', repo: 'test/repo', difficulty: 'easy' },
    ])
    render(<FirstIssuePage />)
    await waitFor(() => {
      expect(screen.getByText('Fix bug')).toBeInTheDocument()
    })
  })

  it('claims an issue', async () => {
    vi.mocked(getFirstIssues).mockResolvedValue([
      { id: '1', title: 'Fix bug', repo: 'test/repo', difficulty: 'easy' },
    ])
    vi.mocked(claimIssue).mockResolvedValue({})
    const user = userEvent.setup()
    render(<FirstIssuePage />)
    await waitFor(() => {
      expect(screen.getByText('Fix bug')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /claim/i }))
    await waitFor(() => {
      expect(claimIssue).toHaveBeenCalledWith('1')
    })
  })

  it('shows loading state', () => {
    vi.mocked(getFirstIssues).mockReturnValue(new Promise(() => {}))
    render(<FirstIssuePage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
```

`web/src/pages/PRDescriptionPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import PRDescriptionPage from './PRDescriptionPage'

vi.mock('../lib/api', () => ({
  generatePRDescription: vi.fn(),
}))

import { generatePRDescription } from '../lib/api'

describe('PRDescriptionPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders PR description form', () => {
    render(<PRDescriptionPage />)
    expect(screen.getByLabelText(/diff input/i)).toBeInTheDocument()
  })

  it('generates PR description', async () => {
    vi.mocked(generatePRDescription).mockResolvedValue({ description: 'This PR adds...' })
    const user = userEvent.setup()
    render(<PRDescriptionPage />)
    await user.type(screen.getByLabelText(/diff input/i), '--- a/file.js\n+++ b/file.js\n+console.log')
    await user.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => {
      expect(screen.getByText('This PR adds...')).toBeInTheDocument()
    })
  })

  it('shows error on failure', async () => {
    vi.mocked(generatePRDescription).mockRejectedValue(new Error('Generation failed'))
    const user = userEvent.setup()
    render(<PRDescriptionPage />)
    await user.type(screen.getByLabelText(/diff input/i), 'some diff')
    await user.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => {
      expect(screen.getByText(/generation failed/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Write OnboardingReportPage and PlaybooksPage tests**

`web/src/pages/OnboardingReportPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import OnboardingReportPage from './OnboardingReportPage'

vi.mock('../lib/api', () => ({ getOnboardingReport: vi.fn() }))
import { getOnboardingReport } from '../lib/api'

describe('OnboardingReportPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders report data', async () => {
    vi.mocked(getOnboardingReport).mockResolvedValue({
      summary: 'Good progress', score: 85, recommendations: ['Focus on PRs'],
    })
    render(<OnboardingReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Good progress')).toBeInTheDocument()
    })
  })

  it('shows loading state', () => {
    vi.mocked(getOnboardingReport).mockReturnValue(new Promise(() => {}))
    render(<OnboardingReportPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
```

`web/src/pages/PlaybooksPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import PlaybooksPage from './PlaybooksPage'

vi.mock('../lib/api', () => ({
  getPlaybooks: vi.fn(),
  createPlaybook: vi.fn(),
}))

import { getPlaybooks, createPlaybook } from '../lib/api'

describe('PlaybooksPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders playbook list', async () => {
    vi.mocked(getPlaybooks).mockResolvedValue([
      { id: '1', name: 'Onboarding Guide', steps: ['Step 1'] },
    ])
    render(<PlaybooksPage />)
    await waitFor(() => {
      expect(screen.getByText('Onboarding Guide')).toBeInTheDocument()
    })
  })

  it('creates a new playbook', async () => {
    vi.mocked(getPlaybooks).mockResolvedValue([])
    vi.mocked(createPlaybook).mockResolvedValue({ id: '2', name: 'New Playbook', steps: [] })
    const user = userEvent.setup()
    render(<PlaybooksPage />)
    await user.type(screen.getByLabelText(/playbook name/i), 'New Playbook')
    await user.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => {
      expect(createPlaybook).toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 3: Write LearnPage and AskPage tests**

`web/src/pages/LearnPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import LearnPage from './LearnPage'

vi.mock('../lib/api', () => ({ getLearningPaths: vi.fn() }))
import { getLearningPaths } from '../lib/api'

describe('LearnPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders learning paths', async () => {
    vi.mocked(getLearningPaths).mockResolvedValue([
      { id: '1', title: 'Git Basics', progress: 50 },
    ])
    render(<LearnPage />)
    await waitFor(() => {
      expect(screen.getByText('Git Basics')).toBeInTheDocument()
    })
  })

  it('shows progress indicator', async () => {
    vi.mocked(getLearningPaths).mockResolvedValue([
      { id: '1', title: 'Git Basics', progress: 50 },
    ])
    render(<LearnPage />)
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument()
    })
  })
})
```

`web/src/pages/AskPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test/test-utils'
import userEvent from '@testing-library/user-event'
import AskPage from './AskPage'

vi.mock('../lib/api', () => ({ askQuestion: vi.fn() }))
import { askQuestion } from '../lib/api'

describe('AskPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders chat input', () => {
    render(<AskPage />)
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeInTheDocument()
  })

  it('sends question and displays answer', async () => {
    vi.mocked(askQuestion).mockResolvedValue({ answer: 'Here is how to...' })
    const user = userEvent.setup()
    render(<AskPage />)
    await user.type(screen.getByPlaceholderText(/ask a question/i), 'How do I commit?')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(screen.getByText('Here is how to...')).toBeInTheDocument()
    })
  })

  it('shows loading state while waiting for answer', async () => {
    vi.mocked(askQuestion).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<AskPage />)
    await user.type(screen.getByPlaceholderText(/ask a question/i), 'Test')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => {
      expect(screen.getByText(/thinking/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd web && npm run test`
Expected: All 6 test files PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/FirstIssuePage.test.tsx web/src/pages/PRDescriptionPage.test.tsx web/src/pages/OnboardingReportPage.test.tsx web/src/pages/PlaybooksPage.test.tsx web/src/pages/LearnPage.test.tsx web/src/pages/AskPage.test.tsx
git commit -m "test: add AI and content page tests (FirstIssue, PRDescription, Report, Playbooks, Learn, Ask)"
```

---

### Task 7: CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: ['*']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: backend/requirements.txt
      - run: pip install -r requirements.txt pytest-cov
      - run: python -m pytest --cov=app --cov-report=term --cov-report=xml --cov-fail-under=70
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: backend/coverage.xml

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run test

  waitlist-service:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/waitlist-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest

  repo-analysis:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/repo-analysis
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest

  team-analytics:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/team-analytics
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest

  user-service:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/user-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest

  ai-tutor:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/ai-tutor
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest

  notification:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/notification
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest

  learning-path:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/learning-path
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -e .
      - run: python -m pytest
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow with matrix jobs for backend, frontend, and 7 microservices"
```

---

### Task 8: Backend Coverage Configuration

**Files:**
- Create: `backend/.coveragerc`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Create .coveragerc**

`backend/.coveragerc`:
```ini
[run]
source = app
omit = */tests/*,*/migrations/*

[report]
fail_under = 70
show_missing = true
```

- [ ] **Step 2: Add pytest-cov to requirements.txt**

Read `backend/requirements.txt` and add:
```
pytest-cov
```

- [ ] **Step 3: Verify coverage passes**

Run: `cd backend && pip install pytest-cov && python -m pytest --cov=app --cov-report=term --cov-fail-under=70`
Expected: Tests pass, coverage >= 70%.

- [ ] **Step 4: Commit**

```bash
git add backend/.coveragerc backend/requirements.txt
git commit -m "test: add pytest-cov with 70% coverage threshold + .coveragerc config"
```
