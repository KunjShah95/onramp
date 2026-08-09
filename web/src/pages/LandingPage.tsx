import { useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from 'framer-motion'
import {
  ArrowRight,
  GithubLogo,
  TreeStructure,
  MagnifyingGlass,
  CheckCircle,
  Cube,
} from '@phosphor-icons/react'
import { HeroLockup } from '../components/ui/first-principles'

/* ─────────────────────────────────────────────────────────────────────────
 * Landing — first principles, second pass
 *
 * Removed "AI slop": mentor previews, "3 weeks → 3 days" invented metric,
 * "Three instruments" hyperbole, fake "1,248 questions" sparkline, "All
 * systems operational" footer pill, brand-name-as-h1.
 *
 * Honest pitch: Onramp reads your repo, draws the architecture map, and
 * lets new hires navigate services from day one. Show the map, name the
 * surface, then exit.
 * ───────────────────────────────────────────────────────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const

const NAV_LINKS = [
  { label: 'What it does', href: '#what-it-does' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 0.65, delay, ease: EASE },
})

export default function LandingPage() {
  return (
    <>
      <HeroLockup
        links={NAV_LINKS}
        cta={{ label: 'Get the dashboard', href: '/register' }}
        ghost={{ label: 'Log in', href: '/login' }}
        hero={<Hero />}
      />

      {/* ── Section 2 — what it does (concrete, not aspirational) ─────── */}
      <section id="what-it-does" className="bg-base">
        <div className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
          <motion.div {...fadeUp(0)} className="max-w-2xl">
            <p className="callsign text-go">What it does</p>
            <h2 className="mt-4 font-display text-display-lg leading-[1.08] tracking-[-0.02em] text-ink">
              An architecture map of your repo, drawn from the code.
            </h2>
            <p className="mt-4 max-w-lg text-body-lg text-ink-tertiary">
              Onramp parses your services, dependencies, and ownership from source.
              The map is the source of truth — read it, search it, link to it from your docs.
            </p>
          </motion.div>

          <div className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-6">
            <FeatureCard
              className="md:col-span-4"
              icon={TreeStructure}
              tag="MAP"
              title="Services, dependencies, ownership."
              body="Hover any node to see who owns it, what calls it, and which commits last touched it."
            >
              <MapPreview />
            </FeatureCard>

            <FeatureCard
              className="md:col-span-2"
              icon={MagnifyingGlass}
              tag="SEARCH"
              title="Find a service by what it does."
              body="Search by behaviour, not by filename. Queries run against the parsed graph, not a text index."
            >
              <SearchPreview />
            </FeatureCard>

            <FeatureCard
              className="md:col-span-2"
              icon={Cube}
              tag="EXPORT"
              title="Link to it from anywhere."
              body="Permalink every node. Embed in docs, Slack, Linear. Engineers stop asking where the map lives."
            />
            <FeatureCard
              className="md:col-span-2"
              icon={CheckCircle}
              tag="FRESHMNESS"
              title="Redrawn on every push."
              body="A GitHub App indexes on commit. The map you link to next week is the map of next week's code."
            />
            <FeatureCard
              className="md:col-span-2"
              icon={GithubLogo}
              tag="INSTALL"
              title="Two minutes to set up."
              body="Install the GitHub App, pick a repository. No code changes, no agent, no SDK."
            />
          </div>
        </div>
      </section>

      {/* ── Section 3 — how it works (one honest sequence) ─────────────── */}
      <section id="how-it-works" className="border-t border-seam bg-panel">
        <div className="mx-auto max-w-[1120px] px-6 py-24 lg:px-10">
          <motion.div {...fadeUp(0)} className="max-w-2xl">
            <p className="callsign text-go">How it works</p>
            <h2 className="mt-4 font-display text-display-lg leading-[1.08] tracking-[-0.02em] text-ink">
              Install. Index. Read.
            </h2>
          </motion.div>

          <ol className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                n: '01',
                title: 'Install the GitHub App',
                body: 'Pick a repo. We request read-only access. No write, no webhook sprawl.',
              },
              {
                n: '02',
                title: 'Index in the background',
                body: 'First index takes 2–10 minutes depending on repo size. Subsequent indexes run on push.',
              },
              {
                n: '03',
                title: 'Read the map',
                body: 'Open the dashboard. Pin the map to your team wiki. New hires stop asking seniors.',
              },
            ].map((step, i) => (
              <motion.li key={step.n} {...fadeUp(i * 0.08)}
                className="rounded-card border border-seam bg-panel-raised p-6 shadow-seam">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-tertiary">
                    STEP {step.n}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-go-lit" />
                </div>
                <h3 className="mt-4 font-display text-display-xs font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-body-sm leading-[1.6] text-ink-tertiary">{step.body}</p>
              </motion.li>
            ))}
          </ol>

          <motion.div {...fadeUp(0.2)} className="mt-14 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-btn bg-go px-6 py-3.5 text-body font-semibold text-white shadow-lit transition-all hover:bg-go-lit hover:shadow-lift active:translate-y-px"
            >
              Get the dashboard
              <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-btn border border-seam-strong bg-panel px-6 py-3.5 text-body font-semibold text-ink transition-all hover:border-go/40 active:translate-y-px"
            >
              See pricing
            </Link>
            <span className="text-caption text-ink-muted sm:ml-2">
              14-day Team trial · no credit card
            </span>
          </motion.div>
        </div>
      </section>

      <Footer />
    </>
  )
}

