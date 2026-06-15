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
    <div className="animate-in min-h-screen flex items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-sm z-10 relative">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-white drop-shadow-lg">CodeFlow</h1>
          <p className="text-green-100/70 text-sm mt-2">Reset your password</p>
        </div>

        {pageState === 'sent' ? (
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] text-center">
            <div className="text-3xl mb-3">📬</div>
            <h2 className="font-display text-base font-semibold text-white mb-2">Check your email</h2>
            <p className="text-sm text-green-100/70 mb-6">
              If an account exists for <strong className="text-white">{email}</strong>,
              we've sent a password reset link.
            </p>
            <p className="text-xs text-white/50 mb-4">
              Didn't receive it? Check your spam folder or{' '}
              <button
                onClick={() => { setPageState('idle'); setError('') }}
                className="text-green-400 hover:text-green-300 transition-colors underline"
              >
                try again
              </button>
            </p>
            <Link to="/login" className="btn inline-block">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-500/20 text-red-200 rounded-2xl p-4 mb-6 text-sm border border-red-500/30 backdrop-blur-md">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <p className="text-sm text-green-100/70 mb-5">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="text-xs text-text-muted mb-1 block">Email</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    required
                    autoComplete="email"
                    autoFocus
                    className="input bg-white/5 border-white/10 text-white placeholder-white/50 focus:border-green-400 focus:ring-green-400/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pageState === 'sending' || !email.trim()}
                  className="btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pageState === 'sending' ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>

            <p className="text-center mt-6 text-sm text-green-100/70">
              Remember your password?{' '}
              <Link to="/login" className="text-green-400 hover:text-green-300 transition-colors">
                Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
