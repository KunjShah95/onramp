import { Link } from 'react-router-dom'
import {
  TreeStructure,
  GithubLogo,
  XLogo,
  LinkedinLogo,
  DiscordLogo,
  ArrowUp,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { prefetchProps } from '../../lib/prefetch'

interface FooterLink {
  label: string
  href: string
}

interface FooterColumn {
  title: string
  links: FooterLink[]
}

/* Four sitemap columns — every link maps to a real public route. */
const COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Architecture map', href: '/#the-map' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Why Onramp', href: '/why-onramp' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Customers', href: '/customers' },
      { label: 'Blog', href: '/blog' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Support', href: '/support' },
      { label: 'Security', href: '/security' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'DPA', href: '/dpa' },
      { label: 'SOC 2', href: '/soc-2' },
    ],
  },
]

const SOCIALS: { label: string; href: string; Icon: Icon }[] = [
  { label: 'GitHub', href: 'https://github.com/onramp', Icon: GithubLogo },
  { label: 'X', href: 'https://x.com/onramp', Icon: XLogo },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/onramp', Icon: LinkedinLogo },
  { label: 'Discord', href: 'https://discord.gg/onramp', Icon: DiscordLogo },
]

/**
 * Shared public footer — used by every marketing surface (landing and
 * sub-pages alike). Editorial folio composition: an identity column with a
 * live map readout and actions, a four-column sitemap split by the type
 * scale, and a ruled status bar. Theme tokens only, so it renders quietly
 * in both landing modes. No motion, no glows, no invented status claims.
 */
export default function MarketingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-seam bg-base">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-x-12 gap-y-12 py-14 lg:grid-cols-12 lg:py-16">
          {/* ── Identity ─────────────────────────────────────────── */}
          <div className="lg:col-span-4">
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Onramp home">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-[var(--panel-raised)]">
                <TreeStructure size={16} weight="bold" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-ink">Onramp</span>
            </Link>

            <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-ink-secondary">
              Onramp turns any repository into a live ramp — an architecture map, graded tasks,
              and a review queue that keep new engineers shipping from week one.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                {...prefetchProps('/register')}
                className="inline-flex h-10 items-center rounded-md bg-ink px-5 text-sm font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90"
              >
                Try for free
              </Link>
              <Link
                to="/contact"
                {...prefetchProps('/contact')}
                className="inline-flex h-10 items-center rounded-md border border-seam bg-panel px-5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                Talk to sales
              </Link>
            </div>

            <div className="mt-6 flex items-center gap-2">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-card border border-seam bg-panel text-ink-tertiary transition-colors hover:border-seam-strong hover:bg-well hover:text-ink"
                >
                  <Icon size={16} weight="bold" />
                </a>
              ))}
            </div>
          </div>

          {/* ── Sitemap ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-8">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="overline text-ink-muted">{col.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        to={l.href}
                        {...prefetchProps(l.href)}
                        className="text-[13.5px] text-ink-secondary underline-offset-4 transition-colors hover:text-ink hover:underline"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* ── Status bar ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 border-t border-seam py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-code text-[11px] text-ink-muted">
            © {year} Onramp, Inc. All rights reserved.
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-1.5 font-code text-[11px] text-ink-muted">
              map fresh · HEAD
            </span>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-1.5 font-code text-[11px] text-ink-muted transition-colors hover:text-ink"
            >
              Back to top
              <ArrowUp size={12} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
