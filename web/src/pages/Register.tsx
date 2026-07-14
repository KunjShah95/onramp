import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { EnvelopeSimple, Lock, User, ArrowRight } from '@phosphor-icons/react'

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
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

  const { register, error, clearError, user, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => {
    // Wait for role sync before redirecting to dashboard
    if (user && !loading) navigate('/dashboard', { replace: true })
  }, [user, loading, navigate])

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
      navigate('/dashboard', { replace: true })
    } catch {
      // Error displayed inline via AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayError = localError || error

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
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 text-center font-body">Create your workspace</p>
          </motion.div>

          {displayError && (
            <motion.div variants={fadeUp} className="bg-red-50 text-red-600 rounded-lg px-4 py-3 mb-5 text-sm border border-red-200">
              {displayError}
            </motion.div>
          )}

          {/* Auth Card */}
          <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">Email Address</label>
                <div className="relative">
                  <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    id="email"
                    type="email"
                    placeholder="developer@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    id="password"
                    type="password"
                    placeholder="Create a password (min. 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={6}
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">Confirm Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                  <input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !name || !email || !password || !confirmPassword}
                className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed font-body"
              >
                {isSubmitting ? 'Creating account...' : 'Create Account'}
                <ArrowRight size={16} weight="bold" />
              </button>
            </form>
          </motion.div>

          {/* Footer */}
          <motion.div variants={fadeUp} className="mt-6 text-center">
            <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body">
              Already have an account?{' '}
              <Link to="/login" className="text-[hsl(var(--accent))] font-medium hover:opacity-80 transition-colors font-body">
                Sign In
              </Link>
            </p>
          </motion.div>
        </motion.main>
      </div>
    </PageTransition>
  )
}
