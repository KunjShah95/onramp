import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import { Lock, ArrowRight, CheckCircle, TreeStructure } from '@phosphor-icons/react'
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
      <div data-theme="landing" className="landing-premium min-h-screen bg-room text-ink antialiased">
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-body">
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
              Reset Password
            </h1>
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-2.5 text-center font-body">
              {pageState === 'success' ? 'Password reset successful' : 'Set a new password'}
            </p>
          </motion.div>

          {pageState === 'success' ? (
            <motion.div variants={fadeUp} className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl text-center relative overflow-hidden backdrop-blur-sm">
              {/* Glow effect */}
              <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

              <div className="w-14 h-14 rounded-lg bg-go/10 border border-go/20 flex items-center justify-center mx-auto mb-4 relative z-10">
                <CheckCircle size={28} className="text-go" weight="fill" />
              </div>
              <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-2 relative z-10">Password updated</h2>
              <p className="text-[14px] text-[hsl(var(--muted-foreground))] mb-6 relative z-10 font-body">
                Your password has been reset successfully. Redirecting to sign in...
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3 px-8 rounded-lg transition-all active:scale-[0.98] font-body relative z-10"
              >
                Sign In <ArrowRight size={16} weight="bold" />
              </Link>
            </motion.div>
          ) : (
            <>
              {errorMsg && pageState === 'error' && (
                <motion.div variants={fadeUp} className="bg-abort/10 text-abort rounded-lg px-4 py-3 mb-6 text-[13px] border border-abort/20 font-medium" role="alert">
                  {errorMsg}
                </motion.div>
              )}

              <motion.div variants={fadeUp} className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl relative overflow-hidden backdrop-blur-sm">
                {/* Glow effect */}
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

                {!token ? (
                  <div className="text-center py-4 relative z-10">
                    <p className="text-[14px] text-[hsl(var(--muted-foreground))] mb-4 font-body">
                      This reset link is invalid or has expired.
                    </p>
                    <Link
                      to="/forgot-password"
                      className="text-go font-semibold hover:text-go-lit transition-colors text-sm"
                    >
                      Request a new reset link
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-[12px] text-[hsl(var(--muted-foreground))] font-semibold uppercase tracking-wide">New Password</label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]/50" />
                        <input
                          id="password"
                          type="password"
                          placeholder="Min. 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoFocus
                          className="w-full bg-base/50 border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
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
                          placeholder="Repeat your password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={6}
                          className="w-full bg-base/50 border border-seam/50 rounded-lg pl-9 pr-3.5 py-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 focus:outline-none focus:border-go/30 focus:ring-1 focus:ring-go/20 transition-all font-body"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={pageState === 'submitting' || !password || !confirmPassword}
                      className="w-full mt-6 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pageState === 'submitting' ? 'Resetting...' : 'Reset Password'}
                      {pageState !== 'submitting' && <ArrowRight size={18} weight="bold" />}
                    </button>
                  </form>
                )}
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
