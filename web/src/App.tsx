import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TransitionProvider } from './context/TransitionContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Layout from './components/layout/Layout'
import GlobalNatureBackground from './components/ui/GlobalNatureBackground'

// Route-level code splitting: each page is its own lazily-loaded chunk so the
// initial bundle stays small.
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
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
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TransitionProvider>
          <GlobalNatureBackground>
            <Suspense fallback={null}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/explore" element={<ExplorePage />} />
                  <Route path="/learn" element={<LearnPage />} />
                  <Route path="/first-issue" element={<FirstIssuePage />} />
                  <Route path="/ask" element={<AskPage />} />
                  <Route path="/reports" element={<OnboardingReportPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/playbooks" element={<PlaybooksPage />} />
                  <Route path="/billing" element={<BillingPage />} />
                  <Route path="/api-keys" element={<ApiKeysPage />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/pr-describe" element={<PRDescriptionPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>
              </Route>
            </Routes>
            </Suspense>
          </GlobalNatureBackground>
        </TransitionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
