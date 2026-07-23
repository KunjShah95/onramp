import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  ArrowRight,
  Check,
  GithubLogo,
  Sparkle,
  Play,
  ShieldCheck,
  Timer,
  SealCheck,
  UsersThree,
  FileText,
  ArrowsClockwise,
  Star,
  TreeStructure,
  ChatCircleDots,
  MagnifyingGlass,
  PlusCircle,
  MapTrifold,
  BookOpenText,
  Lightning,
  GitBranch,
  ChartLineUp,
  Plus,
  XLogo,
  LinkedinLogo,
} from '@phosphor-icons/react'

/* ΓöÇΓöÇ Design Read ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 * B2B SaaS landing for engineering buyers. Target aesthetic:
 * warm editorial "paper" light theme, indigo accent, Instrument
 * Serif display with italic emphasis words, a high-fidelity product
 * dashboard mockup as the hero centerpiece. Refined, not maximal.
 *
 * Palette (scoped, light):
 *   paper   #F6F4EF   ink    #17171B   sub   #57575F
 *   card    #FFFFFF   line   rgba(23,23,30,.08)
 *   indigo  #5B5BD6   indigo-soft #ECECFB
 *
 * Dials: VARIANCE 6 | MOTION 5 | DENSITY 4
 * ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ*/

/* ΓöÇΓöÇ Motion primitives ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
})

const stagger = {
  initial: {},
  whileInView: {},
  viewport: { once: true, amount: 0.2 },
  transition: { staggerChildren: 0.08 },
}
const item = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] as const },
}

/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */
export default function LandingPageV3() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const navigate = useNavigate()

  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const mockY = useTransform(scrollYProgress, [0, 1], [0, -40])
  const photoOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden font-body antialiased"
      style={{ background: '#F6F4EF', color: '#17171B' }}
    >
      {/* ΓòÉΓòÉΓòÉ Navbar ΓòÉΓòÉΓòÉ */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl border-b border-[rgba(23,23,30,.08)] shadow-sm' : 'bg-transparent'}`}>
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[9px] text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
              style={{ background: 'linear-gradient(140deg,#6366F1,#4F46E5)' }}
            >
              <TreeStructure size={17} weight="bold" />
            </span>
            <span className="text-[19px] font-semibold tracking-tight text-[#17171B]">
              Onramp
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {['Features', 'How it works', 'Pricing', 'Docs'].map((label) => (
              <a
                key={label}
                href={`#${label.split(' ')[0].toLowerCase()}`}
                className="group relative text-[14px] font-medium text-[#4A4A52] transition-colors hover:text-[#17171B]"
              >
                {label}
                <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#5B5BD6] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
            <button className="flex items-center gap-1 text-[14px] font-medium text-[#4A4A52] transition-colors hover:text-[#17171B]">
              Resources
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="mt-px">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden text-[14px] font-medium text-[#4A4A52] transition-colors hover:text-[#17171B] sm:inline"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="group inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-to-r from-[#5B5BD6] to-[#4F46E5] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(23,23,30,.2)] transition-all hover:shadow-[0_2px_8px_rgba(91,91,214,.35)] active:scale-[0.98]"
            >
              Start free
              <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#4A4A52] md:hidden"
            >
              <div className="flex flex-col gap-[5px]">
                <span className={`block h-px w-4 bg-current transition-all ${mobileMenuOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
                <span className={`block h-px w-4 bg-current transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                <span className={`block h-px w-4 bg-current transition-all ${mobileMenuOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-6 rounded-2xl border border-[rgba(23,23,30,.08)] bg-white/95 backdrop-blur-xl p-3 shadow-lg md:hidden"
          >
            {['Features', 'How it works', 'Pricing', 'Docs', 'Log in'].map((label) => (
              <a
                key={label}
                href="#"
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-[14px] font-medium text-[#4A4A52] hover:bg-[#F6F4EF]"
              >
                {label}
              </a>
            ))}
          </motion.div>
        )}
      </nav>

      {/* ΓòÉΓòÉΓòÉ Hero ΓòÉΓòÉΓòÉ */}
      <section ref={heroRef} className="relative overflow-hidden pt-[128px] pb-24">
        {/* Atmospheric mountain photo, masked + faded */}
        <motion.div
          style={{ opacity: photoOpacity }}
          className="pointer-events-none absolute inset-0 z-0"
          aria-hidden
        >
          <img
            src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1920&auto=format&fit=crop"
            alt=""
            className="h-full w-full object-cover object-center opacity-[0.5]"
            style={{ maskImage: 'linear-gradient(to bottom, transparent 2%, black 22%, black 74%, transparent 98%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 2%, black 22%, black 74%, transparent 98%)' }}
          />
          {/* warm wash so text stays readable over the photo, brightest behind the copy */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(75% 65% at 32% 40%, rgba(91,91,214,.12) 0%, rgba(246,244,239,.50) 45%, transparent 70%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #F6F4EF 0%, transparent 15%, transparent 85%, rgba(91,91,214,.06) 100%)' }} />
        </motion.div>

        <div className="relative z-10 mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-14 px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-10">
          {/* Left column */}
          <div className="max-w-xl">
            <motion.div
              {...fadeUp(0)}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(91,91,214,.22)] bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-[#4A4A52] shadow-[0_1px_2px_rgba(23,23,30,.04)] backdrop-blur-sm transition-all hover:border-[#5B5BD6]/30"
            >
              <Sparkle size={13} weight="fill" className="text-[#5B5BD6]" />
              The AI-powered developer onboarding platform
            </motion.div>

            <motion.h1
              {...fadeUp(0.08)}
              className="mt-6 font-display text-[52px] leading-[0.98] tracking-[-0.02em] text-[#17171B] sm:text-[64px]"
            >
              Onboard developers in hours, not{' '}
              <span className="italic text-[#5B5BD6]" style={{ textShadow: '0 1px 8px rgba(91,91,214,.18)' }}>weeks.</span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.16)}
              className="mt-6 max-w-md text-[17px] leading-[1.6] text-[#57575F]"
            >
              Onramp reads your codebase, maps the architecture, and guides
              every new engineer with an AI mentor that never sleeps.
            </motion.p>

            <motion.div {...fadeUp(0.24)} className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/register')}
                className="group inline-flex items-center gap-2 rounded-[12px] bg-gradient-to-r from-[#5B5BD6] to-[#4F46E5] px-6 py-3.5 text-[15px] font-medium text-white shadow-[0_2px_12px_rgba(91,91,214,.25)] transition-all hover:shadow-[0_4px_20px_rgba(91,91,214,.4)] active:scale-[0.98]"
              >
                Start free
                <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => navigate('/explore')}
                className="inline-flex items-center gap-2 rounded-[12px] border border-[rgba(23,23,30,.12)] bg-white px-6 py-3.5 text-[15px] font-medium text-[#17171B] shadow-[0_1px_2px_rgba(23,23,30,.04)] transition-all hover:border-[#5B5BD6]/30 hover:bg-[#FBFAF8] active:scale-[0.98]"
              >
                <Play size={15} weight="fill" className="text-[#5B5BD6]" />
                Watch demo
              </button>
            </motion.div>

            <motion.div
              {...fadeUp(0.32)}
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] font-medium text-[#6B6B73]"
            >
              {[
                { icon: SealCheck, label: 'No credit card required' },
                { icon: Timer, label: '2-minute setup' },
                { icon: ShieldCheck, label: 'SOC 2 Compliant' },
                { icon: ShieldCheck, label: 'GDPR Ready' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <Icon size={15} weight="duotone" className="text-[#5B5BD6]" />
                  {label}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right column: product dashboard mockup */}
          <motion.div
            style={{ y: mockY }}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            whileHover={{ scale: 1.015, y: -6 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative cursor-pointer"
          >
            <DashboardMockup />
          </motion.div>
        </div>
      </section>

      {/* ΓòÉΓòÉΓòÉ Trust bar ΓòÉΓòÉΓòÉ */}
      <section className="relative z-10 mx-auto -mt-4 max-w-[1180px] px-6 lg:px-10">
        <motion.div {...fadeUp(0)}>
          <div className="group relative rounded-[20px] bg-white p-[1px] transition-all duration-500 hover:bg-gradient-to-br hover:from-[#5B5BD6]/25 hover:to-[#4F46E5]/25">
            <div className="rounded-[19px] border border-[rgba(23,23,30,.07)] bg-white px-8 py-7 shadow-[0_1px_2px_rgba(23,23,30,.04),0_12px_40px_-16px_rgba(23,23,30,.12)]">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9A9AA2]">
                Trusted by engineering teams at
              </p>
              <div className="mt-6 flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
                <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
                  {[
                    { slug: 'vercel', label: 'Vercel' },
                    { slug: 'linear', label: 'Linear' },
                    { slug: 'stripe', label: 'Stripe' },
                    { slug: 'ramp', label: 'Ramp' },
                    { slug: 'sentry', label: 'Sentry' },
                  ].map((b) => (
                    <img
                      key={b.slug}
                      src={`https://cdn.simpleicons.org/${b.slug}/17171B`}
                      alt={b.label}
                      className="h-[22px] w-auto opacity-70 grayscale transition-all duration-300 hover:opacity-100 hover:brightness-110 hover:-translate-y-0.5"
                    />
                  ))}
                </div>
                <div className="flex items-center gap-8 border-l border-[rgba(23,23,30,.08)] pl-8">
                  <Stat
                    top={
                      <motion.span
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        className="inline-flex text-[#5B5BD6]"
                      >
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Star key={i} size={15} weight="fill" />
                        ))}
                      </motion.span>
                    }
                    big="4.9/5"
                    label="average rating"
                  />
                  <Stat big="10,000+" label="developers onboarded" />
                  <Stat big="2M+" label="repositories indexed" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ΓòÉΓòÉΓòÉ The Onboarding Tax (problem) ΓòÉΓòÉΓòÉ */}
      <section className="mx-auto max-w-[1180px] px-6 pt-28 pb-20 lg:px-10">
        <motion.div {...fadeUp(0)} className="text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5B5BD6]">
            The onboarding tax
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-[38px] leading-[1.1] tracking-[-0.01em] text-[#17171B] sm:text-[44px]">
            New hires spend <span className="italic text-[#5B5BD6]">3 weeks</span> lost in unfamiliar code.
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.3 }}
          className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3"
        >
          {[
            {
              icon: UsersThree,
              title: 'Tribal knowledge',
              desc: 'Critical context lives in senior engineersΓÇÖ heads.',
            },
            {
              icon: FileText,
              title: 'Stale docs',
              desc: 'READMEs rot the day theyΓÇÖre written.',
            },
            {
              icon: ArrowsClockwise,
              title: 'Context switching',
              desc: 'Mentors lose 6 hrs/week answering the same questions.',
            },
          ].map((c) => (
            <motion.div
              variants={item}
              key={c.title}
              className="group rounded-[18px] border border-[rgba(23,23,30,.08)] bg-white p-7 shadow-[0_1px_2px_rgba(23,23,30,.03)] transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(91,91,214,.30)] hover:shadow-[0_12px_32px_-12px_rgba(91,91,214,.25)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#ECECFB] text-[#5B5BD6] transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-[#5B5BD6] group-hover:to-[#4F46E5] group-hover:text-white">
                <c.icon size={20} weight="duotone" />
              </span>
              <h3 className="mt-5 text-[18px] font-semibold text-[#17171B]">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#6B6B73]">{c.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <HowItWorks />
      <Features />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  )
}

/* ΓöÇΓöÇ Trust stat ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function Stat({ big, label, top }: { big: string; label: string; top?: React.ReactNode }) {
  return (
    <div className="text-center">
      {top && <div className="mb-1 flex justify-center">{top}</div>}
      <div className="text-[20px] font-semibold leading-none tracking-tight text-[#17171B] tabular-nums">{big}</div>
      <div className="mt-1 text-[12px] text-[#8A8A93]">{label}</div>
    </div>
  )
}

/* ΓöÇΓöÇ Hero dashboard mockup ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[rgba(23,23,30,.09)] bg-white shadow-[0_2px_4px_rgba(23,23,30,.04),0_40px_80px_-24px_rgba(23,23,30,.28)]">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-[190px] shrink-0 flex-col gap-1 border-r border-[rgba(23,23,30,.07)] bg-[#FBFAF8] p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-2 py-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-[7px] text-white" style={{ background: 'linear-gradient(140deg,#6366F1,#4F46E5)' }}>
              <TreeStructure size={13} weight="bold" />
            </span>
            <span className="text-[13px] font-semibold text-[#17171B]">Onramp</span>
          </div>
          {[
            { icon: TreeStructure, label: 'Overview', active: true },
            { icon: MagnifyingGlass, label: 'Map' },
            { icon: ChatCircleDots, label: 'Ask Onramp' },
            { icon: UsersThree, label: 'Onboarding' },
            { icon: FileText, label: 'Docs' },
            { icon: MagnifyingGlass, label: 'Search' },
          ].map((n) => (
            <div
              key={n.label}
              className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[12.5px] ${
                n.active ? 'bg-[#ECECFB] font-medium text-[#4F46E5]' : 'text-[#6B6B73]'
              }`}
            >
              <n.icon size={14} weight={n.active ? 'fill' : 'regular'} />
              {n.label}
            </div>
          ))}
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-[#17171B]">Overview</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-[7px] border border-[rgba(23,23,30,.1)] px-2 py-1 text-[11px] text-[#6B6B73] sm:flex">
                <GithubLogo size={12} weight="fill" /> acme/platform
              </span>
              <span className="h-6 w-6 rounded-full bg-[#ECECFB]" />
            </div>
          </div>

          <div className="mt-3 text-[15px] font-semibold text-[#17171B]">Good morning, Alex ≡ƒæï</div>
          <div className="text-[11px] text-[#8A8A93]">Here&rsquo;s what&rsquo;s happening with your codebase.</div>

          {/* Stat cards */}
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { k: 'Codebase health', v: '92%', t: 'Healthy', c: '#22A06B' },
              { k: 'Architecture score', v: '89/100', t: 'Good', c: '#5B5BD6' },
              { k: 'Active onboarding', v: '12', t: 'Engineers', c: '#E0872B' },
              { k: 'Questions answered', v: '1,248', t: 'This week', c: '#5B5BD6' },
            ].map((s) => (
              <div key={s.k} className="rounded-[10px] border border-[rgba(23,23,30,.07)] bg-white p-2.5">
                <div className="text-[9.5px] text-[#8A8A93]">{s.k}</div>
                <div className="mt-1 text-[16px] font-semibold text-[#17171B]">{s.v}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[9px]" style={{ color: s.c }}>{s.t}</span>
                  <Sparkline color={s.c} />
                </div>
              </div>
            ))}
          </div>

          {/* Lower panels */}
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
            {/* Architecture map */}
            <div className="rounded-[10px] border border-[rgba(23,23,30,.07)] bg-white p-2.5">
              <div className="text-[10px] font-medium text-[#6B6B73]">Architecture map</div>
              <div className="relative mt-2 h-[92px]">
                {[
                  { l: 'Web App', s: 'Next.js', x: '2%', y: '8%' },
                  { l: 'API Gateway', s: 'Node.js', x: '38%', y: '4%' },
                  { l: 'Auth Service', s: 'Go', x: '74%', y: '2%' },
                  { l: 'User Service', s: 'Python', x: '74%', y: '38%' },
                  { l: 'Billing', s: 'Node.js', x: '74%', y: '72%' },
                ].map((n) => (
                  <div
                    key={n.l}
                    className="absolute rounded-[6px] border border-[rgba(23,23,30,.1)] bg-white px-1.5 py-1 shadow-[0_1px_2px_rgba(23,23,30,.05)]"
                    style={{ left: n.x, top: n.y }}
                  >
                    <div className="text-[8px] font-semibold text-[#17171B]">{n.l}</div>
                    <div className="text-[7px] text-[#9A9AA2]">{n.s}</div>
                  </div>
                ))}
                <span className="absolute left-[24%] top-[62%] h-1.5 w-1.5 rounded-full bg-[#5B5BD6]" />
                <span className="absolute left-[50%] top-[52%] h-1.5 w-1.5 rounded-full bg-[#5B5BD6]" />
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-[10px] border border-[rgba(23,23,30,.07)] bg-white p-2.5">
              <div className="text-[10px] font-medium text-[#6B6B73]">Recent activity</div>
              <div className="mt-2 space-y-2">
                {[
                  { c: '#22A06B', t: 'New engineer onboarded', s: '2h ago' },
                  { c: '#5B5BD6', t: 'Codebase indexed', s: '5h ago' },
                  { c: '#E0872B', t: 'Architecture updated', s: '1d ago' },
                  { c: '#EF5F5F', t: 'Docs generated', s: '2d ago' },
                ].map((a) => (
                  <div key={a.t} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.c }} />
                    <span className="min-w-0 flex-1 truncate text-[9px] text-[#4A4A52]">{a.t}</span>
                    <span className="text-[8px] text-[#9A9AA2]">{a.s}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ask Onramp */}
            <div className="rounded-[10px] border border-[rgba(23,23,30,.07)] bg-white p-2.5">
              <div className="text-[10px] font-medium text-[#6B6B73]">Ask Onramp</div>
              <div className="mt-2 space-y-1.5">
                {['How does authentication work?', 'Where is billing handled?', 'Explain the data flow for orders'].map((q) => (
                  <div key={q} className="flex items-center justify-between rounded-[6px] border border-[rgba(23,23,30,.07)] bg-[#FBFAF8] px-2 py-1.5">
                    <span className="truncate text-[9px] text-[#4A4A52]">{q}</span>
                    <ArrowRight size={9} className="text-[#B0B0B8]" />
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-[6px] bg-[#17171B] px-2 py-1.5">
                  <span className="text-[9px] text-white/60">Ask anything about your codebaseΓÇª</span>
                  <PlusCircle size={11} weight="fill" className="text-[#5B5BD6]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" fill="none">
      <path d="M1 12 L7 8 L13 10 L19 5 L25 6 L33 1" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  )
}

/* ΓöÇΓöÇ How it works ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function HowItWorks() {
  const steps = [
    {
      n: '01',
      icon: GitBranch,
      title: 'Connect your repo',
      desc: 'One-click GitHub install, read-only. Onramp clones and indexes your codebase in minutes ΓÇö no config, no agents to babysit.',
    },
    {
      n: '02',
      icon: MapTrifold,
      title: 'AI maps everything',
      desc: 'It parses architecture, ownership, and data flows, then writes living docs and a dependency map that update on every push.',
    },
    {
      n: '03',
      icon: UsersThree,
      title: 'Engineers self-onboard',
      desc: 'New hires follow guided paths and ask an AI mentor anything ΓÇö answered from your real code, not a stale wiki.',
    },
  ]
  return (
    <section id="how" className="mx-auto max-w-[1180px] px-6 py-24 lg:px-10">
      <motion.div {...fadeUp(0)} className="max-w-2xl">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5B5BD6]">How it works</p>
        <h2 className="mt-4 font-display text-[38px] leading-[1.1] tracking-[-0.01em] text-[#17171B] sm:text-[44px]">
          From clone to first PR in <span className="italic text-[#5B5BD6]">three steps.</span>
        </h2>
        <p className="mt-4 max-w-lg text-[16px] leading-[1.6] text-[#57575F]">
          No workshops, no shadowing marathons. Onramp turns an unfamiliar repository into a guided path.
        </p>
      </motion.div>

      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="whileInView"
        viewport={{ once: true, amount: 0.25 }}
        className="relative mt-14 grid grid-cols-1 gap-5 md:grid-cols-3"
      >
        {/* connecting hairline */}
        <div className="pointer-events-none absolute left-0 right-0 top-[38px] hidden h-px bg-[rgba(23,23,30,.08)] md:block" />
        {steps.map((s) => (
          <motion.div variants={item} key={s.n} className="relative">
            <div className="relative z-10 flex h-[76px] w-[76px] items-center justify-center rounded-[18px] border border-[rgba(23,23,30,.08)] bg-white shadow-[0_4px_16px_-6px_rgba(23,23,30,.12)]">
              <s.icon size={30} weight="duotone" className="text-[#5B5BD6]" />
              <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#17171B] text-[10px] font-semibold text-white">
                {s.n}
              </span>
            </div>
            <h3 className="mt-6 text-[19px] font-semibold text-[#17171B]">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-[1.6] text-[#6B6B73]">{s.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

/* ΓöÇΓöÇ Features (bento) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function Features() {
  return (
    <section id="features" className="border-y border-[rgba(23,23,30,.07)] bg-[#F1EEE7]">
      <div className="mx-auto max-w-[1180px] px-6 py-24 lg:px-10">
        <motion.div {...fadeUp(0)} className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5B5BD6]">Features</p>
          <h2 className="mt-4 font-display text-[38px] leading-[1.1] tracking-[-0.01em] text-[#17171B] sm:text-[44px]">
            One system that <span className="italic text-[#5B5BD6]">actually knows</span> your code.
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6"
        >
          {/* Big: Architecture map */}
          <motion.div variants={item} className="md:col-span-4">
            <FeatureCard
              icon={MapTrifold}
              tag="Live architecture"
              title="A map that never goes stale"
              desc="Every service, dependency, and data flow rendered as an interactive graph ΓÇö regenerated on each push so it always matches reality."
            >
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { l: 'Web App', s: 'Next.js' },
                  { l: 'API Gateway', s: 'Node.js' },
                  { l: 'Auth Service', s: 'Go' },
                  { l: 'User Service', s: 'Python' },
                  { l: 'Billing', s: 'Node.js' },
                  { l: 'Postgres', s: 'Database' },
                ].map((n) => (
                  <div key={n.l} className="rounded-[10px] border border-[rgba(23,23,30,.08)] bg-white px-3 py-2">
                    <div className="text-[12px] font-semibold text-[#17171B]">{n.l}</div>
                    <div className="text-[10px] text-[#9A9AA2]">{n.s}</div>
                  </div>
                ))}
              </div>
            </FeatureCard>
          </motion.div>

          {/* Ask Onramp */}
          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard
              icon={ChatCircleDots}
              tag="AI mentor"
              title="Ask anything"
              desc="Answers grounded in your actual code, with file references."
            >
              <div className="mt-4 space-y-2">
                <div className="rounded-[10px] bg-white px-3 py-2 text-[12px] text-[#4A4A52] shadow-[0_1px_2px_rgba(23,23,30,.04)]">
                  How does auth work?
                </div>
                <div className="rounded-[10px] bg-[#ECECFB] px-3 py-2 text-[12px] leading-[1.5] text-[#3A3A6B]">
                  Sessions are issued in <span className="font-medium">auth/session.go:42</span> and verified by middleware.
                </div>
              </div>
            </FeatureCard>
          </motion.div>

          {/* Living docs */}
          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard icon={BookOpenText} tag="Living docs" title="Docs that write themselves" desc="Onboarding guides and READMEs generated from source and kept in sync automatically." />
          </motion.div>

          {/* Guided onboarding */}
          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard icon={Lightning} tag="Guided paths" title="A path per engineer" desc="Role-aware onboarding checklists that adapt to seniority and the team they're joining." />
          </motion.div>

          {/* Insights */}
          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard icon={ChartLineUp} tag="Insights" title="Measure ramp-up" desc="Track time-to-first-PR, health scores, and where new hires get stuck ΓÇö per team." />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  tag,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ size?: number; weight?: 'duotone'; className?: string }>
  tag: string
  title: string
  desc: string
  children?: React.ReactNode
}) {
  return (
    <div className="group flex h-full flex-col rounded-[18px] border border-[rgba(23,23,30,.08)] bg-white p-6 shadow-[0_1px_2px_rgba(23,23,30,.03)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(91,91,214,.28)] hover:shadow-[0_16px_40px_-16px_rgba(91,91,214,.28)]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#ECECFB] text-[#5B5BD6] transition-colors group-hover:bg-[#5B5BD6] group-hover:text-white">
          <Icon size={18} weight="duotone" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9A9AA2]">{tag}</span>
      </div>
      <h3 className="mt-4 text-[19px] font-semibold text-[#17171B]">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-[#6B6B73]">{desc}</p>
      {children}
    </div>
  )
}

