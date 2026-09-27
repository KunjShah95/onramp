import { Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'
import AuthShell from '../components/ui/auth-shell'
import Seo from '../components/seo/Seo'
import { ArrowRight, EnvelopeSimple, Mailbox, ArrowClockwise, GoogleLogo, GithubLogo, WarningCircle } from '@phosphor-icons/react'
import { resendForgotPassword, checkProvider, getGoogleLoginUrl, getGithubLoginUrl } from '../lib/api'
import InputField from '../components/ui/first-principles/InputField'

type PageState = 'idle' | 'sending' | 'sent' | 'oauth' | 'failed' | 'error'

const RESEND_COOLDOWN_SECONDS = 60
const TOKEN_EXPIRY_MINUTES = 60

/**
 * Accounts that never receive a reset email.
 *
 * The backend refuses to email a reset link to any account whose provider is
 * not "password" (see forgot_password in api/v1/auth.py) and answers with the
 * same generic 200 it gives unknown addresses. So a Google or GitHub user used
 * to land on "check your email" and wait forever for a message that was never
 * sent, with no way to discover they should just use the provider they signed
 * up with.
 *
 * /auth/check-provider is built for exactly this: it returns registered=false
 * for both unknown emails AND password accounts, and only surfaces a provider
 * for OAuth accounts. Asking it therefore leaks nothing that the forgot-password
 * response does not already leak, and the endpoint is a public path.
 */
const OAUTH_PROVIDERS: Record<string, { label: string; url: string }> = {
  google: { label: 'Google', url: getGoogleLoginUrl() },
  github: { label: 'GitHub', url: getGithubLoginUrl() },
}

/** Resolve a provider slug to a label + sign-in URL, with a safe fallback. */
function resolveProvider(slug: string): { label: string; url: string } {
  const known = OAUTH_PROVIDERS[slug.toLowerCase()]
  if (known) return known
  // Unknown provider: do not guess a URL we cannot verify. Send them to sign in.
  return { label: slug, url: '/login' }
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [pageState, setPageState] = useState<PageState>('idle')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const [oauthProvider, setOauthProvider] = useState<string | null>(null)
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

  const resetToIdle = () => {
    setPageState('idle')
    setError('')
    setCooldown(0)
    setOauthProvider(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pageState === 'sending' || !email.trim()) return

    setPageState('sending')
    setError('')
    try {
      // Ask whether this address can receive a reset link at all. If it is an
      // OAuth account, no email is ever coming, so route to the provider
      // instead of showing a success screen that cannot be true.
      //
      // A failed lookup must never block a legitimate password reset, so any
      // error here falls through to the normal flow.
      try {
        const check = await checkProvider(email.trim())
        if (check.registered && check.provider && check.provider !== 'password') {
          setOauthProvider(check.provider)
          setPageState('oauth')
          return
        }
      } catch {
        // Provider lookup unavailable — proceed as if it were a password account.
      }

      // The backend only sets `delivery: 'failed'` when a real account exists
      // but the mail provider refused or errored. Showing a success screen in
      // that case is a promise we know we cannot keep, so say what happened
      // and give the user somewhere to go.
      const resp = await resetPassword(email.trim())
      if (resp.delivery === 'failed') {
        setPageState('failed')
        return
      }
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
      const resp = await resendForgotPassword(email.trim())
      if (resp.delivery === 'failed') {
        // Still failing after a retry — stay on the failure screen rather than
        // claiming a resend that did not happen.
        setPageState('failed')
        return
      }
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

  const oauth = oauthProvider ? resolveProvider(oauthProvider) : null

  return (
    <PageTransition>
      <div className="min-h-screen bg-room text-ink antialiased">
        <Seo title="Reset Password · Onramp" description="Reset your Onramp password with a secure email link." path="/forgot-password" noindex />
        <AuthShell
          rail="Access"
          designator={
            pageState === 'sent' ? 'LINK SENT'
              : pageState === 'oauth' ? 'OAUTH ACCOUNT'
              : pageState === 'failed' ? 'SEND FAILED'
              : 'PASSWORD RESET'
          }
          status={
            pageState === 'sent' ? 'go'
              : pageState === 'failed' ? 'abort'
              : 'standby'
          }
          title="Reset Password"
          subtitle={
            pageState === 'sent' || pageState === 'oauth' || pageState === 'failed'
              ? undefined
              : "Enter your email and we'll send you a link to reset your password"
          }
          footer={
            <>
              <span>Remember your password?</span>
              <Link to="/login" className="text-go font-semibold hover:text-go-lit transition-colors ml-2">
                Sign in
              </Link>
            </>
          }
        >
          {pageState === 'failed' ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-card bg-abort/10 border border-abort/20 flex items-center justify-center mx-auto mb-4">
                <WarningCircle size={24} className="text-abort" weight="fill" />
              </div>
              <h2 className="font-display text-heading font-bold text-ink mb-2">
                We couldn&apos;t send that email
              </h2>
              <p className="text-body-sm text-ink-secondary mb-4">
                Your account is fine — our mail provider didn&apos;t accept the message, so
                nothing was sent to <strong className="text-ink font-code">{email}</strong>.
                This one is on us.
              </p>

              <button
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="btn btn-primary w-full"
              >
                <ArrowClockwise size={16} weight="bold" className={resending ? 'animate-spin' : ''} />
                {resending
                  ? 'Retrying...'
                  : cooldown > 0
                    ? `Try again in ${formatCooldown(cooldown)}`
                    : 'Try sending again'}
              </button>

              <div className="mt-6 border-t border-seam pt-5">
                <p className="text-caption text-ink-tertiary mb-3">
                  Still nothing? Email support and we&apos;ll reset it by hand.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <a href="mailto:support@onramp.ai" className="btn btn-secondary">
                    Email support
                  </a>
                  <Link to="/contact" className="btn btn-ghost">
                    Contact form
                  </Link>
                </div>
              </div>

              <p className="text-caption text-ink-tertiary mt-6">
                Wrong address?{' '}
                <button onClick={resetToIdle} className="text-go hover:underline font-medium">
                  use a different email
                </button>
              </p>
            </div>
          ) : pageState === 'oauth' && oauth ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-card bg-well border border-seam flex items-center justify-center mx-auto mb-4">
                {oauth.label.toLowerCase() === 'github' ? (
                  <GithubLogo size={24} className="text-ink" weight="fill" />
                ) : (
                  <GoogleLogo size={24} className="text-ink" weight="fill" />
                )}
              </div>
              <h2 className="font-display text-heading font-bold text-ink mb-2">
                This account uses {oauth.label}
              </h2>
              <p className="text-body-sm text-ink-secondary mb-4">
                You signed up with {oauth.label}, so there is no password to reset and no reset
                email to send. Sign in the same way you registered.
              </p>

              <a
                href={oauth.url}
                className="btn btn-primary w-full"
                aria-label={`Continue with ${oauth.label}`}
              >
                Continue with {oauth.label}
                <ArrowRight size={16} weight="bold" />
              </a>

              <p className="text-caption text-ink-tertiary mt-6 mb-2">
                Wrong account, or you set a password later?{' '}
                <button onClick={resetToIdle} className="text-go hover:underline font-medium">
                  use a different email
                </button>
              </p>
            </div>
          ) : pageState === 'sent' ? (
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
                  onClick={resetToIdle}
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
                  {pageState === 'sending' ? 'Checking...' : 'Send Reset Link'}
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
