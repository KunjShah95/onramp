import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { EnvelopeSimple, Lock, ArrowRight, GoogleLogo, GithubLogo } from '@phosphor-icons/react'

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

  const { login, loginWithGoogle, loginWithGithub, error, clearError, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, navigate, from])

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

  const handleGoogleSignIn = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await loginWithGoogle()
      toast.success('Signed in with Google')
      navigate(from, { replace: true })
    } catch {
      // Error displayed inline via AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGithubSignIn = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await loginWithGithub()
      toast.success('Signed in with GitHub')
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

            {/* Social Buttons */}
            <div className="flex flex-col gap-2.5 mb-5">
              <button
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2.5 w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm py-2.5 rounded-xl hover:bg-[hsl(var(--secondary))]/80 active:scale-[0.98] transition-all disabled:opacity-50 font-body"
              >
                <GoogleLogo size={18} weight="bold" />
                Continue with Google
              </button>
              <button
                onClick={handleGithubSignIn}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2.5 w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-sm py-2.5 rounded-xl hover:bg-[hsl(var(--secondary))]/80 active:scale-[0.98] transition-all disabled:opacity-50 font-body"
              >
                <GithubLogo size={18} weight="fill" />
                Continue with GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-[hsl(var(--border))]" />
              <span className="flex-shrink-0 mx-4 text-xs text-[hsl(var(--muted-foreground))]/50 font-medium font-body">OR WITH EMAIL</span>
              <div className="flex-grow border-t border-[hsl(var(--border))]" />
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