/* ΓöÇΓöÇ Pricing ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 * Design intent: pricing is where trust is won or lost. Three moves
 * to avoid the generic "3 boxes + checkmarks" template:
 *   1. A billing toggle that rewards commitment (annual = 2 months
 *      free) with an animated segmented control and morphing price.
 *   2. Real hierarchy ΓÇö the recommended plan is physically taller,
 *      warmer, and lifted; the others recede so the eye lands once.
 *   3. A live seat stepper on the team plan, so a buyer sees *their*
 *      number, not an abstract per-seat figure. Progressive feature
 *      lists ("Everything in Starter, plusΓÇª") show the value ladder.
 * ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ*/
const STARTER_FEATURES = ['1 repository', 'Live architecture map', 'AI mentor ΓÇö 100 questions / mo', 'Auto-generated docs', 'Community support']
const TEAM_FEATURES = ['Unlimited repositories', 'Unlimited AI mentor', 'Guided onboarding paths', 'Ramp-up & time-to-PR insights', 'GitHub, Slack & Linear sync', 'Priority support']
const ENTERPRISE_FEATURES = ['SSO / SAML & SCIM provisioning', 'Self-hosted or private cloud', 'Audit logs & SOC 2 Type II', 'Dedicated success engineer', 'Custom onboarding modules', '99.9% uptime SLA']

