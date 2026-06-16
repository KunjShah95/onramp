import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TransitionProvider } from './context/TransitionContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Layout from './components/layout/Layout'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import LandingPage from './pages/LandingPage'
import ExplorePage from './pages/ExplorePage'
import LearnPage from './pages/LearnPage'
import FirstIssuePage from './pages/FirstIssuePage'
import AskPage from './pages/AskPage'
import OnboardingReportPage from './pages/OnboardingReportPage'
import DashboardPage from './pages/DashboardPage'
import TeamPage from './pages/TeamPage'
import PlaybooksPage from './pages/PlaybooksPage'
import BillingPage from './pages/BillingPage'
import ApiKeysPage from './pages/ApiKeysPage'

import GlobalNatureBackground from './components/ui/GlobalNatureBackground'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TransitionProvider>
          <GlobalNatureBackground>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
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
                  <Route path="/profile" element={<Profile />} />
                </Route>
              </Route>
            </Routes>
          </GlobalNatureBackground>
        </TransitionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
