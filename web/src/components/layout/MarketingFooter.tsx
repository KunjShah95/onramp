import { Link } from 'react-router-dom'
import { TreeStructure } from '@phosphor-icons/react'

const LINKS = [
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Docs', href: '/docs' },
  { label: 'Why Onramp', href: '/why-onramp' },
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Security', href: '/security' },
  { label: 'DPA', href: '/dpa' },
]

/* Status-line footer — one hairline bar shared with the landing footer:
 * brand · live map reading · links · copyright. The mono status readout
 * ("map fresh · HEAD") is the single signature element, in the product's
 * own telemetry voice. No column grid, no second row, no ambient glows,
 * no gradient seam, no dot grid, no hover slide bars, no motion.
 * Theme tokens only, so dark/light landing modes both render quiet. */
export default function MarketingFooter() {
  return (
    <footer className="border-t border-seam bg-room">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 lg:px-8">
        <Link to="/" className="inline-flex shrink-0 items-center gap-2" aria-label="Onramp home">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-[var(--panel-raised)]">
            <TreeStructure size={13} weight="bold" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">Onramp</span>
        </Link>

        <span className="inline-flex shrink-0 items-center gap-1.5 font-code text-[11px] text-ink-tertiary">
          <span className="h-1.5 w-1.5 rounded-full bg-go" aria-hidden />
          map fresh · HEAD
        </span>

        <nav aria-label="Footer" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="text-[13px] text-ink-tertiary transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <span className="shrink-0 text-xs text-ink-tertiary">
          © {new Date().getFullYear()} Onramp, Inc.
        </span>
      </div>
    </footer>
  )
}
