import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { Lock, ArrowRight, CheckCircle } from '@phosphor-icons/react'
import { resetPassword as apiResetPassword } from '../lib/api'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

type PageState = 'idle' | 'submitting' | 'success' | 'error'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pageState, setPageState] = useState<PageState>(token ? 'idle' : 'error')
  const [errorMsg, setErrorMsg] = useState(token ? '' : 'Invalid or missing reset token.')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pageState === 'submitting') return

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match')
      setPageState('error')
      return
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters')
      setPageState('error')
      return
    }

    setPageState('submitting')
    setErrorMsg('')

    try {
      await apiResetPassword(token, password)
      toast.success('Password reset', 'Your password has been updated successfully!')
      setPageState('success')
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password'
      setErrorMsg(msg)
      setPageState('error')
      toast.error('Reset failed', msg)
    }
  }

  const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  }

  return (
    <PageTransition>
      <div className="bg-[hsl(var(--background))] min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-body">
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
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 text-center font-body">
              {pageState === 'success' ? 'Password reset successful' : 'Set a new password'}
            </p>
          </motion.div>

          {pageState === 'success' ? (
            <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />
              <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" weight="fill" />
              <h2 className="font-display text-xl text-[hsl(var(--foreground))] mb-2">Password updated</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-6 font-body">
                Your password has been reset successfully. Redirecting to sign in...
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 px-5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all font-body"
              >
                Sign In <ArrowRight size={16} weight="bold" />
              </Link>
            </motion.div>
          ) : (
            <>
              {errorMsg && pageState === 'error' && (
                <motion.div variants={fadeUp} className="bg-red-50 text-red-600 rounded-lg px-4 py-3 mb-5 text-sm border border-red-200">
                  {errorMsg}
                </motion.div>
              )}

              <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

                {!token ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4 font-body">
                      This reset link is invalid or has expired.
                    </p>
                    <Link
                      to="/forgot-password"
                      className="text-[hsl(var(--accent))] font-medium hover:opacity-80 transition-colors text-sm"
                    >
                      Request a new reset link
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-xs text-[hsl(var(--muted-foreground))]/70 font-medium font-body">New Password</label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/40" />
                        <input
                          id="password"
                          type="password"
                          placeholder="Min. 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoFocus
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
                          minLength={6}
                          className="w-full bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--accent))]/60 focus:ring-1 focus:ring-[hsl(var(--accent))]/20 transition-all font-body"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={pageState === 'submitting' || !password || !confirmPassword}
                      className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed font-body"
                    >
                      {pageState === 'submitting' ? 'Resetting...' : 'Reset Password'}
                      <ArrowRight size={16} weight="bold" />
                    </button>
                  </form>
                )}
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
