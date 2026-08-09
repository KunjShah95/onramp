import { useState, useRef, useEffect, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from 'framer-motion'
import {
  ArrowRight,
  Check,
  GithubLogo,
  Sparkle,
  Play,
  UsersThree,
  FileText,
  ArrowsClockwise,
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
  Cursor,
  TerminalWindow,
  Brain,
  Coins,
  HardDrives,
  Scissors,
  Gauge,
  Path,
} from '@phosphor-icons/react'

/* ─────────────────────────────────────────────────────────────────────────
 * Design brief — Onramp marketing
 *
 * First principles (shadcn restraint × Aceternity craft):
 *  1. One idea per viewport. Hierarchy from type + space, not chrome.
 *  2. Brand is the hero signal. Remove the nav and it must still read Onramp.
 *  3. Product is the visual plane — full-bleed instrument, not a floating card.
 *  4. Motion explains state change (boot / index / reveal). Never loops for noise.
 *  5. Mission Control language: room / panel / ink / go. Sharp radii. No pills
 *     in the first viewport. No fake customer logos.
 *
 * Palette: room #DDE1DD · ink #181B18 · go #0E7A3C
 * Ease:   expo-out [0.16, 1, 0.3, 1]
 * ───────────────────────────────────────────────────────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.75, delay, ease: EASE },
})

const stagger = {
  initial: {},
  whileInView: {},
  viewport: { once: true, amount: 0.2 },
  transition: { staggerChildren: 0.07 },
}

const item = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: EASE },
}

function RevealWords({
  text,
  className,
  delay = 0,
  as: Tag = 'span',
}: {
  text: string
  className?: string
  delay?: number
  as?: 'span' | 'h1' | 'p'
}) {
  const words = text.split(' ')
  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 0.85, delay: delay + i * 0.045, ease: EASE }}
          >
            {word}
            {i < words.length - 1 ? '\u00A0' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  )
}

export default function LandingPageV3() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const productY = useTransform(scrollYProgress, [0, 1], [0, 80])
  const productScale = useTransform(scrollYProgress, [0, 1], [1, 0.985])
  const atmosphereOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.35])

  return (
    <main className="marketing-surface relative min-h-screen w-full overflow-x-hidden font-body antialiased">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-[background,border,box-shadow,backdrop-filter] duration-300 ${
          scrolled
            ? 'border-b border-seam bg-panel-raised/80 shadow-sm backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-go text-white transition-transform duration-200 group-hover:scale-[1.04]">
              <TreeStructure size={15} weight="bold" />
            </span>
            <span className="font-heading text-[17px] font-semibold tracking-tight text-ink">Onramp</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Why Onramp', href: '#why' },
              { label: 'How it works', href: '#how' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'Docs', href: '/docs', route: true },
            ].map((link) =>
              link.route ? (
                <Link
                  key={link.label}
                  to={link.href}
                  className="group relative text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink"
                >
                  {link.label}
                  <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-go transition-all duration-300 group-hover:w-full" />
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="group relative text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink"
                >
                  {link.label}
                  <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-go transition-all duration-300 group-hover:w-full" />
                </a>
              ),
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden text-[13.5px] font-medium text-ink-secondary transition-colors hover:text-ink sm:inline"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="group inline-flex items-center gap-1.5 rounded-btn bg-go px-3.5 py-2 text-[13.5px] font-semibold text-white shadow-lit transition-all hover:bg-go-lit active:translate-y-px"
            >
              Start free
              <ArrowRight size={13} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-secondary md:hidden"
            >
              <div className="flex flex-col gap-[5px]">
                <span className={`block h-px w-4 bg-current transition-all ${mobileMenuOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
                <span className={`block h-px w-4 bg-current transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                <span className={`block h-px w-4 bg-current transition-all ${mobileMenuOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="mx-4 rounded-md border border-seam bg-panel-raised/95 p-2 shadow-lift backdrop-blur-xl md:hidden"
            >
              {[
                { label: 'Features', href: '#features' },
                { label: 'Why Onramp', href: '#why' },
                { label: 'How it works', href: '#how' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'Docs', href: '/docs', route: true },
                { label: 'Log in', href: '/login', route: true },
              ].map((link) =>
                link.route ? (
                  <Link
                    key={link.label}
                    to={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block rounded-sm px-3 py-2.5 text-[14px] font-medium text-ink-secondary hover:bg-well hover:text-ink"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block rounded-sm px-3 py-2.5 text-[14px] font-medium text-ink-secondary hover:bg-well hover:text-ink"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Hero — one composition ──────────────────────────────────────── */}
      <section ref={heroRef} className="relative mkt-floor overflow-hidden pt-28 pb-0 sm:pt-32">
        {/* Animated mesh-gradient orbs — shader-as-CSS */}
        <motion.div style={{ opacity: atmosphereOpacity }} className="pointer-events-none absolute inset-0" aria-hidden>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-[15%] top-[10%] h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-go/[0.08] blur-[100px]"
          />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute right-[10%] top-[20%] h-[400px] w-[400px] translate-x-1/3 -translate-y-1/4 rounded-full bg-mission/[0.07] blur-[90px]"
          />
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
            className="absolute left-1/2 top-[40%] h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-go/[0.05] blur-[120px]"
          />
        </motion.div>

        {/* Film-grain noise overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-20 opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.7%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E")',
            backgroundRepeat: 'repeat',
            backgroundSize: '128px 128px',
          }}
          aria-hidden
        />

        {/* Cursor-tracked hero spotlight */}
        <HeroSpotlight heroRef={heroRef} />

        <div className="relative z-10 mx-auto max-w-[980px] px-6 text-center lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
            className="mx-auto flex flex-wrap items-center justify-center gap-2"
          >
            {['Grounded answers', 'Live repo graph', 'No stale docs'].map((item) => (
              <span key={item} className="editorial-pill">
                <span className="h-1.5 w-1.5 rounded-full bg-go" />
                {item}
              </span>
            ))}
          </motion.div>

          {/* Brand as hero-level signal */}
          <motion.p
            initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: EASE }}
            className="font-display text-[clamp(3.25rem,11vw,7.5rem)] font-extrabold leading-[0.92] tracking-[-0.04em] text-ink"
          >
            Onramp
          </motion.p>

          <RevealWords
            as="h1"
            text="Onboard developers in hours, not weeks."
            delay={0.18}
            className="mx-auto mt-6 max-w-[22ch] font-heading text-[clamp(1.5rem,3.4vw,2.35rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:mt-8"
          />

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
            className="mx-auto mt-5 max-w-md text-[16px] leading-[1.65] text-ink-tertiary sm:text-[17px]"
          >
            Reads your codebase, maps the architecture, and guides every new engineer with an AI mentor that never sleeps.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: EASE }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-btn bg-go px-6 py-3.5 text-[15px] font-semibold text-white shadow-lit transition-all hover:bg-go-lit hover:shadow-lift active:translate-y-px"
            >
              <span className="absolute inset-[-1px] -z-10 rounded-[inherit] bg-gradient-to-r from-go-lit to-mission opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative z-10 flex items-center gap-2">
                Start free
                <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/explore')}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-btn border border-seam-strong bg-panel-raised px-6 py-3.5 text-[15px] font-semibold text-ink transition-all hover:border-go/35 active:translate-y-px"
            >
              <span className="absolute inset-[-1px] -z-10 rounded-[inherit] bg-gradient-to-r from-go/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative z-10 flex items-center gap-2">
                <Play size={14} weight="fill" className="text-go" />
                Watch demo
              </span>
            </button>
          </motion.div>
        </div>

        {/* Full-bleed product plane */}
        <motion.div style={{ y: productY, scale: productScale }} className="relative z-10 mt-14 sm:mt-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px overflow-hidden">
            <div className="mkt-beam h-px w-full" />
          </div>
          <ProductStage />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-room"
            aria-hidden
          />
        </motion.div>
      </section>

      {/* ── Problem ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-6 pb-8 pt-24 lg:px-10">
        <motion.div {...fadeUp(0)} className="max-w-2xl">
          <p className="callsign text-go">The onboarding tax</p>
          <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
            New hires spend <span className="italic text-go">three weeks</span> lost in unfamiliar code.
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.3 }}
          className="mt-14 grid grid-cols-1 gap-0 border-t border-seam md:grid-cols-3"
        >
          {[
            {
              icon: UsersThree,
              title: 'Tribal knowledge',
              desc: 'Critical context lives in senior engineers’ heads — and walks out with them.',
            },
            {
              icon: FileText,
              title: 'Stale docs',
              desc: 'READMEs rot the day they’re written. Reality lives in the diff.',
            },
            {
              icon: ArrowsClockwise,
              title: 'Context switching',
              desc: 'Mentors lose hours every week answering the same architecture questions.',
            },
          ].map((c, i) => (
            <motion.div
              variants={item}
              key={c.title}
              className={`group border-seam py-8 md:px-8 ${i > 0 ? 'md:border-l' : ''} border-b md:border-b-0`}
            >
              <c.icon size={22} weight="duotone" className="text-go transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5" />
              <h3 className="mt-5 font-heading text-[18px] font-semibold text-ink">{c.title}</h3>
              <p className="mt-2 max-w-[32ch] text-[15px] leading-[1.6] text-ink-tertiary">{c.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <HowItWorks />
      <Features />
      <WhyOnramp />
      <TokenCraft />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  )
}

/* ── Cursor-tracked hero spotlight (brand hero) ────────────────────────── */
function HeroSpotlight({ heroRef }: { heroRef: React.RefObject<HTMLElement | null> }) {
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.35)
  const sx = useSpring(mx, { stiffness: 120, damping: 28, mass: 0.4 })
  const sy = useSpring(my, { stiffness: 120, damping: 28, mass: 0.4 })
  const x = useTransform(sx, (v) => `${v * 100}%`)
  const y = useTransform(sy, (v) => `${v * 100}%`)
  const bg = useMotionTemplate`radial-gradient(700px circle at ${x} ${y}, rgba(14,122,60,0.12), transparent 45%)`

  return (
    <motion.div
      onMouseMove={(e) => {
        const el = heroRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width)
        my.set((e.clientY - r.top) / r.height)
      }}
      className="pointer-events-none absolute inset-0 z-[15]"
      aria-hidden
      style={{ background: bg }}
    />
  )
}

