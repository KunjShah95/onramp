import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageTransition from '../components/ui/page-transition'
import { CheckCircle, XCircle, CircleNotch, TreeStructure } from '@phosphor-icons/react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided. The link may be invalid.')
      return
    }

    const verify = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || data.message || 'Verification failed')
        }
        setStatus('success')
        setMessage('Email verified successfully! You can now log in.')
      } catch (err: unknown) {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed')
      }
    }

    verify()
  }, [token])

  return (
    <PageTransition>
      <div data-theme="landing" className="landing-premium min-h-screen bg-room text-ink antialiased">
      <div className="bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--background))] to-[hsl(var(--background))]/95 min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-body">
        {/* Premium background accents */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-go/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-go/3 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md z-10 relative"
        >
          {/* Brand Header */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-12 h-12 rounded-lg bg-cyan-400/90 shadow-lg flex items-center justify-center mb-5 text-[#0F1419]">
              <TreeStructure size={22} weight="bold" />
            </div>
            <h1 className="font-display text-3xl font-bold text-[hsl(var(--foreground))] tracking-tight">
              Verify Email
            </h1>
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-2.5 text-center font-body">
              {status === 'verifying' ? 'Confirming your address' : status === 'success' ? 'All set' : 'Something went wrong'}
            </p>
          </div>

          <div className="bg-gradient-to-br from-panel via-panel to-panel/80 border border-go/20 rounded-lg p-8 shadow-2xl text-center relative overflow-hidden backdrop-blur-sm">
            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-go/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              <div className="mx-auto mb-4 flex items-center justify-center">
                {status === 'verifying' && (
                  <div className="w-14 h-14 rounded-lg bg-mission/10 border border-mission/20 flex items-center justify-center">
                    <CircleNotch size={28} className="text-mission animate-spin" weight="bold" />
                  </div>
                )}
                {status === 'success' && (
                  <div className="w-14 h-14 rounded-lg bg-go/10 border border-go/20 flex items-center justify-center">
                    <CheckCircle size={28} className="text-go" weight="fill" />
                  </div>
                )}
                {status === 'error' && (
                  <div className="w-14 h-14 rounded-lg bg-abort/10 border border-abort/20 flex items-center justify-center">
                    <XCircle size={28} className="text-abort" weight="fill" />
                  </div>
                )}
              </div>

              <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-2">
                {status === 'verifying' ? 'Verifying...' : status === 'success' ? 'Verified!' : 'Verification Failed'}
              </h2>
              <p className="text-[14px] text-[hsl(var(--muted-foreground))] mb-6 font-body">{message}</p>

              {status !== 'verifying' && (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-go to-go-lit hover:shadow-lg text-white font-bold text-[15px] py-3 px-8 rounded-lg transition-all active:scale-[0.98] font-body"
                >
                  {status === 'success' ? 'Go to Login' : 'Back to Login'}
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      </div>
      </div>
    </PageTransition>
  )
}
