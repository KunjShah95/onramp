import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const { register, error, clearError, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    return () => clearError()
  }, [clearError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters')
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await register(email, password, name)
      navigate('/dashboard', { replace: true })
    } catch {
      // error is set in context
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayError = localError || error

  return (
    <div className="animate-in min-h-screen flex items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-sm z-10 relative">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-white drop-shadow-lg">CodeFlow</h1>
          <p className="text-green-100/70 text-sm mt-2">Create your account</p>
        </div>

        {displayError && (
          <div className="bg-red-500/20 text-red-200 rounded-2xl p-4 mb-6 text-sm border border-red-500/30 backdrop-blur-md">
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="text-xs text-text-muted mb-1 block">Name</label>
              <input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="input bg-white/5 border-white/10 text-white placeholder-white/50 focus:border-green-400 focus:ring-green-400/30"
              />
            </div>
            <div>
              <label htmlFor="email" className="text-xs text-text-muted mb-1 block">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                placeholder="Create a password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                className="input bg-white/5 border-white/10 text-white placeholder-white/50 focus:border-green-400 focus:ring-green-400/30"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="text-xs text-text-muted mb-1 block">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="input bg-white/5 border-white/10 text-white placeholder-white/50 focus:border-green-400 focus:ring-green-400/30"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !name || !email || !password || !confirmPassword}
              className="btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>

        <p className="text-center mt-6 text-sm text-green-100/70">
          Already have an account?{' '}
          <Link to="/login" className="text-green-400 hover:text-green-300 transition-colors">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
