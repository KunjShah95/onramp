import { Link } from 'react-router-dom'
import { TreeStructure, ArrowUp } from '@phosphor-icons/react'
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
      { label: 'Product', href: '/#product' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Why Onramp', href: '/why-onramp' },
      { label: 'Security', href: '/security' },
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
      { label: 'Trust center', href: '/trust' },
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
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-[var(--room)]">
                <TreeStructure size={16} weight="bold" />
              </span>
              <span className="font-display text-[15px] font-semibold tracking-tight text-ink">Onramp</span>
            </Link>

            <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-ink-secondary">
              Onramp turns your repository into a ramp for new engineers, so they ship in week one
              and your seniors keep their afternoons.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                {...prefetchProps('/register')}
                className="inline-flex h-10 items-center rounded-lg bg-ink px-5 text-sm font-medium text-[var(--room)] transition-opacity hover:opacity-90"
              >
                Start free
              </Link>
              <Link
                to="/contact"
                {...prefetchProps('/contact')}
                className="inline-flex h-10 items-center rounded-lg border border-seam-strong px-5 text-sm font-medium text-ink transition-colors hover:bg-well"
              >
                Talk to us
              </Link>
            </div>
          </div>

          {/* ── Sitemap ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-8">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="mk-label">{col.title}</h2>
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
