import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { login, error, clearError, user } = useAuth()
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
      navigate(from, { replace: true })
    } catch {
      // error is set in context
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="animate-in min-h-screen flex items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-sm z-10 relative">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-white drop-shadow-lg">CodeFlow</h1>
          <p className="text-green-100/70 text-sm mt-2">Welcome back</p>
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-200 rounded-2xl p-4 mb-6 text-sm border border-red-500/30 backdrop-blur-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="text-xs text-text-muted mb-1 block">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError() }}
                required
                autoComplete="email"
                className="input bg-white/5 border-white/10 text-white placeholder-white/50 focus:border-green-400 focus:ring-green-400/30"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs text-text-muted mb-1 block">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError() }}
                required
                autoComplete="current-password"
                className="input bg-white/5 border-white/10 text-white placeholder-white/50 focus:border-green-400 focus:ring-green-400/30"
              />
            </div>
            <div className="flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-xs text-green-200/70 hover:text-green-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        <p className="text-center mt-6 text-sm text-green-100/70">
          No account?{' '}
          <Link to="/register" className="text-green-400 hover:text-green-300 transition-colors">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
