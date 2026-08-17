import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { ArrowRight, EnvelopeSimple, Mailbox } from '@phosphor-icons/react'
import InputField from '../components/ui/first-principles/InputField'

type PageState = 'idle' | 'sending' | 'sent' | 'error'

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
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Reset Password — Onramp" description="Reset your Onramp password with a secure email link." path="/forgot-password" noindex />
        <AuthShell
          rail="Access"
          designator={pageState === 'sent' ? 'LINK SENT' : 'PASSWORD RESET'}
          status={pageState === 'sent' ? 'go' : 'standby'}
          title="Reset Password"
          subtitle={pageState === 'sent' ? undefined : "Enter your email and we'll send you a link to reset your password"}
          footer={
            <>
              <span>Remember your password?</span>
              <Link to="/login" className="text-go font-semibold hover:text-go-lit transition-colors ml-2">
                Sign in
              </Link>
            </>
          }
        >
          {pageState === 'sent' ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-card bg-go/10 border border-go/20 flex items-center justify-center mx-auto mb-4">
                <Mailbox size={24} className="text-go" weight="fill" />
              </div>
              <h2 className="font-display text-heading font-bold text-ink mb-2">Check your email</h2>
              <p className="text-body-sm text-ink-secondary mb-4">
                If an account exists for <strong className="text-ink font-code">{email}</strong>,
                we've sent a password reset link.
              </p>
              <p className="text-caption text-ink-tertiary mb-6">
                Didn't receive it? Check your spam folder or{' '}
                <button
                  onClick={() => { setPageState('idle'); setError('') }}
                  className="text-go hover:underline font-medium"
                >
                  try again
                </button>
              </p>
              <Link to="/login" className="btn btn-primary">
                Back to Sign In <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-abort/10 text-abort rounded-card px-4 py-3 mb-6 text-body-sm border border-abort/20 font-medium" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <InputField
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="developer@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  required
                  autoComplete="email"
                  autoFocus
                  icon={<EnvelopeSimple size={15} weight="bold" />}
                />

                <button
                  type="submit"
                  disabled={pageState === 'sending' || !email.trim()}
                  className="btn btn-primary w-full mt-2"
                >
                  {pageState === 'sending' ? 'Sending...' : 'Send Reset Link'}
                  {pageState !== 'sending' && <ArrowRight size={16} weight="bold" />}
                </button>
              </form>
            </>
          )}
        </AuthShell>
      </div>
    </PageTransition>
  )
}
