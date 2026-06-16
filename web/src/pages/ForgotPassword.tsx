import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

type PageState = 'idle' | 'sending' | 'sent' | 'error'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [pageState, setPageState] = useState<PageState>('idle')
  const [error, setError] = useState('')

  const { resetPassword, clearError } = useAuth()

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
      setPageState('sent')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email'
      setError(msg)
      setPageState('error')
    }
  }

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-4 relative overflow-hidden text-on-surface">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-dot-grid opacity-50 z-0 pointer-events-none" />
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-container/5 rounded-full blur-[100px] pointer-events-none z-0" />

      <main className="w-full max-w-[420px] z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-12 h-12 bg-surface-container border border-outline-variant/30 rounded-xl mb-4 shadow-[0_0_15px_rgba(255,140,0,0.1)]">
            <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
          </div>
          <h1 className="font-display-lg text-headline-md text-primary tracking-tight">CodeFlow 2.0</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2 text-center">Reset your password</p>
        </div>

        {pageState === 'sent' ? (
          <div className="bg-surface/80 backdrop-blur-xl border border-outline-variant/30 rounded-xl p-8 shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary-container/50 to-transparent" />
            <span className="material-symbols-outlined text-primary-container text-4xl mb-3">mark_email_read</span>
            <h2 className="font-display-lg text-headline-md text-on-background mb-2">Check your email</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6">
              If an account exists for <strong className="text-on-background">{email}</strong>,
              we've sent a password reset link.
            </p>
            <p className="font-label-caps text-[11px] text-on-surface-variant mb-4">
              Didn't receive it? Check your spam folder or{' '}
              <button
                onClick={() => { setPageState('idle'); setError('') }}
                className="text-primary-container hover:text-primary transition-colors underline"
              >
                try again
              </button>
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 bg-primary-container text-on-primary-container font-label-caps text-label-caps py-3 px-6 rounded-lg hover:bg-primary-container/90 active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(255,140,0,0.15)]"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-500/10 text-red-300 rounded-lg p-4 mb-6 text-sm border border-red-500/30 backdrop-blur-md">
                {error}
              </div>
            )}

            <div className="bg-surface/80 backdrop-blur-xl border border-outline-variant/30 rounded-xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary-container/50 to-transparent" />

              <p className="font-body-md text-body-md text-on-surface-variant mb-5">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="group">
                  <label htmlFor="email" className="block font-label-caps text-label-caps text-on-surface-variant mb-1 group-focus-within:text-primary-container transition-colors">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-outline group-focus-within:text-primary-container transition-colors text-[18px]">mail</span>
                    </div>
                    <input
                      id="email"
                      type="email"
                      placeholder="developer@company.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError('') }}
                      required
                      autoComplete="email"
                      autoFocus
                      className="w-full bg-surface-container border border-outline-variant/50 rounded-lg pl-10 pr-4 py-2.5 font-code-sm text-code-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container/30 transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={pageState === 'sending' || !email.trim()}
                    className="w-full bg-primary-container text-on-primary-container font-label-caps text-label-caps py-3 rounded-lg hover:bg-primary-container/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(255,140,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pageState === 'sending' ? 'Sending...' : 'Send Reset Link'}
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-8 text-center">
              <p className="font-body-md text-code-sm text-on-surface-variant">
                Remember your password?{' '}
                <Link to="/login" className="text-primary hover:text-primary-fixed underline decoration-primary/30 underline-offset-4 transition-colors">
                  Sign In
                </Link>
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
