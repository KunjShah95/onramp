import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAuth, homeForRole } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react'
import { getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'
import InputField from '../components/ui/first-principles/InputField'
import { cn } from '../lib/utils'

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

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  useEffect(() => {
    if (user && !loading) navigate(from || homeForRole(role), { replace: true })
  }, [user, loading, navigate, from, role])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  useEffect(() => {
    emailRef.current?.focus()
  }, [stage])

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
      // inline error
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
      <div className="bg-[hsl(var(--background))] min-h-screen flex items-center justify-center p-4 sm:p-6 font-body relative">
        {/* Split card — left brand, right form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 rounded-card border border-seam bg-panel overflow-hidden shadow-seam"
        >
          {/* LEFT — brand panel */}
          <aside className="hidden lg:flex flex-col justify-between p-10 bg-base border-r border-seam relative">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-[3px] bg-accent-from shadow-lit flex items-center justify-center">
                <span className="text-[11px] font-display font-bold text-white tracking-tight">OR</span>
              </div>
              <span className="font-display text-sm font-bold text-ink tracking-tight">Onramp</span>
            </Link>

            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-go-lit motion-safe:animate-pulse-glow" />
                <span className="designator text-ink-secondary">FLIGHT · CONSOLE</span>
              </div>
              <h1 className="font-display text-4xl xl:text-5xl text-ink tracking-tight leading-[1.05] font-bold">
                Skip the docs.
                <br />
                <span className="text-go">Read the code.</span>
              </h1>
              <p className="text-ink-secondary text-[14px] leading-relaxed max-w-sm">
                Your team indexes a repo in two minutes and answers ramp-up questions grounded in the actual code — file, line, commit.
              </p>
            </div>

            <div className="flex items-center gap-4 text-caption text-ink-tertiary">
              <span className="font-code">v2.4</span>
              <span className="w-1 h-1 rounded-full bg-ink-disabled" />
              <span>SOC 2</span>
              <span className="w-1 h-1 rounded-full bg-ink-disabled" />
              <span>SAML</span>
            </div>
          </aside>

          {/* RIGHT — form panel */}
          <main className="p-7 sm:p-10 flex flex-col justify-center min-h-[520px]">
            {/* Mobile-only brand */}
            <Link to="/" className="flex lg:hidden items-center gap-2.5 mb-6">
              <div className="w-9 h-9 rounded-[3px] bg-accent-from shadow-lit flex items-center justify-center">
                <span className="text-[11px] font-display font-bold text-white tracking-tight">OR</span>
              </div>
              <span className="font-display text-sm font-bold text-ink tracking-tight">Onramp</span>
            </Link>

            <div className="mb-6">
              <span className="designator text-ink-secondary">{stage === 'email' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}</span>
              <h2 className="font-display text-2xl md:text-3xl text-ink font-bold tracking-tight mt-2">
                {stage === 'email' ? 'Sign in' : 'Enter your password'}
              </h2>
              <p className="text-ink-secondary text-[13.5px] mt-1.5">
                {stage === 'email' ? "We'll check your email, then ask for your password." :
                  <>Signing in as <span className="font-code text-ink">{email}</span> · <button type="button" onClick={goBack} className="text-go hover:underline">change</button></>}
              </p>
            </div>

            {error && (
              <div className="bg-error/10 text-error rounded-[3px] px-4 py-2.5 mb-4 text-[13px] border border-error/25" role="alert" aria-atomic="true">
                {error}
              </div>
            )}

            {/* OAuth — equal weight, monogrammed */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <a
                href={getGoogleLoginUrl()}
                aria-label="Continue with Google"
                className="group flex items-center justify-center gap-2 bg-panel-raised border border-seam rounded-[3px] py-2.5 text-[13.5px] font-medium text-ink hover:border-go/40 active:scale-[0.98] transition-all"
              >
                <span className="w-5 h-5 rounded-[2px] bg-base border border-seam flex items-center justify-center font-code font-bold text-[11px] text-ink-secondary group-hover:text-go">G</span>
                Continue with Google
              </a>
              <a
                href={getGithubLoginUrl()}
                aria-label="Continue with GitHub"
                className="group flex items-center justify-center gap-2 bg-[hsl(var(--foreground))] border border-[hsl(var(--foreground))] rounded-[3px] py-2.5 text-[13.5px] font-medium text-[hsl(var(--background))] hover:opacity-90 active:scale-[0.98] transition-all"
              >
                <span className="w-5 h-5 rounded-[2px] bg-[hsl(var(--background))] flex items-center justify-center font-code font-bold text-[11px] text-[hsl(var(--foreground))]">GH</span>
                Continue with GitHub
              </a>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-seam" />
              <span className="text-[11px] text-ink-tertiary uppercase tracking-[0.1em] font-semibold">or email</span>
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
                      <Link to="/forgot-password" className="text-[11px] font-medium text-go hover:underline">
                        Forgot?
                      </Link>
                    }
                  />
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded-[2px] border-seam text-go focus:ring-go/30 bg-base"
                    />
                    <span className="text-[12px] text-ink-secondary group-hover:text-ink transition-colors">Remember me</span>
                  </label>
                </>
              )}

              <button
                type="submit"
                disabled={isSubmitting || (stage === 'email' ? !email : !password)}
                className={cn(
                  'w-full bg-go hover:bg-go-lit text-[hsl(var(--primary-foreground))] font-semibold text-[14px] py-3 rounded-[3px] flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                )}
                aria-label={isSubmitting ? 'Signing in' : stage === 'email' ? 'Continue' : 'Sign In'}
              >
                {isSubmitting ? 'Signing in...' : stage === 'email' ? 'Continue' : 'Sign In'}
                <ArrowRight size={16} weight="bold" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-seam flex items-center justify-between text-[12px] text-ink-tertiary">
              <span>New here?</span>
              <Link to="/register" className="text-go font-medium hover:underline inline-flex items-center gap-1">
                Create an account <ArrowUpRight size={12} weight="bold" />
              </Link>
            </div>
          </main>
        </motion.div>
      </div>
    </PageTransition>
  )
}
