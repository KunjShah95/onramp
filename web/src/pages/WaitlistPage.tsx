import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ShaderBackground from '../components/ui/ShaderBackground'
import Spotlight from '../components/ui/spotlight'

const WAITLIST_URL = `${import.meta.env.VITE_WAITLIST_URL ?? 'http://localhost:3008'}/api/v1/waitlist`

type Role = 'developer' | 'manager' | 'cto'
type TeamSize = '1-10' | '11-50' | '51-200' | '200+'

interface FormData {
  name: string
  email: string
  role: Role | ''
  company: string
  team_size: TeamSize | ''
  use_case: string
}

const EMPTY_FORM: FormData = {
  name: '',
  email: '',
  role: '',
  company: '',
  team_size: '',
  use_case: '',
}

export default function WaitlistPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ position: number; message: string } | null>(null)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    fetch(`${WAITLIST_URL}/count`)
      .then(r => r.json())
      .then(d => setCount(d.count))
      .catch(() => {})
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.role || !form.team_size) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${WAITLIST_URL}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Something went wrong. Please try again.')
        return
      }
      setSuccess({ position: data.position, message: data.message })
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-[#0D0905] border border-[#FDFBF8]/10 rounded px-4 py-3 text-[#FDFBF8] text-sm placeholder:text-[#FDFBF8]/30 focus:outline-none focus:border-[#FF8C00]/50 transition-colors'

  return (
    <div className="text-[#FDFBF8] font-body bg-[#050505] antialiased selection:bg-[#FF8C00]/30 selection:text-[#FF8C00] relative min-h-screen overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#0A0705]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-full">
        <Link to="/" className="font-display text-xl font-bold tracking-tight">CodeFlow</Link>
      </nav>

      {/* Background */}
      <ShaderBackground />
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#FF8C00" />

      <div className="relative z-10 flex flex-col items-center justify-center pt-40 pb-20 px-6">
        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-6 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#1A110D] border border-[#FF8C00]/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
            <span className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider font-bold">Coming Soon</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.1] tracking-tight max-w-3xl">
            Be first to transform<br />
            <span className="text-[#FDFBF8]/55">how your team onboards.</span>
          </h1>
          <p className="font-body text-lg text-[#FDFBF8]/65 max-w-xl leading-relaxed">
            CodeFlow maps your codebase, builds guided learning paths, and gets new engineers shipping PRs on day 5 — not day 45.
          </p>
          {count !== null && (
            <p className="font-mono text-sm text-[#FF8C00]/80">
              {count} developer{count !== 1 ? 's' : ''} already waiting
            </p>
          )}
        </div>

        {/* Form / Success card */}
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#0D0905] border border-[#FF8C00]/20 rounded-xl p-10 flex flex-col items-center gap-4 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-16 h-16 rounded-full bg-[#FF8C00]/10 border border-[#FF8C00]/30 flex items-center justify-center text-3xl"
                >
                  🎉
                </motion.div>
                <h2 className="font-display text-2xl font-bold">{success.message}</h2>
                <p className="text-[#FDFBF8]/60 text-sm">Check your email for confirmation. We'll reach out when we launch.</p>
                <Link to="/" className="mt-2 text-[#FF8C00] text-sm hover:underline">← Back to home</Link>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="bg-[#0D0905] border border-[#FDFBF8]/10 rounded-xl p-8 flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Full name"
                    required
                    className={inputClass}
                  />
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Work email"
                    required
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    required
                    className={`${inputClass} ${!form.role ? 'text-[#FDFBF8]/30' : ''}`}
                  >
                    <option value="" disabled>Your role</option>
                    <option value="developer">Developer</option>
                    <option value="manager">Manager</option>
                    <option value="cto">CTO</option>
                  </select>
                  <input
                    name="company"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="Company"
                    required
                    className={inputClass}
                  />
                </div>

                <select
                  name="team_size"
                  value={form.team_size}
                  onChange={handleChange}
                  required
                  className={`${inputClass} ${!form.team_size ? 'text-[#FDFBF8]/30' : ''}`}
                >
                  <option value="" disabled>Team size</option>
                  <option value="1-10">1–10 people</option>
                  <option value="11-50">11–50 people</option>
                  <option value="51-200">51–200 people</option>
                  <option value="200+">200+ people</option>
                </select>

                <textarea
                  name="use_case"
                  value={form.use_case}
                  onChange={handleChange}
                  placeholder="What's your biggest onboarding challenge? (optional, max 500 chars)"
                  maxLength={500}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#FFB347] text-[#3D1C00] py-3.5 rounded font-body text-sm font-bold hover:bg-[#FF8C00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? 'Joining...' : 'Join Waitlist →'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