/* ── Product stage (spotlight + live mock) ─────────────────────────────── */
function ProductStage() {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.35)
  const sx = useSpring(mx, { stiffness: 120, damping: 28, mass: 0.4 })
  const sy = useSpring(my, { stiffness: 120, damping: 28, mass: 0.4 })
  const spotlightX = useTransform(sx, (v) => `${v * 100}%`)
  const spotlightY = useTransform(sy, (v) => `${v * 100}%`)
  const spotlightBg = useMotionTemplate`radial-gradient(520px circle at ${spotlightX} ${spotlightY}, rgba(14,122,60,0.10), transparent 42%)`

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      initial={{ opacity: 0, y: 36 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.05, delay: 0.35, ease: EASE }}
      className="relative mx-auto max-w-[1280px] px-3 sm:px-6 lg:px-10"
    >
      <div className="relative overflow-hidden rounded-[6px] border border-seam bg-panel-raised/95 shadow-overhead mkt-reveal section-surface">
        <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between rounded-sm border border-seam bg-panel/80 px-3 py-2 backdrop-blur md:inset-x-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-go" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Mission control · live repo graph</span>
          </div>
          <span className="rounded-full border border-seam bg-white/70 px-2.5 py-1 text-[10px] font-medium text-ink-secondary">Updated 2m ago</span>
        </div>
        {/* Aceternity-style spotlight — soft, GO-tinted, mouse-led */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 mix-blend-multiply"
          style={{ background: spotlightBg }}
        />
        <DashboardMockup />
      </div>
    </motion.div>
  )
}

