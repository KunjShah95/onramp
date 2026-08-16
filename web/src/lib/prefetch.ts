/*
 * Route prefetching — makes navigation feel instant.
 *
 * Every route is code-split (React.lazy + dynamic import), so the first visit
 * to a page pays a chunk download. We prefetch the lazy loader when the user
 * hovers/focuses a nav link (or right after login for the common landing
 * pages), so by the time they click, the chunk is already in the browser
 * cache and the page mounts immediately instead of flashing a skeleton.
 *
 * Keys are route paths; keys ending in `/` are prefixes for dynamic routes
 * (`/member/:id`, `/blog/:slug`, ...). Keep this map in sync with App.tsx.
 */

type Loader = () => Promise<unknown>

const loaders: Record<string, Loader> = {
  // ── Public / marketing ──────────────────────────────
  '/': () => import('../pages/LandingPage'),
  '/pricing': () => import('../pages/PricingPage'),
  '/why-onramp': () => import('../pages/WhyOnrampPage'),
  '/changelog': () => import('../pages/ChangelogPage'),
  '/docs': () => import('../pages/DocsPage'),
  '/support': () => import('../pages/SupportPage'),
  '/about': () => import('../pages/AboutPage'),
  '/blog': () => import('../pages/BlogPage'),
  '/blog/': () => import('../pages/BlogPostPage'),
  '/contact': () => import('../pages/ContactPage'),
  '/customers': () => import('../pages/CustomersPage'),
  '/security': () => import('../pages/SecurityPage'),
  '/dpa': () => import('../pages/DPAPage'),
  '/soc-2': () => import('../pages/SOC2Page'),
  '/privacy': () => import('../pages/PrivacyPage'),
  '/terms': () => import('../pages/TermsPage'),

  // ── Auth / account ──────────────────────────────────
  '/login': () => import('../pages/Login'),
  '/register': () => import('../pages/Register'),
  '/forgot-password': () => import('../pages/ForgotPassword'),
  '/verify-email': () => import('../pages/VerifyEmail'),
  '/reset-password': () => import('../pages/ResetPassword'),
  '/set-password': () => import('../pages/SetPassword'),
  '/auth/callback': () => import('../pages/AuthCallback'),
  '/join': () => import('../pages/JoinPage'),

  // ── Workspace (authed shell) ────────────────────────
  '/dashboard': () => import('../pages/DashboardPage'),
  '/explore': () => import('../pages/ExplorePage'),
  '/learn': () => import('../pages/LearnPage'),
  '/ask': () => import('../pages/AskPage'),
  '/first-issue': () => import('../pages/FirstIssuePage'),
  '/pr-describe': () => import('../pages/PRDescriptionPage'),
  '/tasks': () => import('../pages/TasksPage'),
  '/notifications': () => import('../pages/NotificationsPage'),
  '/onboarding-plan': () => import('../pages/OnboardingPlanPage'),
  '/wiki': () => import('../pages/WikiPage'),
  '/profile': () => import('../pages/Profile'),
  '/settings': () => import('../pages/Settings'),

  // ── Role portals ────────────────────────────────────
  '/my-progress': () => import('../pages/TraineeDashboard'),
  '/onboarding-hub': () => import('../pages/OnboardingHubPage'),
  '/dev-space': () => import('../pages/DevSpacePage'),
  '/senior-space': () => import('../pages/SeniorSpacePage'),
  '/team': () => import('../pages/TeamPage'),
  '/playbooks': () => import('../pages/PlaybooksPage'),
  '/marketplace': () => import('../pages/MarketplacePage'),
  '/billing': () => import('../pages/BillingPage'),
  '/api-keys': () => import('../pages/ApiKeysPage'),
  '/reports': () => import('../pages/OnboardingReportPage'),
  '/reviews': () => import('../pages/ReviewQueuePage'),
  '/code-health': () => import('../pages/CodeHealthPage'),
  '/drift': () => import('../pages/DriftDetectionPage'),
  '/autonomous': () => import('../pages/AutonomousCodingPage'),
  '/ramp': () => import('../pages/RampPage'),
  '/developer-portal': () => import('../pages/DeveloperPortal'),
  '/member/': () => import('../pages/MemberDetailPage'),
  '/module/': () => import('../pages/ModuleHealthPage'),

  // ── HR / people ─────────────────────────────────────
  '/hr/people': () => import('../pages/HrPeoplePage'),
  '/hr/cohort/': () => import('../pages/HRDashboard'),
  '/hr-dashboard': () => import('../pages/HrDashboardPage'),

  // ── Admin / leadership ──────────────────────────────
  '/executive': () => import('../pages/ExecutivePage'),
  '/admin': () => import('../pages/AdminDashboardPage'),
  '/admin/create-account': () => import('../pages/AdminCreateAccount'),
  '/admin/audit': () => import('../pages/AuditLogPage'),
  '/admin/feature-flags': () => import('../pages/FeatureFlagsPage'),
}

/** Loaders already fired — avoid re-importing (cheap, but keeps it tidy). */
const fired = new Set<Loader>()

/**
 * Kick off the chunk download for a route. Best-effort: failures are ignored
 * (the route will just load normally on click).
 */
export function prefetchRoute(pathname: string): void {
  if (!pathname) return

  let loader: Loader | undefined = loaders[pathname]

  // Dynamic routes — match the longest registered prefix, e.g. `/member/…`.
  if (!loader) {
    let best: Loader | undefined
    let bestLen = -1
    for (const [key, l] of Object.entries(loaders)) {
      if (key.endsWith('/') && pathname.startsWith(key) && key.length > bestLen) {
        best = l
        bestLen = key.length
      }
    }
    loader = best
  }

  if (loader && !fired.has(loader)) {
    fired.add(loader)
    void loader().catch(() => {
      // Ignore — prefetch is an optimization, not a requirement.
    })
  }
}

/** Prefetch several routes at once (e.g. warm-up after login). */
export function prefetchRoutes(paths: string[]): void {
  for (const p of paths) prefetchRoute(p)
}

/** Event handlers for a link — prefetch on hover and on keyboard focus. */
export function prefetchProps(to: string) {
  return {
    onMouseEnter: () => prefetchRoute(to),
    onFocus: () => prefetchRoute(to),
  }
}
