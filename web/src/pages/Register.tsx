import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useAuth, homeForRole } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getPlanIntent, billingUrlWithPlan } from '../lib/plan-intent'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { ArrowRight, EnvelopeSimple, Lock, User } from '@phosphor-icons/react'
import { getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'
import InputField from '../components/ui/first-principles/InputField'
import PasswordField from '../components/ui/PasswordField'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const { register, error, clearError, user, loading, role } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Plan intent carried from landing #pricing — after signup the user lands directly
  // in the billing funnel (Razorpay checkout) instead of the default home.
  const planIntent = getPlanIntent(searchParams)
  const postAuthDest = planIntent ? billingUrlWithPlan(planIntent) : null

  useEffect(() => {
    if (user && !loading) navigate(postAuthDest || homeForRole(role), { replace: true })
  }, [user, loading, navigate, postAuthDest, role])

  useEffect(() => {
    if (!loading) nameRef.current?.focus()
  }, [loading])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters')
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await register(email, password, name)
      toast.success('Account created', `Welcome, ${name}!`)
    } catch {
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayError = localError || error

  return (
    <PageTransition>
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Create Account · Onramp" description="Create your free Onramp account and start shipping faster with AI-powered onboarding." path="/register" noindex />
        <AuthShell
          rail="Access"
          designator="CREATE ACCOUNT"
          status="standby"
          title="Create Account"
          subtitle="Start shipping faster with AI-powered onboarding"
          footer={
            <>
              <span>Already have an account?</span>
              <Link to={planIntent ? `/login?plan=${planIntent}` : '/login'} className="text-go font-semibold hover:text-go-lit transition-colors ml-2">
                Sign in
              </Link>
            </>
          }
        >
          {displayError && (
            <div className="flex gap-2.5 rounded-xl border border-abort/15 bg-abort/5 px-4 py-3 mb-6 text-[13px] font-medium text-abort" role="alert">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-abort" />
              <span className="leading-[1.5]">{displayError}</span>
            </div>
          )}

          {/* OAuth */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <a
              href={getGoogleLoginUrl()}
              aria-label="Sign up with Google"
              className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-seam bg-panel px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-seam transition-colors hover:border-seam-strong hover:bg-panel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-seam bg-well font-code text-[10px] font-bold text-ink-tertiary">G</span>
              Google
            </a>
            <a
              href={getGithubLoginUrl()}
              aria-label="Sign up with GitHub"
              className="inline-flex items-center justify-center gap-2 rounded-[5px] border border-seam bg-panel px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-seam transition-colors hover:border-seam-strong hover:bg-panel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-seam bg-inset font-code text-[10px] font-bold text-ink">GH</span>
              GitHub
            </a>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-seam" />
            <span className="font-code text-[11px] font-medium uppercase tracking-[0.1em] text-ink-tertiary">or email</span>
            <div className="flex-1 h-px bg-seam" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              ref={nameRef}
              label="Name"
              name="name"
              type="text"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              icon={<User size={15} weight="bold" />}
            />
            <InputField
              label="Email"
              name="email"
              type="email"
              placeholder="developer@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              icon={<EnvelopeSimple size={15} weight="bold" />}
            />
            <PasswordField
              label="Password"
              name="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
              icon={<Lock size={15} weight="bold" />}
            />
            <PasswordField
              label="Confirm Password"
              name="confirmPassword"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              icon={<Lock size={15} weight="bold" />}
            />

            <button
              type="submit"
              disabled={isSubmitting || !name || !email || !password || !confirmPassword}
              className="btn btn-primary w-full mt-2"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
              {!isSubmitting && <ArrowRight size={16} weight="bold" />}
            </button>
          </form>
        </AuthShell>
      </div>
    </PageTransition>
  )
}
