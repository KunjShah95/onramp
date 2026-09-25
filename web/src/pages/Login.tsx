import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import AuthShell from '../components/ui/auth-shell'
import { useState, useEffect, useRef } from 'react'
import { useAuth, homeForRole } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'
import { getPlanIntent, billingUrlWithPlan } from '../lib/plan-intent'
import InputField from '../components/ui/first-principles/InputField'
import PasswordField from '../components/ui/PasswordField'

const AUTH_RETURN_STORAGE_KEY = 'onramp.authReturnTo'

function safeInternalReturn(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes(':')) return null
  return value
}

function rememberAuthReturn(value: string | null | undefined) {
  if (!value) return
  try { sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, value) } catch { /* storage optional */ }
}

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
  const [searchParams] = useSearchParams()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const fromLocation = (location.state as { from?: { pathname?: string; search?: string; hash?: string } })?.from
  const stateReturn = fromLocation
    ? safeInternalReturn(`${fromLocation.pathname || ''}${fromLocation.search || ''}${fromLocation.hash || ''}`)
    : null
  const queryReturn = safeInternalReturn(searchParams.get('returnTo'))
  const from = stateReturn || queryReturn || undefined

  // Plan intent carried from landing #pricing via /register — after sign-in the user
  // lands directly in the billing funnel (Razorpay checkout).
  const planIntent = getPlanIntent(searchParams)
  const postAuthDest = planIntent ? billingUrlWithPlan(planIntent) : null

  useEffect(() => {
    rememberAuthReturn(from)
  }, [from])

  useEffect(() => {
    if (!user || loading) return
    const destination = postAuthDest || from || homeForRole(role)
    try { sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY) } catch { /* storage optional */ }
    navigate(destination, { replace: true })
  }, [user, loading, navigate, postAuthDest, from, role])

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
    if (!isEmailValid) return
    setStage('password')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || !isPasswordValid) return
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
          designator={stage === 'email' ? 'Step 1 of 2' : 'Step 2 of 2'}
          status={stage === 'email' ? 'standby' : 'go'}
          title={stage === 'email' ? 'Sign in' : 'Enter password'}
          subtitle={
            stage === 'email'
              ? "Enter your work email to continue."
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
              <Link
                to={`/register${planIntent ? `?plan=${planIntent}` : ''}${from ? `${planIntent ? '&' : '?'}returnTo=${encodeURIComponent(from)}` : ''}`}
                className="text-go font-semibold hover:text-go-lit transition-colors inline-flex items-center gap-1.5 ml-2"
              >
                Create free account <ArrowUpRight size={14} weight="bold" />
              </Link>
            </>
          }
        >
          {error && (
            <div className="flex gap-2.5 rounded-card border border-abort/15 bg-abort/5 px-4 py-3 mb-6 text-[13px] font-medium text-abort" role="alert">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span className="leading-[1.5]">{error}</span>
            </div>
          )}

          {/* OAuth — premium white, hairline, indigo hover */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <a
              href={getGoogleLoginUrl()}
              onClick={() => rememberAuthReturn(from)}
              aria-label="Continue with Google"
              className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-seam bg-panel px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-seam transition-colors hover:border-seam-strong hover:bg-panel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-seam bg-well font-code text-[10px] font-bold text-ink-tertiary">G</span>
              Google
            </a>
            <a
              href={getGithubLoginUrl()}
              onClick={() => rememberAuthReturn(from)}
              aria-label="Continue with GitHub"
              className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-seam bg-panel px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-seam transition-colors hover:border-seam-strong hover:bg-panel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-seam bg-inset font-code text-[10px] font-bold text-ink">GH</span>
              GitHub
            </a>
          </div>

          {/* Divider — hairline, mono */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-seam" />
            <span className="font-code text-[11px] font-medium uppercase tracking-[0.1em] text-ink-tertiary">or email</span>
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
                <PasswordField
                  label="Password"
                  name="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError() }}
                  required
                  autoComplete="current-password"
                  autoFocus
                  trailingExtra={
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
