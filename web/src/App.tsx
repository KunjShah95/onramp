import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TransitionProvider } from './context/TransitionContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ui/ErrorBoundary'
import {
  PageLoadingFallback,
  FormLoadingFallback,
  LandingLoadingFallback,
} from './components/ui/LoadingFallback'
import {
  DashboardSkeleton,
  TasksPageSkeleton,
  FirstIssueSkeleton,
  SettingsSkeleton,
  ProfileSkeleton,
  BillingSkeleton,
  ApiKeysSkeleton,
  PlaybooksSkeleton,
  PRDescriptionSkeleton,
  NotificationsSkeleton,
  TraineeDashboardSkeleton,
  TeamSettingsSkeleton,
  ReportSkeleton,
  LearningPathSkeleton,
  ExploreResultSkeleton,
  ChatAreaSkeleton,
} from './components/ui/Skeleton'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Layout from './components/layout/Layout'
import GlobalBackground from './components/ui/GlobalBackground'
import RoleGuard from './components/auth/RoleGuard'

// Route-level code splitting: each page is its own lazily-loaded chunk so the
// initial bundle stays small. Each route gets its own Suspense boundary with
// a page-specific skeleton fallback for a polished loading experience.
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const LandingPageV3 = lazy(() => import('./pages/LandingPageV3'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const LearnPage = lazy(() => import('./pages/LearnPage'))
const FirstIssuePage = lazy(() => import('./pages/FirstIssuePage'))
const AskPage = lazy(() => import('./pages/AskPage'))
const OnboardingReportPage = lazy(() => import('./pages/OnboardingReportPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const PlaybooksPage = lazy(() => import('./pages/PlaybooksPage'))
const BillingPage = lazy(() => import('./pages/BillingPage'))
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const PRDescriptionPage = lazy(() => import('./pages/PRDescriptionPage'))
const ChangelogPage = lazy(() => import('./pages/ChangelogPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const TraineeDashboard = lazy(() => import('./pages/TraineeDashboard'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))
const WaitlistPage = lazy(() => import('./pages/WaitlistPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))

// New Phase 2-5 pages
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'))
const CodeHealthPage = lazy(() => import('./pages/CodeHealthPage'))
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'))
const ModuleHealthPage = lazy(() => import('./pages/ModuleHealthPage'))

// Admin/Owner pages
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// Role-based portal pages
const DevSpacePage = lazy(() => import('./pages/DevSpacePage'))
const ExecutivePage = lazy(() => import('./pages/ExecutivePage'))
const SeniorSpacePage = lazy(() => import('./pages/SeniorSpacePage'))
const OnboardingHubPage = lazy(() => import('./pages/OnboardingHubPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TransitionProvider>
          <ToastProvider>
          <ThemeProvider>
          <GlobalBackground>
            <Routes>
              {/* ── Public routes ────────────────────────────────── */}
              <Route path="/" element={
                <Suspense fallback={<LandingLoadingFallback />}>
                  <ErrorBoundary><LandingPageV3 /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/pricing" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><PricingPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/changelog" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><ChangelogPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/docs" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><DocsPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/login" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><Login /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/register" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><Register /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/forgot-password" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><ForgotPassword /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/join" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><JoinPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/waitlist" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><WaitlistPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/privacy" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><PrivacyPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/terms" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><TermsPage /></ErrorBoundary>
                </Suspense>
              } />

              {/* ── Protected routes (authed + layout) ──────────── */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  {/* Common Workspace Pages */}
                  <Route path="/explore" element={
                    <Suspense fallback={<ExploreResultSkeleton />}>
                      <ErrorBoundary><ExplorePage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/learn" element={
                    <Suspense fallback={<LearningPathSkeleton />}>
                      <ErrorBoundary><LearnPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/first-issue" element={
                    <Suspense fallback={<FirstIssueSkeleton />}>
                      <ErrorBoundary><FirstIssuePage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/ask" element={
                    <Suspense fallback={<ChatAreaSkeleton />}>
                      <ErrorBoundary><AskPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/pr-describe" element={
                    <Suspense fallback={<PRDescriptionSkeleton />}>
                      <ErrorBoundary><PRDescriptionPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/tasks" element={
                    <Suspense fallback={<TasksPageSkeleton />}>
                      <ErrorBoundary><TasksPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/notifications" element={
                    <Suspense fallback={<NotificationsSkeleton />}>
                      <ErrorBoundary><NotificationsPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/profile" element={
                    <Suspense fallback={<ProfileSkeleton />}>
                      <ErrorBoundary><Profile /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/settings" element={
                    <Suspense fallback={<SettingsSkeleton />}>
                      <ErrorBoundary><Settings /></ErrorBoundary>
                    </Suspense>
                  } />

                  {/* Trainee / New Dev / Junior Only Pages */}
                  <Route element={<RoleGuard allowedRoles={['new_dev', 'member']} />}>
                    <Route path="/my-progress" element={
                      <Suspense fallback={<TraineeDashboardSkeleton />}>
                        <ErrorBoundary><TraineeDashboard /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/onboarding-hub" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><OnboardingHubPage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>

                  {/* Developer / Tester / Owner Only Pages */}
                  <Route element={<RoleGuard allowedRoles={['developer', 'tester', 'owner', 'ceo', 'cto']} />}>
                    <Route path="/dev-space" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><DevSpacePage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>

                  {/* Senior / CTO / Lead / Owner Only Pages */}
                  <Route element={<RoleGuard minRole="senior_dev" />}>
                    <Route path="/senior-space" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><SeniorSpacePage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/dashboard" element={
                      <Suspense fallback={<DashboardSkeleton />}>
                        <ErrorBoundary><DashboardPage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/team" element={
                      <Suspense fallback={<TeamSettingsSkeleton />}>
                        <ErrorBoundary><TeamPage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/playbooks" element={
                      <Suspense fallback={<PlaybooksSkeleton />}>
                        <ErrorBoundary><PlaybooksPage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/billing" element={
                      <Suspense fallback={<BillingSkeleton />}>
                        <ErrorBoundary><BillingPage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/api-keys" element={
                      <Suspense fallback={<ApiKeysSkeleton />}>
                        <ErrorBoundary><ApiKeysPage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/reports" element={
                      <Suspense fallback={<ReportSkeleton />}>
                        <ErrorBoundary><OnboardingReportPage /></ErrorBoundary>
                      </Suspense>
                    } />

                    {/* Phase 2: Review Queue */}
                    <Route path="/reviews" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><ReviewQueuePage /></ErrorBoundary>
                      </Suspense>
                    } />

                    {/* Phase 3: Code Health Dashboard */}
                    <Route path="/code-health" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><CodeHealthPage /></ErrorBoundary>
                      </Suspense>
                    } />

                    {/* Phase 5: Drill-Down Views */}
                    <Route path="/member/:userId" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><MemberDetailPage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/module/:moduleName" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><ModuleHealthPage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>

                  {/* Owner / CEO / CTO / Admin Only Pages */}
                  <Route element={<RoleGuard allowedRoles={['owner', 'ceo', 'cto']} />}>
                    <Route path="/executive" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><ExecutivePage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/admin" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><AdminDashboardPage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>
                </Route>
              </Route>
              {/* ── Catch-all 404 ─────────────────────────────── */}
              <Route path="*" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><NotFoundPage /></ErrorBoundary>
                </Suspense>
              } />
            </Routes>
          </GlobalBackground>
          </ThemeProvider>
          </ToastProvider>
        </TransitionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
