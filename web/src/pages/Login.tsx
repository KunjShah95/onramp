import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { EnvelopeSimple, Lock, ArrowRight } from '@phosphor-icons/react'
import { getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { login, error, clearError, user, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  // Only auto-redirect if already authenticated AND role is synced (not loading)
  useEffect(() => {
    if (user && !loading) navigate(from, { replace: true })
  }, [user, loading, navigate, from])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await login(email, password)
      toast.success('Signed in', 'Welcome back!')
      navigate(from, { replace: true })
    } catch {
      // Error displayed inline via AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageTransition>
      <div className="bg-[hsl(var(--background))] min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-body">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[hsl(var(--accent))]/5 rounded-full blur-[100px] pointer-events-none" />

        <motion.main
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[400px] z-10"
        >
          {/* Brand Header */}
          <motion.div variants={fadeUp} className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-[hsl(var(--accent))]/10 flex items-center justify-center mb-4">
              <span className="text-xl font-display font-bold text-[hsl(var(--accent))]">✦</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              Nexora
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 text-center font-body">Log in to your workspace</p>
          </motion.div>

          {error && (
            <motion.div variants={fadeUp} className="bg-red-50 text-red-600 rounded-lg px-4 py-3 mb-5 text-sm border border-red-200">
              {error}
            </motion.div>
          )}

          {/* Auth Card */}
          <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard relative overflow-hidden">
            {/* Top decorative line */}
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

            {/* Social Login Buttons */}
            <div className="space-y-3 mb-5">
              <a
                href={getGoogleLoginUrl()}
                className="w-full flex items-center justify-center gap-2.5 bg-white border border-[hsl(var(--border))] rounded-xl py-2.5 text-sm text-[hsl(var(--foreground))] font-medium hover:bg-[hsl(var(--secondary))] active:scale-[0.98] transition-all font-body"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </a>

              <a
                href={getGithubLoginUrl()}
                className="w-full flex items-center justify-center gap-2.5 bg-[#24292F] border border-[#1B1F23] rounded-xl py-2.5 text-sm text-white font-medium hover:bg-[#1B1F23] active:scale-[0.98] transition-all font-body"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                Continue with GitHub
              </a>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]/40 font-body">or sign in with email</span>
              <div className="flex-1 h-px bg-[hsl(var(--border))]" />
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">Email Address</label>
                <div className="relative">
                  <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    id="email"
                    type="email"
                    placeholder="developer@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError() }}
                    required
                    autoComplete="email"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="password" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">Password</label>
                  <Link to="/forgot-password" className="text-xs text-[hsl(var(--accent))] hover:opacity-80 transition-colors font-body">Forgot?</Link>
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError() }}
                    required
                    autoComplete="current-password"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !email || !password}
                className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed font-body"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
                <ArrowRight size={16} weight="bold" />
              </button>
            </form>
          </motion.div>

          {/* Footer */}
          <motion.div variants={fadeUp} className="mt-6 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body">
              Don't have an account?{' '}
              <Link to="/register" className="text-[hsl(var(--accent))] font-medium hover:opacity-80 transition-colors font-body">
                Register
              </Link>
            </p>
          </motion.div>
        </motion.main>
      </div>
    </PageTransition>
  )
}
