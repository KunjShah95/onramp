import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import Spotlight from '../components/ui/spotlight'
import AnimatedGrid from '../components/ui/animated-grid'
import CodeWindow from '../components/ui/code-window'
import BentoCard, { BentoIcon, BentoTag } from '../components/ui/bento-card'

// ─── Reusable animation variants ──────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: d },
  }),
}

const fadeIn = {
  hidden: { opacity: 0 },
  visible: (d = 0) => ({
    opacity: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: d },
  }),
}

// ─── Simple SVG icons ─────────────────────────────────────────────────────

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></>,
    clock: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></>,
    code: <><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></>,
    rocket: <><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></>,
    users: <><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></>,
    lock: <><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></>,
    book: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></>,
    arrow: <><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></>,
    star: <><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></>,
  }
  return (
    <svg className={cn('w-5 h-5 text-accent-from', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      {paths[name]}
    </svg>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────

function NavBar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        scrolled ? 'bg-slate-950/70 backdrop-blur-xl border-b border-white/[0.04]' : 'bg-transparent'
      )}
    >
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link to="/" className="font-display font-bold text-base text-white tracking-tight hover:text-accent-from transition-colors">
          CodeFlow
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/login" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Sign In</Link>
          <Link to="/register" className="text-sm font-medium px-4 py-2 rounded-lg bg-white text-slate-900 hover:bg-white/90 transition-all shadow-sm">
            Get Started
          </Link>
        </div>
      </div>
    </motion.nav>
  )
}

// ─── Mouse-tracking glow ─────────────────────────────────────────────────

function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect()
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.08] pointer-events-none transition-all duration-300"
        style={{
          background: 'radial-gradient(circle, #FF8C00 0%, transparent 70%)',
          transform: `translate(${pos.x - 200}px, ${pos.y - 200}px)`,
        }}
      />
    </div>
  )
}

// ─── Animated counter ─────────────────────────────────────────────────────

function CountUp({ end, suffix = '+', label }: { end: number; suffix?: string; label: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref!, { once: true, margin: '-100px' })
  const started = useRef(false)

  useEffect(() => {
    if (!inView || started.current) return
    started.current = true
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min((t - t0) / 2000, 1)
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * end))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView, end])

  return (
    <motion.div ref={ref} className="text-center" variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}>
      <span className="font-display text-4xl font-bold text-white tabular-nums">{count}{suffix}</span>
      <p className="text-xs text-slate-600 mt-1.5 tracking-wide uppercase">{label}</p>
    </motion.div>
  )
}

// ─── Logo cloud ───────────────────────────────────────────────────────────

const logos = ['Google', 'Microsoft', 'Stripe', 'Vercel', 'Netflix', 'Spotify', 'GitHub', 'Posthog']

function LogoCloud() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 opacity-40">
      {logos.map((name) => (
        <span key={name} className="text-xs font-semibold text-slate-500 tracking-wider uppercase">{name}</span>
      ))}
    </div>
  )
}

// ─── Testimonial card ─────────────────────────────────────────────────────