type Currency = 'USD' | 'INR'
const PRICES: Record<Currency, { sym: string; monthly: number; annual: number; roi: string }> = {
  // Flat price per workspace ΓÇö unlimited engineers. INR is PPP-adjusted, not FX-converted.
  USD: { sym: '$', monthly: 99, annual: 82, roi: '$8,000' },
  INR: { sym: 'Γé╣', monthly: 2999, annual: 2499, roi: 'Γé╣6,00,000' },
}

function Pricing() {
  const [annual, setAnnual] = useState(true)
  const [currency, setCurrency] = useState<Currency>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata' ? 'INR' : 'USD'
    } catch {
      return 'USD'
    }
  })

  const c = PRICES[currency]
  const teamPrice = annual ? c.annual : c.monthly
  const fmt = (n: number) => n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US')

  return (
    <section id="pricing" className="mx-auto max-w-[1180px] px-6 py-24 lg:px-10">
      <motion.div {...fadeUp(0)} className="mx-auto max-w-2xl text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5B5BD6]">Pricing</p>
        <h2 className="mt-4 font-display text-[38px] leading-[1.1] tracking-[-0.01em] text-[#17171B] sm:text-[44px]">
          One flat price. Your <span className="italic text-[#5B5BD6]">whole team.</span>
        </h2>
        <p className="mt-4 text-[16px] leading-[1.6] text-[#57575F]">
          No per-seat math. Every engineer can ask, explore, and onboard ΓÇö you pay one price per workspace.
        </p>
      </motion.div>

      {/* ROI anchor ΓÇö reframes cost against the real alternative, not a $20 tool */}
      <motion.div {...fadeUp(0.06)} className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-full border border-[rgba(91,91,214,.2)] bg-[#F7F6FD] px-4 py-2 text-center text-[13.5px] text-[#4A4A52]">
        <Sparkle size={14} weight="fill" className="shrink-0 text-[#5B5BD6]" />
        <span>
          One slow onboarding costs <span className="font-semibold text-[#17171B]">~{c.roi}</span>. Onramp starts at {c.sym}{fmt(c.annual)}/mo.
        </span>
      </motion.div>

      {/* Toggles: billing cadence + currency */}
      <motion.div {...fadeUp(0.1)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Segmented
          options={['Monthly', 'Annual']}
          value={annual ? 'Annual' : 'Monthly'}
          onChange={(v) => setAnnual(v === 'Annual')}
          pillId="billpill"
        />
        <span className="inline-flex items-center gap-1 rounded-full bg-[#ECECFB] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">
          <Sparkle size={11} weight="fill" /> 2 months free
        </span>
        <span className="hidden h-5 w-px bg-[rgba(23,23,30,.1)] sm:block" />
        <Segmented
          options={['USD', 'INR']}
          value={currency}
          onChange={(v) => setCurrency(v as Currency)}
          pillId="curpill"
        />
      </motion.div>

      {/* Cards */}
      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="whileInView"
        viewport={{ once: true, amount: 0.15 }}
        className="mt-12 grid grid-cols-1 items-start gap-5 md:grid-cols-3"
      >
        {/* Free */}
        <motion.div variants={item}>
          <PlanCard name="Free" blurb="For a solo dev getting the lay of the land.">
            <div className="flex items-baseline gap-1">
              <span className="mt-1 self-start font-display text-[22px] text-[#17171B]">{c.sym}</span>
              <span className="font-display text-[52px] leading-none tracking-tight text-[#17171B]">0</span>
              <span className="ml-1 text-[13px] text-[#9A9AA2]">forever</span>
            </div>
            <p className="mt-3 h-[18px] text-[13px] text-[#9A9AA2]">No card required.</p>
            <PlanCTA href="/register" variant="ghost">Start free</PlanCTA>
            <FeatureList items={STARTER_FEATURES} />
          </PlanCard>
        </motion.div>

        {/* Team ΓÇö featured, flat per workspace */}
        <motion.div variants={item} className="md:-mt-4">
          <PlanCard name="Team" blurb="Everything your team needs to onboard fast." featured>
            <div className="flex items-baseline gap-1">
              <span className="mt-1 self-start font-display text-[22px] text-[#17171B]">{c.sym}</span>
              <span className="relative inline-flex h-[52px] items-end overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={`${currency}-${teamPrice}`}
                    initial={{ y: '60%', opacity: 0 }}
                    animate={{ y: '0%', opacity: 1 }}
                    exit={{ y: '-60%', opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="font-display text-[52px] leading-none tracking-tight text-[#17171B] tabular-nums"
                  >
                    {fmt(teamPrice)}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="ml-1 text-[13px] text-[#6B6B73]">/ mo</span>
            </div>
            <p className="mt-3 h-[18px] text-[13px] text-[#8A8A93]">
              {annual ? (
                <>
                  <span className="text-[#B0B0B8] line-through">{c.sym}{fmt(c.monthly)}</span> billed annually ┬╖ unlimited engineers
                </>
              ) : (
                'per workspace ┬╖ unlimited engineers'
              )}
            </p>

            <PlanCTA href="/register" variant="solid">Start 14-day trial</PlanCTA>
            <FeatureList items={TEAM_FEATURES} inherit="Everything in Free, plus" featured />
          </PlanCard>
        </motion.div>

        {/* Enterprise */}
        <motion.div variants={item}>
          <PlanCard name="Enterprise" blurb="For orgs that need control, security, and scale.">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[52px] leading-none tracking-tight text-[#17171B]">Custom</span>
            </div>
            <p className="mt-3 h-[18px] text-[13px] text-[#9A9AA2]">Volume &amp; fresher-batch pricing.</p>
            <PlanCTA href="#contact" variant="ghost">Contact sales</PlanCTA>
            <FeatureList items={ENTERPRISE_FEATURES} inherit="Everything in Team, plus" />
          </PlanCard>
        </motion.div>
      </motion.div>

      {/* Assurance strip */}
      <motion.div
        {...fadeUp(0.1)}
        className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] font-medium text-[#8A8A93]"
      >
        {['14-day trial on Team', 'No credit card to start', 'Cancel anytime', 'SOC 2 Type II'].map((t, i) => (
          <span key={t} className="inline-flex items-center gap-2">
            {i > 0 && <span className="h-1 w-1 rounded-full bg-[#C9C7C0]" />}
            <Check size={13} weight="bold" className="text-[#5B5BD6]" />
            {t}
          </span>
        ))}
      </motion.div>
    </section>
  )
}

/* Reusable animated segmented control */
function Segmented({
  options,
  value,
  onChange,
  pillId,
}: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  pillId: string
}) {
  return (
    <div className="relative flex items-center rounded-full border border-[rgba(23,23,30,.1)] bg-white p-1 shadow-[0_1px_2px_rgba(23,23,30,.04)]">
      {options.map((label) => {
        const active = value === label
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(label)}
            className={`relative z-10 rounded-full px-5 py-1.5 text-[13.5px] font-medium transition-colors ${
              active ? 'text-[#17171B]' : 'text-[#8A8A93] hover:text-[#4A4A52]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 -z-10 rounded-full bg-[#F1EEE7] shadow-[inset_0_0_0_1px_rgba(23,23,30,.06)]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function PlanCard({
  name,
  blurb,
  featured = false,
  children,
}: {
  name: string
  blurb: string
  featured?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[22px] p-7 transition-all duration-300 ${
        featured
          ? 'border border-[rgba(91,91,214,.35)] bg-white shadow-[0_30px_70px_-28px_rgba(91,91,214,.55)]'
          : 'border border-[rgba(23,23,30,.08)] bg-white/70 shadow-[0_1px_2px_rgba(23,23,30,.03)] hover:bg-white'
      }`}
    >
      {featured && (
        <>
          <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#6366F1]" />
          <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-[#ECECFB] px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5]">
            <Sparkle size={11} weight="fill" /> Recommended
          </span>
        </>
      )}
      <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8A8A93]">{name}</div>
      <p className="mt-1.5 min-h-[38px] max-w-[220px] text-[13.5px] leading-[1.5] text-[#6B6B73]">{blurb}</p>
      <div className="mt-5">{children}</div>
    </div>
  )
}

function PlanCTA({ href, variant, children }: { href: string; variant: 'solid' | 'ghost'; children: React.ReactNode }) {
  return (
    <Link
      to={href}
      className={`mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-[12px] px-6 py-3 text-[15px] font-medium transition-all active:scale-[0.98] ${
        variant === 'solid'
          ? 'bg-[#17171B] text-white shadow-[0_2px_8px_rgba(23,23,30,.18)] hover:bg-black'
          : 'border border-[rgba(23,23,30,.12)] bg-white text-[#17171B] hover:border-[rgba(23,23,30,.22)] hover:bg-[#FBFAF8]'
      }`}
    >
      {children}
      <ArrowRight size={15} weight="bold" />
    </Link>
  )
}

function FeatureList({ items, inherit, featured = false }: { items: string[]; inherit?: string; featured?: boolean }) {
  return (
    <ul className="mt-7 space-y-3 border-t border-[rgba(23,23,30,.07)] pt-6">
      {inherit && (
        <li className="pb-1 text-[13px] font-semibold text-[#17171B]">{inherit}</li>
      )}
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-[14px] leading-[1.4] text-[#4A4A52]">
          <span
            className={`mt-px flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full ${
              featured ? 'bg-[#5B5BD6] text-white' : 'bg-[#ECECFB] text-[#5B5BD6]'
            }`}
          >
            <Check size={10} weight="bold" />
          </span>
          {f}
        </li>
      ))}
    </ul>
  )
}

/* ΓöÇΓöÇ FAQ ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  const faqs = [
    { q: 'How long does setup take?', a: 'Under two minutes. Install the GitHub app, pick a repository, and Onramp indexes it in the background. You get a live architecture map and docs before your coffee cools.' },
    { q: 'Is my source code stored anywhere?', a: 'No. Onramp reads your code to build an analysis graph and metadata, then discards the raw source. Nothing is used to train shared models. Self-hosting is available on Enterprise.' },
    { q: 'Which languages are supported?', a: 'TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Kotlin, Swift, plus config, SQL, and Markdown. New languages ship continuously.' },
    { q: 'How does the AI mentor stay accurate?', a: 'Every answer is grounded in your indexed code with file and line references, and the index refreshes on each push ΓÇö so answers track the codebase instead of a stale wiki.' },
    { q: 'Can I roll it out to my whole org?', a: 'Yes. Team and Enterprise plans support SSO/SAML, SCIM provisioning, per-team onboarding paths, and ramp-up analytics across every repository.' },
  ]

  return (
    <section id="faq" className="border-t border-[rgba(23,23,30,.07)] bg-[#F1EEE7]">
      <div className="mx-auto max-w-[820px] px-6 py-24 lg:px-10">
        <motion.div {...fadeUp(0)} className="text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5B5BD6]">FAQ</p>
          <h2 className="mt-4 font-display text-[38px] leading-[1.1] tracking-[-0.01em] text-[#17171B] sm:text-[44px]">
            Questions, <span className="italic text-[#5B5BD6]">answered.</span>
          </h2>
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="mt-12 space-y-3">
          {faqs.map((f, i) => {
            const isOpen = open === i
            return (
              <div
                key={f.q}
                className={`overflow-hidden rounded-[16px] border bg-white transition-colors ${
                  isOpen ? 'border-[rgba(91,91,214,.3)]' : 'border-[rgba(23,23,30,.08)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-[16px] font-medium text-[#17171B]">{f.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                      isOpen ? 'rotate-45 bg-[#5B5BD6] text-white' : 'bg-[#ECECFB] text-[#5B5BD6]'
                    }`}
                  >
                    <Plus size={14} weight="bold" />
                  </span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-5 text-[15px] leading-[1.65] text-[#6B6B73]">{f.a}</p>
                </motion.div>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

/* ΓöÇΓöÇ Final CTA ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function FinalCTA() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-24 lg:px-10">
      <motion.div
        {...fadeUp(0)}
        className="relative overflow-hidden rounded-[28px] px-8 py-16 text-center sm:px-16 sm:py-20"
        style={{ background: 'linear-gradient(160deg,#1B1B24 0%,#2A2340 55%,#3B2F63 100%)' }}
      >
        {/* soft indigo glow */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgba(129,110,247,.35) 0%, transparent 70%)' }} />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-[40px] leading-[1.08] tracking-[-0.02em] text-white sm:text-[52px]">
            Ship your next hire&rsquo;s first PR <span className="italic text-[#B8AEF7]">this week.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[17px] leading-[1.6] text-[#C8C4D8]">
            Join 10,000+ engineers who turned onboarding from weeks of shadowing into a guided, self-serve path.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 rounded-[12px] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#17171B] transition-all hover:bg-[#F1EEE7] active:scale-[0.98]"
            >
              Start free
              <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/explore"
              className="inline-flex items-center gap-2 rounded-[12px] border border-white/20 px-7 py-3.5 text-[15px] font-medium text-white transition-all hover:bg-white/10 active:scale-[0.98]"
            >
              <Play size={15} weight="fill" className="text-[#B8AEF7]" />
              Watch demo
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-[#9A94B2]">No credit card required ┬╖ 2-minute setup</p>
        </div>
      </motion.div>
    </section>
  )
}

/* ΓöÇΓöÇ Footer ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function Footer() {
  const cols = [
    { h: 'Product', links: ['Features', 'How it works', 'Pricing', 'Changelog', 'Docs'] },
    { h: 'Company', links: ['About', 'Blog', 'Careers', 'Customers', 'Contact'] },
    { h: 'Resources', links: ['Documentation', 'API reference', 'Guides', 'Status', 'Community'] },
    { h: 'Legal', links: ['Privacy', 'Terms', 'Security', 'DPA', 'SOC 2'] },
  ]
  return (
    <footer className="border-t border-[rgba(23,23,30,.08)] bg-[#F6F4EF]">
      <div className="mx-auto max-w-[1180px] px-6 py-16 lg:px-10">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] text-white" style={{ background: 'linear-gradient(140deg,#6366F1,#4F46E5)' }}>
                <TreeStructure size={17} weight="bold" />
              </span>
              <span className="text-[19px] font-semibold tracking-tight text-[#17171B]">
                Onramp
              </span>
            </Link>
            <p className="mt-4 max-w-[240px] text-[14px] leading-[1.6] text-[#6B6B73]">
              The AI-powered developer onboarding platform. Understand any codebase in hours, not weeks.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              {[GithubLogo, XLogo, LinkedinLogo].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(23,23,30,.1)] bg-white text-[#4A4A52] transition-colors hover:border-[rgba(91,91,214,.35)] hover:text-[#5B5BD6]"
                >
                  <Icon size={16} weight="fill" />
                </a>
              ))}
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.h}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9A9AA2]">{c.h}</h3>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-[14px] text-[#6B6B73] transition-colors hover:text-[#17171B]">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[rgba(23,23,30,.08)] pt-8 sm:flex-row">
          <p className="text-[13px] text-[#9A9AA2]">┬⌐ {new Date().getFullYear()} Onramp, Inc. All rights reserved.</p>
          <div className="flex items-center gap-2 text-[13px] text-[#6B6B73]">
            <span className="h-2 w-2 rounded-full bg-[#22A06B]" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  )
}
