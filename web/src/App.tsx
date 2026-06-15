import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TransitionProvider } from './context/TransitionContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Layout from './components/layout/Layout'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import FullAnalysis from './pages/FullAnalysis'
import RepoAnalysis from './pages/RepoAnalysis'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Tasks from './pages/Tasks'
import Roadmap from './pages/Roadmap'
import TeamAnalytics from './pages/TeamAnalytics'
import CTODashboard from './pages/CTODashboard'
import ExplorePage from './pages/ExplorePage'
import LearnPage from './pages/LearnPage'
import FirstIssuePage from './pages/FirstIssuePage'
import AskPage from './pages/AskPage'

import GenericContentPage from './pages/GenericContentPage'
import Pricing from './pages/Pricing'
import Product from './pages/Product'
import HowItWorksPage from './pages/HowItWorksPage'
import Customers from './pages/Customers'
import Docs from './pages/Docs'
import GlobalNatureBackground from './components/ui/GlobalNatureBackground'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TransitionProvider>
          <GlobalNatureBackground>
            <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/product" element={<Product />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/integrations" element={<GenericContentPage title="Integrations" />} />
          <Route path="/blog" element={<GenericContentPage title="Blog" />} />
          <Route path="/support" element={<GenericContentPage title="Support" />} />
          <Route path="/about" element={<GenericContentPage title="About Us" />} />
          <Route path="/careers" element={<GenericContentPage title="Careers" />} />
          <Route path="/contact" element={<GenericContentPage title="Contact Us" />} />
          <Route path="/privacy" element={<GenericContentPage title="Privacy Policy" />} />
          <Route path="/terms" element={<GenericContentPage title="Terms of Service" />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/analysis/:owner/:repo" element={<FullAnalysis />} />
              <Route path="/repo/:owner/:repo" element={<RepoAnalysis />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/team" element={<TeamAnalytics />} />
              <Route path="/cto" element={<CTODashboard />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/first-issue" element={<FirstIssuePage />} />
              <Route path="/ask" element={<AskPage />} />
            </Route>
          </Route>            </Routes>
          </GlobalNatureBackground>
        </TransitionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
