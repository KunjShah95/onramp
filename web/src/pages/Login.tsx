import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthShell from '../components/ui/auth-shell'
import { useState, useEffect, useRef } from 'react'
import { useAuth, homeForRole } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'
import InputField from '../components/ui/first-principles/InputField'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stage, setStage] = useState<'email' | 'password'>('email')

  const { login, error, clearError, user, loading, role } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  useEffect(() => {
    if (user && !loading) navigate(from || homeForRole(role), { replace: true })
  }, [user, loading, navigate, from, role])

  useEffect(() => {
    if (stage === 'email') {
      emailRef.current?.focus()
    } else {
      passwordRef.current?.focus()
    }
  }, [stage])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const isEmailValid = email.trim() !== '' && email.includes('@')
  const isPasswordValid = password.trim() !== '' && password.length >= 6
  const canSubmit = isSubmitting ? false : (stage === 'email' ? isEmailValid : isPasswordValid)

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setStage('password')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || !password) return
    setIsSubmitting(true)
    try {
      await login(email, password, rememberMe)
      toast.success('Signed in', 'Welcome back!')
    } catch {
    } finally {
      setIsSubmitting(false)
    }
  }

  const goBack = () => {
    setStage('email')
    clearError()
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Sign in — Onramp" description="Sign in to access your team's codebase insights, onboarding plans, and AI-powered mentorship." path="/login" noindex />
        <AuthShell
          rail="Access"
          designator={stage === 'email' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
          status={stage === 'email' ? 'standby' : 'go'}
          title={stage === 'email' ? 'Sign in' : 'Enter password'}
          subtitle={
            stage === 'email'
              ? "We'll verify your email, then ask for your password."
              : (
                  <>
                    Signing in as <span className="font-code text-ink">{email}</span> ·{' '}
                    <button type="button" onClick={goBack} className="text-go hover:underline font-medium">change</button>
                  </>
                )
          }
          footer={
            <>
              <span>New to Onramp?</span>
              <Link to="/register" className="text-go font-semibold hover:text-go-lit transition-colors inline-flex items-center gap-1.5 ml-2">
                Create free account <ArrowUpRight size={14} weight="bold" />
              </Link>
            </>
          }
        >
          {error && (
            <div className="bg-abort/10 text-abort rounded-card px-4 py-3 mb-6 text-body-sm border border-abort/20 font-medium" role="alert">
              {error}
            </div>
          )}

          {/* OAuth */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <a
              href={getGoogleLoginUrl()}
              aria-label="Continue with Google"
              className="btn-glass"
            >
              <span className="w-5 h-5 rounded-[3px] bg-base border border-seam flex items-center justify-center font-code font-bold text-[11px] text-ink-tertiary">
                G
              </span>
              Google
            </a>
            <a
              href={getGithubLoginUrl()}
              aria-label="Continue with GitHub"
              className="btn-glass"
            >
              <span className="w-5 h-5 rounded-[3px] bg-base border border-seam flex items-center justify-center font-code font-bold text-[11px] text-ink-tertiary">
                GH
              </span>
              GitHub
            </a>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-seam" />
            <span className="text-caption text-ink-tertiary uppercase tracking-wider font-semibold">or email</span>
            <div className="flex-1 h-px bg-seam" />
          </div>

          <form onSubmit={stage === 'email' ? handleEmailSubmit : handleSubmit} className="space-y-4">
            {stage === 'email' ? (
              <InputField
                ref={emailRef}
                label="Email"
                name="email"
                type="email"
                placeholder="developer@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError() }}
                required
                autoComplete="email"
              />
            ) : (
              <>
                <InputField
                  label="Password"
                  name="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError() }}
                  required
                  autoComplete="current-password"
                  autoFocus
                  trailing={
                    <Link to="/forgot-password" className="text-caption font-semibold text-go hover:underline">
                      Forgot?
                    </Link>
                  }
                />
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded-[3px] border-seam-strong text-go accent-go"
                  />
                  <span className="text-body-sm text-ink-muted group-hover:text-ink transition-colors font-medium">
                    Keep me signed in
                  </span>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary w-full mt-2"
            >
              {isSubmitting ? 'Signing in...' : stage === 'email' ? 'Continue' : 'Sign in'}
              {!isSubmitting && <ArrowRight size={16} weight="bold" />}
            </button>
          </form>
        </AuthShell>
      </div>
    </PageTransition>
  )
}
