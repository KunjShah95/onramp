import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthNavbar from '../components/ui/auth-navbar'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAuth, homeForRole } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { ArrowRight, ArrowUpRight, TreeStructure } from '@phosphor-icons/react'
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
      <div data-theme="landing" className="landing-premium min-h-screen bg-room text-ink antialiased">
      <AuthNavbar />
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 font-body relative overflow-hidden">
        {/* Premium background accents */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-go/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-go/3 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 rounded-lg border border-go/20 bg-gradient-to-br from-panel via-panel to-panel/80 overflow-hidden shadow-2xl backdrop-blur-sm relative z-10"
        >
          {/* LEFT — premium brand panel */}
          <aside className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-bg-secondary/80 via-bg-secondary/60 to-bg-secondary/40 border-r border-go/10 relative">
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

            <Link to="/" className="flex items-center gap-2.5 group relative z-10">
              <div className="w-9 h-9 rounded-[3px] bg-cyan-400/90 shadow-lg flex items-center justify-center text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
                <TreeStructure size={16} weight="bold" />
              </div>
              <span className="font-display text-sm font-bold text-white tracking-tight">ONRAMP</span>
            </Link>

            <div className="space-y-6 relative z-10">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-go-lit motion-safe:animate-pulse-glow" />
                <span className="designator text-[hsl(var(--muted-foreground))]">AUTH · ACCESS</span>
              </div>
              <h1 className="font-display text-5xl xl:text-6xl text-[hsl(var(--foreground))] tracking-tight leading-[1.05] font-bold">
                Welcome back.
                <br />
                <span className="text-go">Ship faster.</span>
              </h1>
              <p className="text-[hsl(var(--muted-foreground))] text-[14px] leading-relaxed max-w-sm">
                Sign in to access your team's codebase insights, onboarding plans, and AI-powered mentorship.
              </p>
            </div>

            <div className="flex items-center gap-4 text-caption text-[hsl(var(--muted-foreground))] relative z-10">
              <span className="font-code text-[12px]">Enterprise Grade</span>
              <span className="w-1 h-1 rounded-full bg-go/30" />
              <span className="text-[12px]">SOC 2 Type II</span>
              <span className="w-1 h-1 rounded-full bg-go/30" />
              <span className="text-[12px]">SAML SSO</span>
            </div>
          </aside>

          {/* RIGHT — form panel */}
          <main className="p-8 sm:p-10 flex flex-col justify-center min-h-[520px] relative z-10">
            <Link to="/" className="flex lg:hidden items-center gap-2.5 mb-8">
              <div className="w-9 h-9 rounded-[3px] bg-cyan-400/90 shadow-lg flex items-center justify-center text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
                <TreeStructure size={16} weight="bold" />
              </div>
              <span className="font-display text-sm font-bold text-white tracking-tight">ONRAMP</span>
            </Link>

            <div className="mb-8">
              <span className="designator text-[hsl(var(--muted-foreground))]">{stage === 'email' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}</span>
              <h2 className="font-display text-3xl text-[hsl(var(--foreground))] font-bold tracking-tight mt-3">
                {stage === 'email' ? 'Sign in' : 'Enter password'}
              </h2>
              <p className="text-[hsl(var(--muted-foreground))] text-[14px] mt-2">
                {stage === 'email' ? "We'll verify your email, then ask for your password." :
                  <>Signing in as <span className="font-code text-[hsl(var(--foreground))]">{email}</span> · <button type="button" onClick={goBack} className="text-go hover:underline font-medium">change</button></>}
              </p>
            </div>

            {error && (
              <div className="bg-abort/10 text-abort rounded-lg px-4 py-3 mb-6 text-[13px] border border-abort/20 font-medium" role="alert">
                {error}
              </div>
            )}

            {/* OAuth — premium styling */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <a
                href={getGoogleLoginUrl()}
                aria-label="Continue with Google"
                className="group flex items-center justify-center gap-2 bg-panel-raised border border-seam/50 rounded-lg py-3 text-[14px] font-semibold text-[hsl(var(--foreground))] hover:border-go/30 hover:shadow-lg active:scale-[0.98] transition-all backdrop-blur-sm"
              >
                <span className="w-5 h-5 rounded-md bg-base border border-seam flex items-center justify-center font-code font-bold text-[11px] text-[hsl(var(--foreground))] group-hover:text-go">G</span>
                Google
              </a>
              <a
                href={getGithubLoginUrl()}
                aria-label="Continue with GitHub"
                className="group flex items-center justify-center gap-2 bg-[hsl(var(--foreground))]/5 border border-[hsl(var(--foreground))]/20 rounded-lg py-3 text-[14px] font-semibold text-[hsl(var(--foreground))] hover:border-go/30 hover:shadow-lg active:scale-[0.98] transition-all backdrop-blur-sm"
              >
                <span className="w-5 h-5 rounded-md bg-base flex items-center justify-center font-code font-bold text-[11px] text-[hsl(var(--foreground))]">GH</span>
                GitHub
              </a>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-seam/50" />
              <span className="text-[11px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold">or email</span>
              <div className="flex-1 h-px bg-seam/50" />
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
                      <Link to="/forgot-password" className="text-[11px] font-semibold text-go hover:underline">
                        Forgot?
                      </Link>
                    }
                  />
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-seam/50 text-go focus:ring-go/30 bg-base/50"
                    />
                    <span className="text-[13px] text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))] transition-colors font-medium">Keep me signed in</span>
                  </label>
                </>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  'w-full mt-6 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isSubmitting ? 'Signing in...' : stage === 'email' ? 'Continue' : 'Sign in'}
                {!isSubmitting && <ArrowRight size={18} weight="bold" />}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-seam/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-[hsl(var(--muted-foreground))]">
              <span>New to Onramp?</span>
              <Link to="/register" className="text-go font-semibold hover:text-go-lit transition-colors inline-flex items-center gap-2">
                Create free account <ArrowUpRight size={14} weight="bold" />
              </Link>
            </div>
          </main>
        </motion.div>
      </div>
      </div>
    </PageTransition>
  )
}
