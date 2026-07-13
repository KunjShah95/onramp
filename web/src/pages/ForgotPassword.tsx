import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { EnvelopeSimple, ArrowRight, Mailbox } from '@phosphor-icons/react'

type PageState = 'idle' | 'sending' | 'sent' | 'error'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [pageState, setPageState] = useState<PageState>('idle')
  const [error, setError] = useState('')

  const { resetPassword, clearError } = useAuth()
  const toast = useToast()

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pageState === 'sending' || !email.trim()) return

    setPageState('sending')
    setError('')
    try {
      await resetPassword(email.trim())
      toast.success('Reset link sent', `Check your inbox for ${email.trim()}`)
      setPageState('sent')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email'
      setError(msg)
      setPageState('error')
      toast.error('Failed to send reset email', msg)
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
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 text-center font-body">Reset your password</p>
          </motion.div>

          {pageState === 'sent' ? (
            <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />
              <Mailbox size={40} className="text-[hsl(var(--accent))] mx-auto mb-3" weight="fill" />
              <h2 className="font-display text-xl text-[hsl(var(--foreground))] mb-2">Check your email</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6 font-body">
                If an account exists for <strong className="text-[hsl(var(--foreground))]">{email}</strong>,
                we've sent a password reset link.
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]/60 mb-4 font-body">
                Didn't receive it? Check your spam folder or{' '}
                <button
                  onClick={() => { setPageState('idle'); setError('') }}
                  className="text-[hsl(var(--accent))] hover:opacity-80 transition-colors underline font-medium"
                >
                  try again
                </button>
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 px-5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all font-body"
              >
                Back to Sign In
              </Link>
            </motion.div>
          ) : (
            <>
              {error && (
                <motion.div variants={fadeUp} className="bg-red-50 text-red-600 rounded-lg px-4 py-3 mb-5 text-sm border border-red-200">
                  {error}
                </motion.div>
              )}

              <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

                <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5 font-body">
                  Enter your email address and we'll send you a link to reset your password.
                </p>

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
                        onChange={(e) => { setEmail(e.target.value); setError('') }}
                        required
                        autoComplete="email"
                        autoFocus
                        className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={pageState === 'sending' || !email.trim()}
                    className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed font-body"
                  >
                    {pageState === 'sending' ? 'Sending...' : 'Send Reset Link'}
                    <ArrowRight size={16} weight="bold" />
                  </button>
                </form>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-6 text-center">
                <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body">
                  Remember your password?{' '}
                  <Link to="/login" className="text-[hsl(var(--accent))] font-medium hover:opacity-80 transition-colors font-body">
                    Sign In
                  </Link>
                </p>
              </motion.div>
            </>
          )}
        </motion.main>
      </div>
    </PageTransition>
  )
}
