import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import PageTransition from '../components/ui/page-transition'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { login, loginWithGoogle, loginWithGithub, error, clearError, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true })
    }
  }, [user, navigate, from])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await login(email, password)
      toast.success('Signed in', 'Welcome back!')
      navigate(from, { replace: true })
    } catch {
      // Error is displayed inline via AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await loginWithGoogle()
      toast.success('Signed in with Google')
      navigate(from, { replace: true })
    } catch {
      // Error is displayed inline via AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGithubSignIn = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await loginWithGithub()
      toast.success('Signed in with GitHub')
      navigate(from, { replace: true })
    } catch {
      // Error is displayed inline via AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageTransition>
      <div className="bg-[#0A0705] min-h-screen flex items-center justify-center p-4 relative overflow-hidden text-[#FDFBF8] max-w-full overflow-x-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIyIiBjeT0iMiIgcj0iMSIgZmlsbD0iI0ZERkJGOCIvPjwvc3ZnPg==')] opacity-[0.03] z-0 pointer-events-none" />
        {/* Background Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#FF8C00]/5 rounded-full blur-[100px] pointer-events-none z-0" />

        <main className="w-full max-w-[420px] z-10">
          {/* Brand Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center w-12 h-12 bg-[#1A110D] border border-[#FDFBF8]/10 rounded-xl mb-4 shadow-[0_0_15px_rgba(255,140,0,0.1)]">
              <span className="material-symbols-outlined text-[#FF8C00]" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#FF8C00] tracking-tight">CodeFlow 2.0</h1>
            <p className="font-body text-sm text-[#FDFBF8]/50 mt-2 text-center">Log in to your workspace</p>
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/30 backdrop-blur-md">
              {error}
            </div>
          )}

          {/* Auth Card */}
          <div className="bg-[#120D0A]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-xl p-8 shadow-2xl relative overflow-hidden">
            {/* Top decorative hairline */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FF8C00]/50 to-transparent" />

            <div className="flex flex-col gap-3 mb-6">
              <button
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-3 w-full bg-[#1A110D] border border-[#FDFBF8]/15 text-[#FDFBF8] font-mono text-[10px] uppercase tracking-widest font-semibold py-3 rounded-lg hover:bg-[#2A1D16]/60 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
              <button
                onClick={handleGithubSignIn}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-3 w-full bg-[#1A110D] border border-[#FDFBF8]/15 text-[#FDFBF8] font-mono text-[10px] uppercase tracking-widest font-semibold py-3 rounded-lg hover:bg-[#2A1D16]/60 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <svg className="w-5 h-5 text-[#FDFBF8]/50 group-hover:text-[#FDFBF8] transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Continue with GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center py-5">
              <div className="flex-grow border-t border-[#FDFBF8]/10" />
              <span className="flex-shrink-0 mx-4 text-[#FDFBF8]/50 font-mono text-[10px] uppercase tracking-widest font-semibold">OR CONTINUE WITH EMAIL</span>
              <div className="flex-grow border-t border-[#FDFBF8]/10" />
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="group">
                <label htmlFor="email" className="block font-mono text-[10px] uppercase tracking-widest font-semibold text-[#FDFBF8]/50 mb-1 group-focus-within:text-[#FF8C00] transition-colors">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-[#FDFBF8]/30 group-focus-within:text-[#FF8C00] transition-colors text-[18px]">mail</span>
                  </div>
                  <input
                    id="email"
                    type="email"
                    placeholder="developer@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError() }}
                    required
                    autoComplete="email"
                    className="w-full bg-[#1A110D] border border-[#FDFBF8]/15 rounded-lg pl-10 pr-4 py-2.5 font-mono text-xs text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 focus:outline-none focus:border-[#FF8C00] focus:ring-1 focus:ring-[#FF8C00]/30 transition-all"
                  />
                </div>
              </div>

              <div className="group">
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="password" className="block font-mono text-[10px] uppercase tracking-widest font-semibold text-[#FDFBF8]/50 group-focus-within:text-[#FF8C00] transition-colors">Password</label>
                  <Link to="/forgot-password" className="font-mono text-[10px] uppercase tracking-widest font-semibold text-[#FF8C00] hover:text-[#FF8C00] transition-colors">Forgot?</Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-[#FDFBF8]/30 group-focus-within:text-[#FF8C00] transition-colors text-[18px]">lock</span>
                  </div>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError() }}
                    required
                    autoComplete="current-password"
                    className="w-full bg-[#1A110D] border border-[#FDFBF8]/15 rounded-lg pl-10 pr-4 py-2.5 font-mono text-xs text-[#FDFBF8] placeholder:text-[#FDFBF8]/30 focus:outline-none focus:border-[#FF8C00] focus:ring-1 focus:ring-[#FF8C00]/30 transition-all"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !email || !password}
                  className="w-full bg-[#FF8C00] text-[#3D1C00] font-mono text-[10px] uppercase tracking-widest font-semibold py-3 rounded-lg hover:bg-[#FF8C00]/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(255,140,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Signing in...' : 'Sign In'}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </form>
          </div>

          {/* Footer Links */}
          <div className="mt-8 text-center">
            <p className="font-body text-xs text-[#FDFBF8]/50">
              Don't have an account?{' '}
              <Link to="/register" className="text-[#FF8C00] hover:brightness-110 underline decoration-[#FF8C00]/30 underline-offset-4 transition-colors">
                Register
              </Link>
            </p>
          </div>
        </main>
      </div>
    </PageTransition>
  )
}
