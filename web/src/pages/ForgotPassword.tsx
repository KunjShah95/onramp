import { Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { ArrowRight, EnvelopeSimple, Mailbox, ArrowClockwise } from '@phosphor-icons/react'
import { resendForgotPassword } from '../lib/api'
import InputField from '../components/ui/first-principles/InputField'

type PageState = 'idle' | 'sending' | 'sent' | 'error'

const RESEND_COOLDOWN_SECONDS = 60
const TOKEN_EXPIRY_MINUTES = 60

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [pageState, setPageState] = useState<PageState>('idle')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { resetPassword, clearError } = useAuth()
  const toast = useToast()

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pageState === 'sending' || !email.trim()) return

    setPageState('sending')
    setError('')
    try {
      await resetPassword(email.trim())
      toast.success('Reset link sent', `Check your inbox for ${email.trim()}`)
      setPageState('sent')
      startCooldown()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email'
      setError(msg)
      setPageState('error')
      toast.error('Failed to send reset email', msg)
    }
  }

  const handleResend = async () => {
    if (resending || cooldown > 0 || !email.trim()) return
    setResending(true)
    try {
      await resendForgotPassword(email.trim())
      toast.success('Reset link resent', `Check your inbox for ${email.trim()}`)
      startCooldown()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend'
      if (err instanceof Error && msg.includes('429')) {
        toast.error('Too many requests', 'Please wait before trying again.')
        startCooldown()
      } else {
        toast.error('Could not resend', msg)
      }
    } finally {
      setResending(false)
    }
  }

  const formatCooldown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Reset Password · Onramp" description="Reset your Onramp password with a secure email link." path="/forgot-password" noindex />
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
              <p className="text-caption text-ink-tertiary mb-4">
                The link expires in <strong className="text-ink font-code">{TOKEN_EXPIRY_MINUTES} minutes</strong>.
              </p>

              {/* Resend button with cooldown */}
              <div className="mb-6">
                <button
                  onClick={handleResend}
                  disabled={resending || cooldown > 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-tile text-caption font-medium transition-all border border-seam bg-well text-ink-secondary hover:text-ink hover:border-seam-strong disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ArrowClockwise size={14} weight="bold" className={resending ? 'animate-spin' : ''} />
                  {resending
                    ? 'Sending...'
                    : cooldown > 0
                      ? `Resend in ${formatCooldown(cooldown)}`
                      : 'Resend email'
                  }
                </button>
              </div>

              <p className="text-caption text-ink-tertiary mb-6">
                Didn't receive it? Check your spam folder, or{' '}
                <button
                  onClick={() => { setPageState('idle'); setError(''); setCooldown(0) }}
                  className="text-go hover:underline font-medium"
                >
                  try a different email
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