function Testimonial({ quote, author, role }: { quote: string; author: string; role: string }) {
  return (
    <motion.div
      className="bg-slate-900/40 backdrop-blur-sm border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.12] transition-colors"
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="flex gap-1 mb-3">
        {[...Array(5)].map((_, i) => (
          <Icon key={i} name="star" className="!w-3 !h-3 text-amber-400/60" />
        ))}
      </div>
      <p className="text-sm text-slate-400 leading-relaxed mb-4">&ldquo;{quote}&rdquo;</p>
      <div>
        <p className="text-sm font-medium text-white">{author}</p>
        <p className="text-xs text-slate-600">{role}</p>
      </div>
    </motion.div>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-5 py-10 flex items-center justify-between text-xs text-slate-600">
        <span>&copy; {new Date().getFullYear()} CodeFlow</span>
        <div className="flex gap-6">
          <span className="hover:text-slate-400 cursor-pointer transition-colors">Privacy</span>
          <span className="hover:text-slate-400 cursor-pointer transition-colors">Terms</span>
          <span className="hover:text-slate-400 cursor-pointer transition-colors">Docs</span>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true })
  }, [user, loading, navigate])

  if (loading || user) return null

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <AnimatedGrid cellSize={64} fade />
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-24" fill="#FF8C00" />
        <MouseGlow />

        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/0 via-slate-950/60 to-slate-950 pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-5 text-center pt-24 pb-32">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-from/10 border border-accent-from/20 text-[11px] font-medium text-accent-from tracking-wide mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-from animate-pulse" />
              AI Developer Onboarding
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp} initial="hidden" animate="visible" custom={0.1}
            className="font-display text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] mb-5 tracking-tight"
          >
            Onboard Devs{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-from via-accent-via to-[#FFD700]">
              In Days
            </span>
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={0.15}
            className="text-base sm:text-lg text-slate-500 max-w-lg mx-auto mb-10 leading-relaxed"
          >
            Analyze any repo, generate learning paths, get AI pair programming — so new hires ship code from day one.
          </motion.p>

          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.2}
            className="flex items-center justify-center gap-4 mb-20"
          >
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-slate-900 font-medium text-sm shadow-lg hover:shadow-xl hover:bg-white/90 transition-all duration-300"
            >
              Get Started Free
              <Icon name="arrow" />
            </Link>
            <Link
              to="/login"
              className="px-6 py-3 rounded-lg border border-white/[0.08] text-slate-400 text-sm font-medium hover:text-white hover:border-white/[0.15] transition-all"
            >
              Sign In
            </Link>
          </motion.div>

          {/* Hero demo card */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.3}
            className="max-w-xl mx-auto"
          >
            <CodeWindow language="bash">
              {`$ codeflow analyze https://github.com/facebook/react

 ✓ Cloning repository...
 ✓ Parsing 1,247 files across 38 languages
 ✓ Detected: Component-based architecture
 ✓ Found 3 circular dependencies
 ✓ Learning path generated (4.2h estimated)

 → Report ready at /reports/react-onboarding`}
            </CodeWindow>
          </motion.div>
        </div>
      </section>

      {/* ── Logo cloud ─────────────────────────────────────────────── */}
      <motion.section variants={fadeIn} initial="hidden" whileInView="visible" viewport={{ once: true }}
        className="max-6xl mx-auto px-5 pb-20"
      >
        <p className="text-center text-[10px] text-slate-700 uppercase tracking-[0.2em] mb-6">Trusted by engineering teams at</p>
        <LogoCloud />
      </motion.section>

      {/* ── Product demo section ───────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 pb-28">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <span className="text-[11px] font-semibold text-accent-from uppercase tracking-[0.15em]">Product</span>
            <h2 className="font-display text-3xl font-bold text-white mt-3 mb-4 leading-tight">
              From repo scan to<br />onboarding report.
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Paste a GitHub URL. CodeFlow clones, parses, and builds a complete entity graph — architecture,
              dependencies, services, and circular deps. Then generates a personalized learning path with time
              estimates, key files, and objectives.
            </p>
            <Link to="/register" className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-from hover:text-accent-via transition-colors">
              Try it now <Icon name="arrow" className="!w-3.5 !h-3.5" />
            </Link>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0.1}>
            <CodeWindow language="json">
              {`{
  "repo": "facebook/react",
  "architecture": "component-based",
  "files": 1247,
  "dependencies": 84,
  "circular": 3,
  "learning_path": {
    "total_hours": 4.2,
    "modules": [
      { "name": "Core Concepts", "files": ["packages/react"] },
      { "name": "Component Patterns", "files": ["packages/react-dom"] }
    ]
  }
}`}
            </CodeWindow>
          </motion.div>
        </div>
      </section>

      {/* ── Features (Bento Grid) ──────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 pb-28">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-14">
          <span className="text-[11px] font-semibold text-accent-from uppercase tracking-[0.15em]">Features</span>
          <h2 className="font-display text-3xl font-bold text-white mt-3 max-w-md">
            Everything you need to onboard a developer.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <BentoCard size="lg">
              <BentoIcon><Icon name="search" /></BentoIcon>
              <BentoTag className="mb-3">Core</BentoTag>
              <h3 className="font-display text-base font-semibold text-white mb-2">Repository Analysis</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Auto-parse any GitHub repo — architecture, dependencies, services, and circular deps. Visualized as an interactive graph.</p>
            </BentoCard>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0.05}>
            <BentoCard size="md">
              <BentoIcon><Icon name="clock" /></BentoIcon>
              <BentoTag className="mb-3">AI</BentoTag>
              <h3 className="font-display text-base font-semibold text-white mb-2">Learning Paths</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Personalized per skill level. LLM-powered with intelligent fallback when models are unavailable.</p>
            </BentoCard>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0.1}>
            <BentoCard size="md" variant="accent">
              <BentoIcon><Icon name="code" /></BentoIcon>
              <BentoTag className="mb-3">Interactive</BentoTag>
              <h3 className="font-display text-base font-semibold text-white mb-2">Pair Programming</h3>
              <p className="text-sm text-slate-500 leading-relaxed">AI narrates its thought process for any issue — key insights, testing approach, and solution steps.</p>
            </BentoCard>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <BentoCard size="md">
              <BentoIcon><Icon name="book" /></BentoIcon>
              <BentoTag className="mb-3">Onboarding</BentoTag>
              <h3 className="font-display text-base font-semibold text-white mb-2">Reports & Playbooks</h3>
              <p className="text-sm text-slate-500 leading-relaxed">HTML reports with module breakdowns. Reusable playbooks for consistent team onboarding.</p>
            </BentoCard>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0.05}>
            <BentoCard size="lg">
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <BentoIcon><Icon name="users" /></BentoIcon>
                  <BentoTag>Team</BentoTag>
                </div>
                <h3 className="font-display text-base font-semibold text-white mb-2">Team Management</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">Organize developers into teams, assign playbooks, track progress, manage subscriptions from one dashboard.</p>
                <div className="mt-auto">
                  <CodeWindow language="json">
                    {`{ "team":"frontend-guild",
  "members":12,
  "playbooks":["react"],
  "status":"active" }`}
                  </CodeWindow>
                </div>
              </div>
            </BentoCard>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} custom={0.1}>
            <BentoCard size="md" variant="accent">
              <BentoIcon><Icon name="lock" /></BentoIcon>
              <BentoTag className="mb-3">Enterprise</BentoTag>
              <h3 className="font-display text-base font-semibold text-white mb-2">API & Auth</h3>
              <p className="text-sm text-slate-500 leading-relaxed">OAuth + Google SSO, API key management, usage tracking, tiered rate limiting. Enterprise billing via Stripe.</p>
            </BentoCard>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 pb-28">
        <div className="grid grid-cols-3 gap-12">
          <CountUp end={1247} label="Repos Analyzed" />
          <CountUp end={8340} label="Developers" />
          <CountUp end={15200} label="Hours Saved" />
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pb-28">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-12">
          <span className="text-[11px] font-semibold text-accent-from uppercase tracking-[0.15em]">Testimonials</span>
          <h2 className="font-display text-2xl font-bold text-white mt-3">Loved by engineering teams</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Testimonial
            quote="Cut our onboarding docs from 3 weeks to 2 days. The learning paths are scarily accurate."
            author="Sarah Chen"
            role="VP Engineering, Neon"
          />
          <Testimonial
            quote="Finally, onboarding that doesn't require 50 pages of docs. New hires ship code on day one."
            author="Marcus Rivera"
            role="CTO, Workbase"
          />
          <Testimonial
            quote="The bento grid is insane. Pair programming feature is our team's favorite — it's like having a senior dev review every PR."
            author="Priya Sharma"
            role="Engineering Lead, Strapi"
          />
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-5 pb-28 text-center">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-12"
        >
          <h2 className="font-display text-2xl font-bold text-white mb-3">Ship developers faster.</h2>
          <p className="text-sm text-slate-500 mb-7 max-w-xs mx-auto">Join thousands of teams using CodeFlow to turn onboarding from weeks into days.</p>
          <Link to="/register" className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-slate-900 font-medium text-sm shadow-lg hover:shadow-xl hover:bg-white/90 transition-all duration-300">
            Get Started Free
            <Icon name="arrow" />
          </Link>
        </motion.div>
      </section>

      <Footer />
    </div>
  )
}
