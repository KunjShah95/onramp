import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TransitionProvider } from './context/TransitionContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import { RoastModeProvider } from './context/RoastModeContext'
import { FeatureFlagProvider } from './context/FeatureFlagContext'
import { RealTimeProvider } from './context/RealTimeContext'
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
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const SetPassword = lazy(() => import('./pages/SetPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const HRDashboard = lazy(() => import('./pages/HRDashboard'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const LearnPage = lazy(() => import('./pages/LearnPage'))
const FirstIssuePage = lazy(() => import('./pages/FirstIssuePage'))
const AskPage = lazy(() => import('./pages/AskPage'))
const OnboardingReportPage = lazy(() => import('./pages/OnboardingReportPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const PlaybooksPage = lazy(() => import('./pages/PlaybooksPage'))
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'))
const BillingPage = lazy(() => import('./pages/BillingPage'))
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const WhyOnrampPage = lazy(() => import('./pages/WhyOnrampPage'))
const PRDescriptionPage = lazy(() => import('./pages/PRDescriptionPage'))
const ChangelogPage = lazy(() => import('./pages/ChangelogPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const SupportPage = lazy(() => import('./pages/SupportPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const TraineeDashboard = lazy(() => import('./pages/TraineeDashboard'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const BlogPage = lazy(() => import('./pages/BlogPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const SecurityPage = lazy(() => import('./pages/SecurityPage'))
const DPAPage = lazy(() => import('./pages/DPAPage'))
const SOC2Page = lazy(() => import('./pages/SOC2Page'))

// New Phase 2-5 pages
const HrDashboardPage = lazy(() => import('./pages/HrDashboardPage'))
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'))
const CodeHealthPage = lazy(() => import('./pages/CodeHealthPage'))
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'))
const ModuleHealthPage = lazy(() => import('./pages/ModuleHealthPage'))

// Admin/Owner pages
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'))
const AdminCreateAccount = lazy(() => import('./pages/AdminCreateAccount'))
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// Role-based portal pages
const DevSpacePage = lazy(() => import('./pages/DevSpacePage'))
const ExecutivePage = lazy(() => import('./pages/ExecutivePage'))
const SeniorSpacePage = lazy(() => import('./pages/SeniorSpacePage'))
const OnboardingHubPage = lazy(() => import('./pages/OnboardingHubPage'))
const HrPeoplePage = lazy(() => import('./pages/HrPeoplePage'))
const OnboardingPlanPage = lazy(() => import('./pages/OnboardingPlanPage'))
const WikiPage = lazy(() => import('./pages/WikiPage'))
const FeatureFlagsPage = lazy(() => import('./pages/FeatureFlagsPage'))
const DeveloperPortal = lazy(() => import('./pages/DeveloperPortal'))
const DriftDetectionPage = lazy(() => import('./pages/DriftDetectionPage'))
const AutonomousCodingPage = lazy(() => import('./pages/AutonomousCodingPage'))
const RampPage = lazy(() => import('./pages/RampPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RealTimeProvider>
        <RoastModeProvider>
        <FeatureFlagProvider>
        <TransitionProvider>
          <ToastProvider>
          <ThemeProvider>
          <GlobalBackground>
            <Routes>
              {/* ── Public routes ────────────────────────────────── */}
              <Route path="/" element={
                <Suspense fallback={<LandingLoadingFallback />}>
                  <ErrorBoundary><LandingPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/pricing" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><PricingPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/why-onramp" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><WhyOnrampPage /></ErrorBoundary>
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
              <Route path="/support" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><SupportPage /></ErrorBoundary>
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
              <Route path="/verify-email" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><VerifyEmail /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/reset-password" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><ResetPassword /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/set-password" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><SetPassword /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/auth/callback" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><AuthCallback /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/join" element={
                <Suspense fallback={<FormLoadingFallback />}>
                  <ErrorBoundary><JoinPage /></ErrorBoundary>
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
              <Route path="/about" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><AboutPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/blog" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><BlogPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/contact" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><ContactPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/blog/:slug" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><BlogPostPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/customers" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><CustomersPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/security" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><SecurityPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/dpa" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><DPAPage /></ErrorBoundary>
                </Suspense>
              } />
              <Route path="/soc-2" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <ErrorBoundary><SOC2Page /></ErrorBoundary>
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
                   <Route path="/developer-portal" element={
                     <Suspense fallback={<PageLoadingFallback />}>
                       <ErrorBoundary><DeveloperPortal /></ErrorBoundary>
                     </Suspense>
                   } />
                   <Route path="/notifications" element={
                    <Suspense fallback={<NotificationsSkeleton />}>
                      <ErrorBoundary><NotificationsPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/onboarding-plan" element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <ErrorBoundary><OnboardingPlanPage /></ErrorBoundary>
                    </Suspense>
                  } />
                  <Route path="/wiki" element={
                    <Suspense fallback={<PageLoadingFallback />}>
                      <ErrorBoundary><WikiPage /></ErrorBoundary>
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

                  {/* Trainee / Junior Only Pages */}
                  <Route element={<RoleGuard allowedRoles={['member', 'junior_dev']} />}>
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

                  {/* Developer / Owner / CEO / CTO Pages */}
                  <Route element={<RoleGuard allowedRoles={['developer', 'admin', 'ceo', 'cto', 'senior_dev', 'tester']} />}>
                    <Route path="/dev-space" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><DevSpacePage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>

                  {/* Tester / Developer + Pages (hr deliberately excluded).
                      allowNoTeam: brand-new users (role null, no team) land here
                      and see the first-run welcome instead of the mission console. */}
                  <Route element={<RoleGuard allowedRoles={['tester', 'developer', 'senior_dev', 'senior', 'admin', 'ceo', 'cto']} allowNoTeam />}>
                    <Route path="/dashboard" element={
                      <Suspense fallback={<DashboardSkeleton />}>
                        <ErrorBoundary><DashboardPage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>

                  {/* Senior / CTO / Lead Only Pages */}
                  <Route element={<RoleGuard minRole="senior" />}>
                    <Route path="/senior-space" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><SeniorSpacePage /></ErrorBoundary>
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
                    <Route path="/marketplace" element={
                      <Suspense fallback={<PlaybooksSkeleton />}>
                        <ErrorBoundary><MarketplacePage /></ErrorBoundary>
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

                    {/* Architecture Drift Detection */}
                    <Route path="/drift" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><DriftDetectionPage /></ErrorBoundary>
                      </Suspense>
                    } />

                    {/* Autonomous Coding Agent */}
                    <Route path="/autonomous" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><AutonomousCodingPage /></ErrorBoundary>
                      </Suspense>
                    } />

                    {/* Ramp Visibility — v1.4 wedge */}
                    <Route path="/ramp" element={
                      <Suspense fallback={<DashboardSkeleton />}>
                        <ErrorBoundary><RampPage /></ErrorBoundary>
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

                  {/* HR Only Pages */}
                  <Route element={<RoleGuard allowedRoles={['hr']} />}>
                    <Route path="/hr/people" element={
                      <Suspense fallback={<DashboardSkeleton />}>
                        <ErrorBoundary><HrPeoplePage /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/hr/cohort/:teamId" element={
                      <Suspense fallback={<DashboardSkeleton />}>
                        <ErrorBoundary><HRDashboard /></ErrorBoundary>
                      </Suspense>
                    } />
                    <Route path="/hr-dashboard" element={
                      <Suspense fallback={<DashboardSkeleton />}>
                        <ErrorBoundary><HrDashboardPage /></ErrorBoundary>
                      </Suspense>
                    } />
                  </Route>

                  {/* Owner / CEO / CTO Pages */}
                  <Route element={<RoleGuard allowedRoles={['admin', 'ceo', 'cto']} />}>
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
                    <Route path="/admin/create-account" element={
                      <Suspense fallback={<PageLoadingFallback />}>
                        <ErrorBoundary><AdminCreateAccount /></ErrorBoundary>
                      </Suspense>
                    } />
                     <Route path="/admin/audit" element={
                       <Suspense fallback={<PageLoadingFallback />}>
                         <ErrorBoundary><AuditLogPage /></ErrorBoundary>
                       </Suspense>
                     } />
                     <Route path="/admin/feature-flags" element={
                       <Suspense fallback={<PageLoadingFallback />}>
                         <ErrorBoundary><FeatureFlagsPage /></ErrorBoundary>
                       </Suspense>
                     } />
               </Route>
               </Route>
               </Route>

              {/* ── Catch-all 404 ── */}
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
        </FeatureFlagProvider>
        </RoastModeProvider>
        </RealTimeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
