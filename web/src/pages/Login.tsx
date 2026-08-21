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
        <Seo title="Sign in · Onramp" description="Sign in to access your team's codebase insights, onboarding plans, and AI-powered mentorship." path="/login" noindex />
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
            <div className="flex gap-2.5 rounded-xl border border-abort/15 bg-abort/5 px-4 py-3 mb-6 text-[13px] font-medium text-abort" role="alert">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span className="leading-[1.5]">{error}</span>
            </div>
          )}

          {/* OAuth — premium white, hairline, indigo hover */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <a
              href={getGoogleLoginUrl()}
              aria-label="Continue with Google"
              className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-black/10 bg-white px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-black/15 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] active:translate-y-px"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-black/10 bg-[#F8FAFC] font-code text-[10px] font-bold text-ink-tertiary">G</span>
              Google
            </a>
            <a
              href={getGithubLoginUrl()}
              aria-label="Continue with GitHub"
              className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-black/10 bg-white px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-black/15 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] active:translate-y-px"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-black/10 bg-[#0F172A] font-code text-[10px] font-bold text-white">GH</span>
              GitHub
            </a>
          </div>

          {/* Divider — hairline, mono */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-black/5" />
            <span className="font-code text-[11px] font-medium uppercase tracking-[0.1em] text-ink-tertiary">or email</span>
            <div className="flex-1 h-px bg-black/5" />
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
