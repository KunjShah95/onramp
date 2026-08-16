import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'
import { EnvelopeSimple, ArrowRight, Mailbox, TreeStructure } from '@phosphor-icons/react'

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
      <div data-theme="landing" className="landing-premium landing-light min-h-screen bg-room text-ink antialiased">
      <Seo title="Reset Password — Onramp" description="Reset your Onramp password with a secure email link." path="/forgot-password" noindex />
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-body">
        {/* Premium background accents */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-go/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-go/3 rounded-full blur-3xl pointer-events-none" />

        <motion.main
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
              Reset Password
            </h1>
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-2.5 text-center font-body">
              Enter your email and we'll send you a link to reset your password
            </p>
          </motion.div>

          {pageState === 'sent' ? (
            <motion.div variants={fadeUp} className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl text-center relative overflow-hidden backdrop-blur-sm">
              {/* Glow effect */}
              <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

              <div className="w-14 h-14 rounded-lg bg-go/10 border border-go/20 flex items-center justify-center mx-auto mb-4 relative z-10">
                <Mailbox size={28} className="text-go" weight="fill" />
              </div>
              <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-2 relative z-10">Check your email</h2>
              <p className="text-[14px] text-[hsl(var(--muted-foreground))] mb-5 relative z-10 font-body">
                If an account exists for <strong className="text-[hsl(var(--foreground))]">{email}</strong>,
                we've sent a password reset link.
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]/70 mb-6 relative z-10 font-body">
                Didn't receive it? Check your spam folder or{' '}
                <button
                  onClick={() => { setPageState('idle'); setError('') }}
                  className="text-go hover:underline font-medium"
                >
                  try again
                </button>
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3 px-8 rounded-lg transition-all active:scale-[0.98] font-body relative z-10"
              >
                Back to Sign In <ArrowRight size={16} weight="bold" />
              </Link>
            </motion.div>
          ) : (
            <>
              {error && (
                <motion.div variants={fadeUp} className="bg-abort/10 text-abort rounded-lg px-4 py-3 mb-6 text-[13px] border border-abort/20 font-medium" role="alert">
                  {error}
                </motion.div>
              )}

              <motion.div variants={fadeUp} className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
                {/* Glow effect */}
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

                <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">Email Address</label>
                    <div className="relative">
                      <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                      <input
                        id="email"
                        type="email"
                        placeholder="developer@company.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError('') }}
                        required
                        autoComplete="email"
                        autoFocus
                        className="w-full bg-base/50 border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={pageState === 'sending' || !email.trim()}
                    className="w-full mt-6 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pageState === 'sending' ? 'Sending...' : 'Send Reset Link'}
                    {pageState !== 'sending' && <ArrowRight size={18} weight="bold" />}
                  </button>
                </form>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 text-center">
                <p className="text-[13px] text-[hsl(var(--muted-foreground))] font-body">
                  Remember your password?{' '}
                  <Link to="/login" className="text-go font-semibold hover:text-go-lit transition-colors">
                    Sign In
                  </Link>
                </p>
              </motion.div>
            </>
          )}
        </motion.main>
      </div>
      </div>
    </PageTransition>
  )
}
