import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAuth, homeForRole } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'
import { EnvelopeSimple, Lock, User, ArrowRight, TreeStructure } from '@phosphor-icons/react'
import { getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'
import { cn } from '../lib/utils'

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

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

  useEffect(() => {
    if (user && !loading) navigate(homeForRole(role), { replace: true })
  }, [user, loading, navigate, role])

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
      <div data-theme="landing" className="landing-premium landing-light min-h-screen bg-room text-ink antialiased">
      <Seo title="Create Account — Onramp" description="Create your free Onramp account and start shipping faster with AI-powered onboarding." path="/register" noindex />
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 font-body relative overflow-hidden">
        {/* Premium background accents */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-go/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-go/3 rounded-full blur-3xl pointer-events-none" />

        <motion.main
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md z-10 relative"
        >
          {/* Brand Header */}
          <motion.div variants={fadeUp} className="flex flex-col items-center mb-10">
            <div className="w-12 h-12 rounded-lg bg-cyan-400/90 shadow-lg flex items-center justify-center mb-5 text-[#0F1419]">
              <TreeStructure size={22} weight="bold" />
            </div>
            <h1 className="font-display text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              Create Account
            </h1>
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-2.5 text-center font-body">
              Start shipping faster with AI-powered onboarding
            </p>
          </motion.div>

          {displayError && (
            <motion.div variants={fadeUp} className="bg-abort/10 text-abort rounded-lg px-4 py-3 mb-6 text-sm border border-abort/20 font-medium" role="alert">
              {displayError}
            </motion.div>
          )}

          {/* Auth Card */}
          <motion.div variants={fadeUp} className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

            {/* Social Sign-Up Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
              <a
                href={getGoogleLoginUrl()}
                aria-label="Sign up with Google"
                className="flex items-center justify-center gap-2 bg-panel-raised border border-seam/50 rounded-lg py-3 text-[13px] font-semibold text-[hsl(var(--foreground))] hover:border-go/30 hover:shadow-lg active:scale-[0.98] transition-all backdrop-blur-sm"
              >
                <span className="w-5 h-5 rounded-md bg-base border border-seam flex items-center justify-center font-code font-bold text-[10px] text-[hsl(var(--foreground))]">G</span>
                Google
              </a>
              <a
                href={getGithubLoginUrl()}
                aria-label="Sign up with GitHub"
                className="flex items-center justify-center gap-2 bg-[hsl(var(--foreground))]/5 border border-[hsl(var(--foreground))]/20 rounded-lg py-3 text-[13px] font-semibold text-[hsl(var(--foreground))] hover:border-go/30 hover:shadow-lg active:scale-[0.98] transition-all backdrop-blur-sm"
              >
                <span className="w-5 h-5 rounded-md bg-base flex items-center justify-center font-code font-bold text-[10px] text-[hsl(var(--foreground))]">GH</span>
                GitHub
              </a>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="flex-1 h-px bg-seam/50" />
              <span className="text-[11px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider font-semibold">or email</span>
              <div className="flex-1 h-px bg-seam/50" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                  <input
                    ref={nameRef}
                    id="name"
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="w-full bg-base border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">Email</label>
                <div className="relative">
                  <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                  <input
                    id="email"
                    type="email"
                    placeholder="developer@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full bg-base border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                  <input
                    id="password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={6}
                    className="w-full bg-base border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">Confirm Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                  <input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full bg-base border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !name || !email || !password || !confirmPassword}
                className={cn(
                  'w-full mt-6 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isSubmitting ? 'Creating account...' : 'Create Account'}
                {!isSubmitting && <ArrowRight size={18} weight="bold" />}
              </button>
            </form>
          </motion.div>

          {/* Footer */}
          <motion.div variants={fadeUp} className="mt-8 text-center">
            <p className="text-[13px] text-[hsl(var(--muted-foreground))] font-body">
              Already have an account?{' '}
              <Link to="/login" className="text-go font-semibold hover:text-go-lit transition-colors">
                Sign in
              </Link>
            </p>
          </motion.div>
        </motion.main>
      </div>
      </div>
    </PageTransition>
  )
}
