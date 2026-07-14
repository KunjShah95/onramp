import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { setToken } from '../lib/neon-auth'
import { ArrowRight } from '@phosphor-icons/react'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setErrorMsg(decodeURIComponent(error))
      return
    }

    if (!token) {
      setStatus('error')
      setErrorMsg('No authentication token received from the provider.')
      return
    }

    // Store the JWT and redirect to dashboard
    try {
      setToken(token)
      setStatus('success')
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 500)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Failed to process authentication. Please try again.')
    }
  }, [searchParams, navigate])

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  }

  return (
    <div className="bg-[hsl(var(--background))] min-h-screen flex items-center justify-center p-4 relative overflow-hidden font-body">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[hsl(var(--accent))]/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.main
        initial="hidden"
        animate="visible"
        className="w-full max-w-[400px] z-10 text-center"
      >
        <motion.div variants={fadeUp} className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[hsl(var(--accent))]/10 flex items-center justify-center mb-4">
            <span className="text-xl font-display font-bold text-[hsl(var(--accent))]">✦</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[hsl(var(--foreground))] tracking-tight">
            Nexora
          </h1>
        </motion.div>

        <motion.div variants={fadeUp} className="bg-white border border-[hsl(var(--border))] rounded-2xl p-7 shadow-dashboard relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent))]/40 to-transparent" />

          {status === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-full border-2 border-[hsl(var(--accent))] border-t-transparent animate-spin" />
              <p className="text-sm text-[hsl(var(--muted-foreground))] font-body">
                Completing sign in...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))] font-body">
                Signed in successfully!
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body flex items-center gap-1">
                Redirecting to dashboard <ArrowRight size={12} className="inline animate-pulse" />
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-600 font-medium font-body">
                Sign in failed
              </p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]/60 font-body mb-2">
                {errorMsg}
              </p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-sm py-2.5 px-5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all font-body"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </motion.div>
      </motion.main>
    </div>
  )
}