/* ── Hero — full-bleed product plane ─────────────────────────────────── */
function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const productY = useTransform(scrollYProgress, [0, 1], [0, 60])
  const productScale = useTransform(scrollYProgress, [0, 1], [1, 0.99])

  return (
    <section ref={ref} className="relative overflow-hidden bg-base pt-28 pb-0 sm:pt-32">
      {/* Grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-20 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.7\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-[920px] px-6 text-center lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
          className="mx-auto inline-flex items-center gap-2 rounded-sm border border-seam bg-panel-raised px-3 py-1.5 shadow-seam"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-go motion-safe:animate-pulse-glow" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">
            Onramp · live architecture map
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: EASE }}
          className="mt-7 font-display font-extrabold leading-[0.96] tracking-[-0.035em] text-ink text-[clamp(2.5rem,8vw,5.5rem)]"
        >
          Read the code.
          <br />
          <span className="text-ink-tertiary">Not the docs.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
          className="mx-auto mt-6 max-w-xl font-heading text-[clamp(1.2rem,2.2vw,1.6rem)] font-semibold leading-[1.18] tracking-[-0.015em] text-ink"
        >
          A live map of your services, drawn from source.
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
          className="mx-auto mt-5 max-w-md text-body-lg text-ink-tertiary"
        >
          Onramp parses your repo, indexes services and dependencies, and keeps
          the map fresh on every push. New hires stop asking seniors.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7, ease: EASE }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/register"
            className="group inline-flex items-center gap-2 rounded-btn bg-go px-6 py-3.5 text-body font-semibold text-white shadow-lit transition-all hover:bg-go-lit hover:shadow-lift active:translate-y-px"
          >
            Get the dashboard
            <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-btn border border-seam-strong bg-panel-raised px-6 py-3.5 text-body font-semibold text-ink transition-all hover:border-go/40 active:translate-y-px"
          >
            See pricing
          </Link>
        </motion.div>
      </div>

      <motion.div style={{ y: productY, scale: productScale }} className="relative z-10 mt-16 sm:mt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px overflow-hidden">
          <div className="h-px w-full bg-go/30" />
        </div>
        <ProductStage />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-base" aria-hidden />
      </motion.div>
    </section>
  )
}

/* ── Cursor-tracked spotlight on the product plane ─────────────────────── */
function ProductStage() {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.35)
  const sx = useSpring(mx, { stiffness: 120, damping: 28, mass: 0.4 })
  const sy = useSpring(my, { stiffness: 120, damping: 28, mass: 0.4 })
  const x = useTransform(sx, (v) => `${v * 100}%`)
  const y = useTransform(sy, (v) => `${v * 100}%`)
  const spotlightBg = useMotionTemplate`radial-gradient(520px circle at ${x} ${y}, rgba(14,122,60,0.10), transparent 42%)`

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
      <div className="relative overflow-hidden rounded-[6px] border border-seam bg-panel-raised/95 shadow-overhead">
        <div className="absolute inset-x-4 top-4 z-20 flex items-center justify-between rounded-sm border border-seam bg-panel/85 px-3 py-2 backdrop-blur md:inset-x-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-go" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Architecture map
            </span>
          </div>
          <span className="rounded-sm border border-seam bg-white/70 px-2.5 py-1 text-[10px] font-medium text-ink-secondary">
            Demo repo
          </span>
        </div>
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
            { icon: TreeStructure, label: 'Map', active: true },
            { icon: MagnifyingGlass, label: 'Search' },
            { icon: Cube, label: 'Services' },
            { icon: GithubLogo, label: 'Repos' },
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
            <div className="text-[13px] font-semibold text-ink">Architecture map</div>
            <span className="hidden items-center gap-1.5 rounded-sm border border-seam px-2 py-1 text-[11px] text-ink-tertiary sm:inline-flex">
              <GithubLogo size={12} weight="fill" /> acme/platform
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
            <div className="rounded-sm border border-seam bg-panel-raised p-2.5 lg:col-span-2">
              <div className="text-[10px] font-medium text-ink-tertiary">Services</div>
              <div className="relative mt-2 h-[180px]">
                {[
                  { l: 'Web App', s: 'Next.js', x: '2%', y: '8%' },
                  { l: 'API Gateway', s: 'Node.js', x: '38%', y: '4%' },
                  { l: 'Auth Service', s: 'Go', x: '74%', y: '2%' },
                  { l: 'User Service', s: 'Python', x: '74%', y: '38%' },
                  { l: 'Billing', s: 'Node.js', x: '74%', y: '72%' },
                  { l: 'Postgres', s: 'Database', x: '38%', y: '72%' },
                ].map((n) => (
                  <div
                    key={n.l}
                    className="absolute rounded-sm border border-seam bg-panel-raised px-1.5 py-1 shadow-seam"
                    style={{ left: n.x, top: n.y }}
                  >
                    <div className="text-[8px] font-semibold text-ink">{n.l}</div>
                    <div className="text-[7px] text-ink-tertiary">{n.s}</div>
                  </div>
                ))}
                <svg className="absolute inset-0 h-full w-full" aria-hidden>
                  <line x1="14%" y1="14%" x2="44%" y2="10%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
                  <line x1="44%" y1="10%" x2="80%" y2="8%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
                  <line x1="80%" y1="8%" x2="80%" y2="44%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
                  <line x1="80%" y1="44%" x2="80%" y2="78%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
                  <line x1="80%" y1="78%" x2="44%" y2="78%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
                </svg>
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
              <div className="text-[10px] font-medium text-ink-tertiary">Service details</div>
              <div className="mt-2 space-y-1.5">
                <div className="text-[9px] text-ink-secondary">
                  <span className="text-ink-tertiary">owner</span>{' '}
                  <span className="font-mono">@platform-team</span>
                </div>
                <div className="text-[9px] text-ink-secondary">
                  <span className="text-ink-tertiary">calls</span>{' '}
                  <span className="font-mono">auth, billing, postgres</span>
                </div>
                <div className="text-[9px] text-ink-secondary">
                  <span className="text-ink-tertiary">called by</span>{' '}
                  <span className="font-mono">web-app, mobile</span>
                </div>
                <div className="text-[9px] text-ink-secondary">
                  <span className="text-ink-tertiary">last commit</span>{' '}
                  <span className="font-mono">3h ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Feature card ─────────────────────────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  tag,
  title,
  body,
  children,
  className,
}: {
  icon: typeof TreeStructure
  tag: string
  title: string
  body: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-[6px] border border-seam bg-panel-raised p-6 shadow-seam transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-go/30 hover:shadow-lift ${className ?? ''}`}
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-go/0 via-go/50 to-go/0" />
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-well text-go transition-colors duration-300 group-hover:bg-go group-hover:text-white">
          <Icon size={16} weight="duotone" />
        </span>
        <span className="callsign text-ink-disabled">{tag}</span>
      </div>
      <h3 className="mt-4 font-heading text-display-xs font-bold text-ink">{title}</h3>
      <p className="mt-2 max-w-[34ch] text-body-sm leading-[1.6] text-ink-tertiary">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

/* ── Map preview (inside big feature card) ────────────────────────────── */
function MapPreview() {
  const nodes = [
    { l: 'Web App', s: 'Next.js', x: '2%', y: '8%' },
    { l: 'API Gateway', s: 'Node.js', x: '38%', y: '4%' },
    { l: 'Auth Service', s: 'Go', x: '74%', y: '2%' },
    { l: 'User Service', s: 'Python', x: '74%', y: '38%' },
    { l: 'Billing', s: 'Node.js', x: '74%', y: '72%' },
    { l: 'Postgres', s: 'Database', x: '38%', y: '72%' },
  ]
  return (
    <div className="relative h-[180px] overflow-hidden rounded-sm border border-seam bg-panel">
      {nodes.map((n) => (
        <div
          key={n.l}
          className="absolute rounded-sm border border-seam bg-panel-raised px-2 py-1 shadow-seam"
          style={{ left: n.x, top: n.y }}
        >
          <div className="text-[10px] font-semibold text-ink">{n.l}</div>
          <div className="text-[9px] text-ink-tertiary">{n.s}</div>
        </div>
      ))}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <line x1="14%" y1="14%" x2="44%" y2="10%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
        <line x1="44%" y1="10%" x2="80%" y2="8%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
        <line x1="80%" y1="8%" x2="80%" y2="44%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
        <line x1="80%" y1="44%" x2="80%" y2="78%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
        <line x1="80%" y1="78%" x2="44%" y2="78%" stroke="rgb(var(--border-rgb) / 0.35)" strokeDasharray="2 3" />
      </svg>
    </div>
  )
}

/* ── Search preview (inside small feature card) ───────────────────────── */
function SearchPreview() {
  return (
    <div className="space-y-2">
      <div className="rounded-sm bg-panel px-3 py-2 font-mono text-caption text-ink-secondary shadow-seam border border-seam">
        where does billing run?
      </div>
      <div className="rounded-sm bg-well px-3 py-2 text-caption leading-[1.5] text-ink-secondary">
        <span className="font-mono text-ink">Billing</span> · Node.js ·{' '}
        <span className="font-mono text-ink-secondary">services/billing/</span>
      </div>
    </div>
  )
}

/* ── Footer — single row, no fake status pill ─────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-seam bg-room">
      <div className="mx-auto flex max-w-[1120px] flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center lg:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-go text-white">
            <TreeStructure size={13} weight="bold" />
          </span>
          <span className="font-heading text-body-sm font-semibold text-ink">Onramp</span>
          <span className="ml-3 text-caption text-ink-muted">
            © {new Date().getFullYear()} Onramp, Inc.
          </span>
        </div>
        <div className="flex items-center gap-5 text-caption text-ink-tertiary">
          <Link to="/pricing" className="hover:text-ink">Pricing</Link>
          <Link to="/docs" className="hover:text-ink">Docs</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <Link to="/terms" className="hover:text-ink">Terms</Link>
        </div>
      </div>
    </footer>
  )
}