function DashboardMockup() {
  return (
    <div className="overflow-hidden bg-panel-raised">
      <div className="flex">
        <aside className="hidden w-[188px] shrink-0 flex-col gap-0.5 border-r border-seam bg-panel p-3 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-2 py-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-go text-white">
              <TreeStructure size={12} weight="bold" />
            </span>
            <span className="text-[13px] font-semibold text-ink">Onramp</span>
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
              className={`flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[12.5px] ${
                n.active ? 'bg-well font-medium text-go' : 'text-ink-tertiary'
              }`}
            >
              <n.icon size={14} weight={n.active ? 'fill' : 'regular'} />
              {n.label}
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-ink">Overview</div>
            <span className="hidden items-center gap-1.5 rounded-sm border border-seam px-2 py-1 text-[11px] text-ink-tertiary sm:inline-flex">
              <GithubLogo size={12} weight="fill" /> acme/platform
            </span>
          </div>

          <div className="mt-3 font-heading text-[15px] font-semibold text-ink">Good morning, Alex</div>
          <div className="text-[11px] text-ink-secondary">Here’s what’s happening with your codebase.</div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { k: 'Codebase health', v: '92%', t: 'Healthy', c: '#0E7A3C' },
              { k: 'Architecture score', v: '89/100', t: 'Good', c: '#0E7A3C' },
              { k: 'Active onboarding', v: '12', t: 'Engineers', c: '#B5710A' },
              { k: 'Questions answered', v: '1,248', t: 'This week', c: '#0E7A3C' },
            ].map((s, i) => (
              <motion.div
                key={s.k}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.85 + i * 0.07, ease: EASE }}
                className="rounded-sm border border-seam bg-panel-raised p-2.5"
              >
                <div className="text-[9.5px] text-ink-secondary">{s.k}</div>
                <div className="mt-1 text-[16px] font-semibold tabular-nums text-ink">{s.v}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[9px]" style={{ color: s.c }}>{s.t}</span>
                  <Sparkline color={s.c} />
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
            <div className="rounded-sm border border-seam bg-panel-raised p-2.5">
              <div className="text-[10px] font-medium text-ink-tertiary">Architecture map</div>
              <div className="relative mt-2 h-[92px]">
                {[
                  { l: 'Web App', s: 'Next.js', x: '2%', y: '8%' },
                  { l: 'API Gateway', s: 'Node.js', x: '38%', y: '4%' },
                  { l: 'Auth Service', s: 'Go', x: '74%', y: '2%' },
                  { l: 'User Service', s: 'Python', x: '74%', y: '38%' },
                  { l: 'Billing', s: 'Node.js', x: '74%', y: '72%' },
                ].map((n, i) => (
                  <motion.div
                    key={n.l}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.45, delay: 1.1 + i * 0.08, ease: EASE }}
                    className="absolute rounded-sm border border-seam bg-panel-raised px-1.5 py-1 shadow-seam"
                    style={{ left: n.x, top: n.y }}
                  >
                    <div className="text-[8px] font-semibold text-ink">{n.l}</div>
                    <div className="text-[7px] text-ink-tertiary">{n.s}</div>
                  </motion.div>
                ))}
                <motion.span
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute left-[24%] top-[62%] h-1.5 w-1.5 rounded-full bg-go"
                />
                <motion.span
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 2.2, delay: 0.7, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute left-[50%] top-[52%] h-1.5 w-1.5 rounded-full bg-go"
                />
              </div>
            </div>

            <div className="rounded-sm border border-seam bg-panel-raised p-2.5">
              <div className="text-[10px] font-medium text-ink-tertiary">Recent activity</div>
              <div className="mt-2 space-y-2">
                {[
                  { c: '#0E7A3C', t: 'New engineer onboarded', s: '2h ago' },
                  { c: '#0E7A3C', t: 'Codebase indexed', s: '5h ago' },
                  { c: '#B5710A', t: 'Architecture updated', s: '1d ago' },
                  { c: '#BE3A2E', t: 'Docs generated', s: '2d ago' },
                ].map((a, i) => (
                  <motion.div
                    key={a.t}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 1.2 + i * 0.06, ease: EASE }}
                    className="flex items-center gap-2"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.c }} />
                    <span className="min-w-0 flex-1 truncate text-[9px] text-ink-secondary">{a.t}</span>
                    <span className="text-[8px] text-ink-tertiary">{a.s}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-sm border border-seam bg-panel-raised p-2.5">
              <div className="text-[10px] font-medium text-ink-tertiary">Ask Onramp</div>
              <div className="mt-2 space-y-1.5">
                {['How does authentication work?', 'Where is billing handled?', 'Explain the data flow for orders'].map((q) => (
                  <div key={q} className="flex items-center justify-between rounded-sm border border-seam bg-panel px-2 py-1.5">
                    <span className="truncate text-[9px] text-ink-secondary">{q}</span>
                    <ArrowRight size={9} className="text-ink-disabled" />
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-sm bg-ink px-2 py-1.5">
                  <span className="text-[9px] text-white/55">Ask anything about your codebase…</span>
                  <PlusCircle size={11} weight="fill" className="text-go-lit" />
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
    <svg width="34" height="14" viewBox="0 0 34 14" fill="none" aria-hidden>
      <path
        d="M1 12 L7 8 L13 10 L19 5 L25 6 L33 1"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      icon: GitBranch,
      title: 'Connect your repo',
      desc: 'One-click GitHub install, read-only. Onramp indexes your codebase in minutes — no config, no agents to babysit.',
    },
    {
      n: '02',
      icon: MapTrifold,
      title: 'AI maps everything',
      desc: 'Architecture, ownership, and data flows become living docs and a dependency map that update on every push.',
    },
    {
      n: '03',
      icon: UsersThree,
      title: 'Engineers self-onboard',
      desc: 'Guided paths plus an AI mentor that answers from your real code — not a stale wiki.',
    },
  ]

  return (
    <section id="how" className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
      <motion.div {...fadeUp(0)} className="max-w-2xl">
        <p className="callsign text-go">How it works</p>
        <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
          From clone to first PR in <span className="italic text-go">three steps.</span>
        </h2>
        <p className="mt-4 max-w-lg text-[16px] leading-[1.65] text-ink-tertiary">
          No workshops. No shadowing marathons. An unfamiliar repository becomes a guided path.
        </p>
      </motion.div>

      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="whileInView"
        viewport={{ once: true, amount: 0.25 }}
        className="relative mt-14 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8"
      >
        <div className="pointer-events-none absolute left-[12%] right-[12%] top-[22px] hidden h-px bg-gradient-to-r from-transparent via-go/25 to-transparent md:block" />
        {steps.map((s) => (
          <motion.div variants={item} key={s.n} className="relative">
            <div className="relative z-10 rounded-[6px] border border-seam bg-panel-raised/90 p-5 shadow-seam">
              <div className="flex h-11 w-11 items-center justify-center rounded-sm border border-seam bg-panel shadow-seam">
                <s.icon size={20} weight="duotone" className="text-go" />
              </div>
              <p className="mt-5 font-mono text-[11px] font-medium tracking-[0.14em] text-ink-muted">{s.n}</p>
              <h3 className="mt-2 font-heading text-[18px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.65] text-ink-tertiary">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

/* ── Why Onramp vs coding agents & raw LLMs ────────────────────────────── */
function WhyOnramp() {
  const rows = [
    {
      icon: Cursor,
      tool: 'Cursor',
      job: 'Personal IDE agent',
      good: 'Writes and refactors code in your editor.',
      miss: 'Optimizes one engineer’s flow — not a team’s first 30 days.',
    },
    {
      icon: TerminalWindow,
      tool: 'Claude Code',
      job: 'Terminal coding agent',
      good: 'Autonomous edits across a local working tree.',
      miss: 'No living architecture map, ramp paths, or shared onboarding memory.',
    },
    {
      icon: Brain,
      tool: 'ChatGPT / Claude / Gemini',
      job: 'General LLM chat',
      good: 'Great at reasoning when you paste the right context.',
      miss: 'You become the indexer — paste files, burn tokens, lose grounding.',
    },
    {
      icon: TreeStructure,
      tool: 'Onramp',
      job: 'Team onboarding OS',
      good: 'Indexes once, maps architecture, mentors every hire from your real graph.',
      miss: 'Not a replacement for day-to-day coding in your IDE — it makes that IDE useful sooner.',
      ours: true,
    },
  ]

  return (
    <section id="why" className="border-y border-seam bg-panel">
      <div className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
        <motion.div {...fadeUp(0)} className="max-w-2xl">
          <p className="callsign text-go">Why Onramp</p>
          <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
            Coding agents write code. <span className="italic text-go">We make the codebase teachable.</span>
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-[1.65] text-ink-tertiary">
            Cursor and Claude Code are brilliant copilots for people who already know where to look.
            Onramp is for the weeks before that — when the map, the mentors, and the tribal knowledge are the bottleneck.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-14 overflow-hidden rounded-sm border border-seam bg-panel-raised"
        >
          <div className="overflow-x-auto">
            <table className="border-collapse text-left w-full table-auto">
              <thead>
                <tr className="border-b border-seam bg-well sticky top-0 z-10">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted align-middle">Tool</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted align-middle hidden md:table-cell">Built for</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted align-middle hidden md:table-cell">Where it shines</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted align-middle">The gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-seam">
                {rows.map((r) => (
                  <motion.tr
                    variants={item}
                    key={r.tool}
                    className={`${r.ours ? 'bg-go/[0.04]' : ''}`}
                  >
                    <td className="px-5 py-5 align-middle">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-sm ${
                            r.ours ? 'bg-go text-white' : 'bg-well text-ink-secondary'
                          }`}
                        >
                          <r.icon size={16} weight={r.ours ? 'bold' : 'duotone'} />
                        </span>
                        <span className={`font-heading text-[15px] font-semibold ${r.ours ? 'text-go' : 'text-ink'}`}>
                          {r.tool}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-5 align-middle hidden md:table-cell">
                      <p className="text-[14px] text-ink-secondary md:pt-1.5">{r.job}</p>
                    </td>
                    <td className="px-5 py-5 align-middle hidden md:table-cell">
                      <p className="text-[14px] leading-[1.55] text-ink-tertiary md:pt-1.5">{r.good}</p>
                    </td>
                    <td className={`px-5 py-5 align-middle ${r.ours ? 'text-ink-secondary' : 'text-ink-tertiary'}`}>
                      <p className="text-[14px] leading-[1.55] md:pt-1.5">{r.miss}</p>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.3 }}
          className="mt-10 grid grid-cols-1 gap-0 border-t border-seam md:grid-cols-3"
        >
          {[
            {
              title: 'Shared memory',
              desc: 'One indexed graph for the whole team — not twenty private chat threads that evaporate.',
            },
            {
              title: 'Grounded answers',
              desc: 'File and line citations from your repo. No vibes-based architecture advice.',
            },
            {
              title: 'Complementary, not competing',
              desc: 'Use Cursor to ship. Use Onramp so every new hire knows what to ship — and where.',
            },
          ].map((p) => (
            <motion.div variants={item} key={p.title} className="border-b border-seam py-7 md:border-b-0 md:border-r md:px-8 md:last:border-r-0 md:first:pl-0">
              <h3 className="font-heading text-[16px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 max-w-[34ch] text-[14.5px] leading-[1.6] text-ink-tertiary">{p.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ── Token craft — the real savings pipeline ───────────────────────────── */
function TokenCraft() {
  const stages = [
    {
      n: '01',
      icon: HardDrives,
      title: 'Parse once',
      desc: 'Clone and parse a repo keyed by HEAD. Persist a compact context document — entities, graph, stats — then reuse it everywhere.',
    },
    {
      n: '02',
      icon: Scissors,
      title: 'Slice to the task',
      desc: 'Agents never get the whole tree. Requirement-driven selection scores files and returns only the relevant slice.',
    },
    {
      n: '03',
      icon: ArrowsClockwise,
      title: 'Cache the answer',
      desc: 'Exact + semantic response cache. Near-duplicate questions hit Redis for $0 — no provider call, no input tokens.',
    },
    {
      n: '04',
      icon: Gauge,
      title: 'Enforce the budget',
      desc: 'Every slice is trimmed to a hard max_tokens ceiling before it ever reaches a model.',
    },
  ]

  return (
    <section id="tokens" className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
      <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <motion.div {...fadeUp(0)}>
          <p className="callsign text-go">Token craft</p>
          <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
            We don’t dump the repo into the prompt. <span className="italic text-go">That’s the whole game.</span>
          </h2>
          <p className="mt-4 max-w-lg text-[16px] leading-[1.65] text-ink-tertiary">
            Pasting half a monorepo into Cursor or a chat window feels powerful — until the bill arrives.
            Onramp’s pipeline is built to answer from a graph, not from a token firehose.
          </p>
        </motion.div>

        <motion.div
          {...fadeUp(0.08)}
          className="rounded-sm border border-seam bg-panel-raised p-5 shadow-seam sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="callsign text-ink-muted">Cost posture</span>
            <Coins size={16} weight="duotone" className="text-go" />
          </div>
          <ul className="mt-4 space-y-3">
            {[
              { k: 'Free-first routing', v: 'Reasoning & structured jobs prefer free providers before paid ones.' },
              { k: 'Semantic cache', v: 'Rephrasings of the same question skip the model entirely.' },
              { k: 'Local n-gram embeds', v: 'Cache probes never call an embedding API — that would cost more than it saves.' },
              { k: 'Index, don’t re-paste', v: 'One parse per commit. Every mentor question reuses it.' },
            ].map((row) => (
              <li key={row.k} className="flex gap-3 border-t border-seam pt-3 first:border-t-0 first:pt-0">
                <Path size={14} weight="bold" className="mt-1 shrink-0 text-go" />
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{row.k}</div>
                  <div className="mt-0.5 text-[13px] leading-[1.5] text-ink-tertiary">{row.v}</div>
                </div>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="whileInView"
        viewport={{ once: true, amount: 0.2 }}
        className="relative mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="pointer-events-none absolute left-[6%] right-[6%] top-[22px] hidden h-px bg-gradient-to-r from-transparent via-go/20 to-transparent lg:block" />
        {stages.map((s, i) => (
          <motion.div variants={item} key={s.n} className="relative">
            <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-sm border border-seam bg-panel-raised shadow-seam">
              <s.icon size={18} weight="duotone" className="text-go" />
            </div>
            <p className="mt-5 font-mono text-[11px] tracking-[0.14em] text-ink-muted">STAGE {s.n}</p>
            <h3 className="mt-1.5 font-heading text-[17px] font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-[14px] leading-[1.6] text-ink-tertiary">{s.desc}</p>
            {i < stages.length - 1 && (
              <span className="absolute -right-3 top-[18px] hidden text-ink-disabled lg:block" aria-hidden>
                →
              </span>
            )}
          </motion.div>
        ))}
      </motion.div>

      <motion.p
        {...fadeUp(0.1)}
        className="mt-12 max-w-2xl text-[14px] leading-[1.65] text-ink-muted"
      >
        The result: fewer tokens per question, faster answers for the tenth engineer asking the same thing,
        and a platform bill that scales with understanding — not with how many times someone pastes{' '}
        <span className="font-mono text-[12.5px] text-ink-secondary">src/</span> into a chat box.
      </motion.p>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="border-y border-seam bg-well">
      <div className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
        <motion.div {...fadeUp(0)} className="max-w-2xl">
          <p className="callsign text-go">Features</p>
          <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
            One system that <span className="italic text-go">actually knows</span> your code.
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.12 }}
          className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-6"
        >
          <motion.div variants={item} className="md:col-span-4">
            <FeatureCard
              icon={MapTrifold}
              tag="Live architecture"
              title="A map that never goes stale"
              desc="Every service, dependency, and data flow as an interactive graph — regenerated on each push."
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
                  <div key={n.l} className="rounded-sm border border-seam bg-panel-raised px-3 py-2">
                    <div className="text-[12px] font-semibold text-ink">{n.l}</div>
                    <div className="text-[10px] text-ink-disabled">{n.s}</div>
                  </div>
                ))}
              </div>
            </FeatureCard>
          </motion.div>

          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard
              icon={ChatCircleDots}
              tag="AI mentor"
              title="Ask anything"
              desc="Answers grounded in your code, with file references."
            >
              <div className="mt-4 space-y-2">
                <div className="rounded-sm bg-panel-raised px-3 py-2 text-[12px] text-ink-secondary shadow-seam">
                  How does auth work?
                </div>
                <div className="rounded-sm bg-well px-3 py-2 text-[12px] leading-[1.5] text-ink-secondary">
                  Sessions are issued in <span className="font-medium text-ink">auth/session.go:42</span> and verified by middleware.
                </div>
              </div>
            </FeatureCard>
          </motion.div>

          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard icon={BookOpenText} tag="Living docs" title="Docs that write themselves" desc="Onboarding guides and READMEs generated from source and kept in sync." />
          </motion.div>
          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard icon={Lightning} tag="Guided paths" title="A path per engineer" desc="Role-aware checklists that adapt to seniority and the team they’re joining." />
          </motion.div>
          <motion.div variants={item} className="md:col-span-2">
            <FeatureCard icon={ChartLineUp} tag="Insights" title="Measure ramp-up" desc="Time-to-first-PR, health scores, and where new hires get stuck — per team." />
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
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[6px] border border-seam bg-panel-raised p-6 shadow-seam transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-go/30 hover:shadow-lift">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-go/0 via-go/50 to-go/0" />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-well text-go transition-colors duration-300 group-hover:bg-go group-hover:text-white">
          <Icon size={16} weight="duotone" />
        </span>
        <span className="callsign text-ink-disabled">{tag}</span>
      </div>
      <h3 className="mt-4 font-heading text-[18px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-ink-tertiary">{desc}</p>
      {children}
    </div>
  )
}

const STARTER_FEATURES = ['1 repository', 'Live architecture map', 'AI mentor — 100 questions / mo', 'Auto-generated docs', 'Community support']
const TEAM_FEATURES = ['Unlimited repositories', 'Unlimited AI mentor', 'Guided onboarding paths', 'Ramp-up & time-to-PR insights', 'GitHub, Slack & Linear sync', 'Priority support']
const ENTERPRISE_FEATURES = ['SSO / SAML & SCIM provisioning', 'Self-hosted or private cloud', 'Audit logs & SOC 2 Type II', 'Dedicated success engineer', 'Custom onboarding modules', '99.9% uptime SLA']

type Currency = 'USD' | 'INR'

const PRICES: Record<Currency, { sym: string; monthly: number; annual: number; roi: string }> = {
  USD: { sym: '$', monthly: 99, annual: 82, roi: '$8,000' },
  INR: { sym: '\u20B9', monthly: 2999, annual: 2499, roi: '\u20B96,00,000' },
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
    <section id="pricing" className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
      <motion.div {...fadeUp(0)} className="mx-auto max-w-2xl text-center">
        <p className="callsign text-go">Pricing</p>
        <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
          One flat price. Your <span className="italic text-go">whole team.</span>
        </h2>
        <p className="mt-4 text-[16px] leading-[1.65] text-ink-tertiary">
          No per-seat math. Every engineer can ask, explore, and onboard.
        </p>
      </motion.div>

      <motion.p
        {...fadeUp(0.06)}
        className="mx-auto mt-6 max-w-xl text-center text-[13.5px] text-ink-secondary"
      >
        One slow onboarding costs <span className="font-semibold text-ink">~{c.roi}</span>. Onramp starts at {c.sym}
        {fmt(c.annual)}/mo.
      </motion.p>

      <motion.div {...fadeUp(0.1)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Segmented
          options={['Monthly', 'Annual']}
          value={annual ? 'Annual' : 'Monthly'}
          onChange={(v) => setAnnual(v === 'Annual')}
          pillId="billpill"
        />
        <span className="inline-flex items-center gap-1 rounded-sm bg-well px-2.5 py-1 text-[12px] font-semibold text-go">
          <Sparkle size={11} weight="fill" /> 2 months free
        </span>
        <span className="hidden h-5 w-px bg-seam sm:block" />
        <Segmented
          options={['USD', 'INR']}
          value={currency}
          onChange={(v) => setCurrency(v as Currency)}
          pillId="curpill"
        />
      </motion.div>

      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="whileInView"
        viewport={{ once: true, amount: 0.15 }}
        className="mt-12 grid grid-cols-1 items-start gap-4 md:grid-cols-3"
      >
        <motion.div variants={item}>
          <PlanCard name="Free" blurb="For a solo dev getting the lay of the land.">
            <div className="flex items-baseline gap-1">
              <span className="mt-1 self-start font-display text-[22px] text-ink">{c.sym}</span>
              <span className="font-display text-[52px] leading-none tracking-tight text-ink">0</span>
              <span className="ml-1 text-[13px] text-ink-disabled">forever</span>
            </div>
            <p className="mt-3 h-[18px] text-[13px] text-ink-disabled">No card required.</p>
            <PlanCTA href="/register" variant="ghost">Start free</PlanCTA>
            <FeatureList items={STARTER_FEATURES} />
          </PlanCard>
        </motion.div>

        <motion.div variants={item} className="md:-mt-3">
          <PlanCard name="Team" blurb="Everything your team needs to onboard fast." featured>
            <div className="flex items-baseline gap-1">
              <span className="mt-1 self-start font-display text-[22px] text-ink">{c.sym}</span>
              <span className="relative inline-flex h-[52px] items-end overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={`${currency}-${teamPrice}`}
                    initial={{ y: '60%', opacity: 0 }}
                    animate={{ y: '0%', opacity: 1 }}
                    exit={{ y: '-60%', opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className="font-display text-[52px] leading-none tracking-tight text-ink tabular-nums"
                  >
                    {fmt(teamPrice)}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="ml-1 text-[13px] text-ink-tertiary">/ mo</span>
            </div>
            <p className="mt-3 h-[18px] text-[13px] text-ink-muted">
              {annual ? (
                <>
                  <span className="text-ink-disabled line-through">{c.sym}{fmt(c.monthly)}</span> billed annually · unlimited engineers
                </>
              ) : (
                'per workspace · unlimited engineers'
              )}
            </p>
            <PlanCTA href="/register" variant="solid">Start 14-day trial</PlanCTA>
            <FeatureList items={TEAM_FEATURES} inherit="Everything in Free, plus" featured />
          </PlanCard>
        </motion.div>

        <motion.div variants={item}>
          <PlanCard name="Enterprise" blurb="For orgs that need control, security, and scale.">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[44px] leading-none tracking-tight text-ink sm:text-[52px]">Custom</span>
            </div>
            <p className="mt-3 h-[18px] text-[13px] text-ink-disabled">Volume &amp; fresher-batch pricing.</p>
            <PlanCTA href="#contact" variant="ghost">Contact sales</PlanCTA>
            <FeatureList items={ENTERPRISE_FEATURES} inherit="Everything in Team, plus" />
          </PlanCard>
        </motion.div>
      </motion.div>

      <motion.div
        {...fadeUp(0.1)}
        className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] font-medium text-ink-muted"
      >
        {['14-day trial on Team', 'No credit card to start', 'Cancel anytime', 'SOC 2 Type II'].map((t) => (
          <span key={t} className="inline-flex items-center gap-2">
            <Check size={13} weight="bold" className="text-go" />
            {t}
          </span>
        ))}
      </motion.div>
    </section>
  )
}

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
    <div className="relative flex items-center rounded-sm border border-seam bg-panel-raised p-1 shadow-seam">
      {options.map((label) => {
        const active = value === label
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(label)}
            className={`relative z-10 rounded-sm px-5 py-1.5 text-[13.5px] font-medium transition-colors ${
              active ? 'text-ink' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 -z-10 rounded-sm bg-well shadow-[inset_0_0_0_1px_rgba(24,27,24,.06)]"
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
      className={`relative flex h-full flex-col overflow-hidden rounded-[6px] p-7 transition-all duration-300 ${
        featured
          ? 'border border-go/35 bg-panel-raised shadow-[0_24px_60px_-28px_rgba(14,122,60,.45)] hover:-translate-y-0.5'
          : 'border border-seam bg-panel-raised/80 shadow-seam hover:-translate-y-0.5 hover:bg-panel-raised hover:shadow-lift'
      }`}
    >
      {featured && (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-1 -z-10 rounded-[5px] bg-gradient-to-r from-go/25 via-mission/15 to-transparent opacity-50 blur-2xl"
            animate={{ opacity: [0.35, 0.7, 0.35] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="absolute inset-x-0 top-0 h-0.5 bg-go" />
          <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-sm bg-go/10 px-2 py-1 text-[11px] font-semibold text-go">
            <Sparkle size={11} weight="fill" /> Recommended
          </span>
        </>
      )}
      <div className="callsign text-ink-muted">{name}</div>
      <p className="mt-1.5 min-h-[38px] max-w-[220px] text-[13.5px] leading-[1.5] text-ink-tertiary">{blurb}</p>
      <div className="mt-5">{children}</div>
    </div>
  )
}

function PlanCTA({ href, variant, children }: { href: string; variant: 'solid' | 'ghost'; children: React.ReactNode }) {
  return (
    <Link
      to={href}
      className={`mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-btn px-6 py-3 text-[15px] font-semibold transition-all active:translate-y-px ${
        variant === 'solid'
          ? 'bg-ink text-white shadow-lit hover:bg-black'
          : 'border border-seam bg-panel-raised text-ink hover:border-seam-strong hover:bg-panel'
      }`}
    >
      {children}
      <ArrowRight size={15} weight="bold" />
    </Link>
  )
}

function FeatureList({ items, inherit, featured = false }: { items: string[]; inherit?: string; featured?: boolean }) {
  return (
    <ul className="mt-7 space-y-3 border-t border-seam pt-6">
      {inherit && <li className="pb-1 text-[13px] font-semibold text-ink">{inherit}</li>}
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-[14px] leading-[1.4] text-ink-secondary">
          <span
            className={`mt-px flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full ${
              featured ? 'bg-go text-white' : 'bg-well text-go'
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

function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  const faqs = [
    { q: 'How is Onramp different from Cursor or Claude Code?', a: 'Those tools are personal coding agents — they help an engineer who already knows the repo write and edit code faster. Onramp is a team onboarding OS: it indexes your architecture once, keeps living docs in sync, and gives every new hire a grounded mentor plus guided paths. Use them together — Onramp gets people productive; Cursor ships the work.' },
    { q: 'How do you keep token costs down?', a: 'Four stages: parse the repo once per commit into a compact context graph; slice only the files needed for each task; serve exact and near-duplicate answers from a semantic cache (zero provider tokens); and enforce a hard max_tokens budget on every prompt. Reasoning jobs also prefer free providers before paid ones.' },
    { q: 'How long does setup take?', a: 'Under two minutes. Install the GitHub app, pick a repository, and Onramp indexes it in the background. You get a live architecture map and docs before your coffee cools.' },
    { q: 'Is my source code stored anywhere?', a: 'No. Onramp reads your code to build an analysis graph and metadata, then discards the raw source. Nothing is used to train shared models. Self-hosting is available on Enterprise.' },
    { q: 'Which languages are supported?', a: 'TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Kotlin, Swift, plus config, SQL, and Markdown. New languages ship continuously.' },
    { q: 'How does the AI mentor stay accurate?', a: 'Every answer is grounded in your indexed code with file and line references, and the index refreshes on each push, so answers track the codebase instead of a stale wiki.' },
    { q: 'Can I roll it out to my whole org?', a: 'Yes. Team and Enterprise plans support SSO/SAML, SCIM provisioning, per-team onboarding paths, and ramp-up analytics across every repository.' },
  ]

  return (
    <section id="faq" className="border-t border-seam bg-well">
      <div className="mx-auto max-w-[780px] px-6 py-24 lg:px-10">
        <motion.div {...fadeUp(0)} className="text-center">
          <p className="callsign text-go">FAQ</p>
          <h2 className="mt-4 font-display text-[clamp(1.85rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-ink">
            Questions, <span className="italic text-go">answered.</span>
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.12 }}
          className="mt-12 space-y-2"
        >
          {faqs.map((f, i) => {
            const isOpen = open === i
            return (
              <motion.div
                variants={item}
                key={f.q}
                className={`overflow-hidden rounded-sm border bg-panel-raised transition-[border-color,box-shadow] duration-300 ${
                  isOpen ? 'border-go/30 shadow-lift' : 'border-seam shadow-seam'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
                >
                  <span className="text-[15px] font-medium text-ink sm:text-[16px]">{f.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition-all duration-300 ease-out-back ${
                      isOpen ? 'rotate-45 bg-go text-white' : 'bg-well text-go'
                    }`}
                  >
                    <Plus size={14} weight="bold" />
                  </span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-[15px] leading-[1.65] text-ink-tertiary sm:px-6">{f.a}</p>
                </motion.div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
      <motion.div {...fadeUp(0)} className="console-panel py-16 text-center sm:py-20">
        <div className="mx-auto max-w-2xl">
          <span className="callsign text-go">Ready when you are</span>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.06] tracking-[-0.02em] text-ink">
            Ship your next hire&rsquo;s first PR <span className="italic text-go">this week.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-body-lg text-ink-tertiary">
            Turn onboarding from weeks of shadowing into a guided, self-serve path — grounded in your real code.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="btn btn-primary">
              Start free
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link to="/explore" className="btn btn-secondary">
              <Play size={15} weight="fill" />
              Watch demo
            </Link>
          </div>
          <p className="mt-6 text-caption text-ink-muted">No credit card required · 2-minute setup</p>
        </div>
      </motion.div>
    </section>
  )
}

const FOOTER_LINK_TO: Record<string, string> = {
  Features: '#features',
  'Why Onramp': '#why',
  'Token craft': '#tokens',
  'How it works': '#how',
  Pricing: '/pricing',
  Changelog: '/changelog',
  Docs: '/docs',
  Documentation: '/docs',
  Privacy: '/privacy',
  Terms: '/terms',
  About: '/about',
  Blog: '/blog',
  Careers: '/careers',
  Customers: '/customers',
  Contact: '/contact',
  Security: '/security',
  DPA: '/dpa',
  'SOC 2': '/soc-2',
}

function Footer() {
  const cols = [
    { h: 'Product', links: ['Features', 'Why Onramp', 'Token craft', 'How it works', 'Pricing'] },
    { h: 'Company', links: ['About', 'Blog', 'Careers', 'Customers', 'Contact'] },
    { h: 'Resources', links: ['Documentation', 'API reference', 'Guides', 'Status', 'Community'] },
    { h: 'Legal', links: ['Privacy', 'Terms', 'Security', 'DPA', 'SOC 2'] },
  ]

  return (
    <footer className="relative border-t border-seam bg-room">
      <div className="mx-auto max-w-[1120px] px-6 py-16 lg:px-10">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-go text-white">
                <TreeStructure size={15} weight="bold" />
              </span>
              <span className="font-heading text-[17px] font-semibold tracking-tight text-ink">Onramp</span>
            </Link>
            <p className="mt-4 max-w-[240px] text-[14px] leading-[1.6] text-ink-tertiary">
              AI-powered developer onboarding. Understand any codebase in hours, not weeks.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[
                { Icon: GithubLogo, url: 'https://github.com/onramp', label: 'GitHub' },
                { Icon: XLogo, url: 'https://x.com/onramp', label: 'X (Twitter)' },
                { Icon: LinkedinLogo, url: 'https://linkedin.com/company/onramp', label: 'LinkedIn' },
              ].map(({ Icon, url, label }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-sm border border-seam bg-panel-raised text-ink-secondary transition-all duration-300 hover:border-transparent hover:bg-go hover:text-white"
                >
                  <Icon size={16} weight="fill" />
                </a>
              ))}
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.h}>
              <h3 className="callsign text-ink-disabled">{c.h}</h3>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => {
                  const to = FOOTER_LINK_TO[l]
                  if (to?.startsWith('/')) {
                    return (
                      <li key={l}>
                        <Link to={to} className="text-[14px] text-ink-tertiary transition-colors hover:text-ink">
                          {l}
                        </Link>
                      </li>
                    )
                  }
                  if (to?.startsWith('#')) {
                    return (
                      <li key={l}>
                        <a href={to} className="text-[14px] text-ink-tertiary transition-colors hover:text-ink">
                          {l}
                        </a>
                      </li>
                    )
                  }
                  return (
                    <li key={l}>
                      <span className="text-[14px] text-ink-tertiary/50">{l}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-seam pt-8 sm:flex-row">
          <p className="text-[13px] text-ink-disabled">
            {'\u00A9'} {new Date().getFullYear()} Onramp, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-[13px] text-ink-tertiary">
            <span className="h-1.5 w-1.5 rounded-full bg-go" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  )
}
