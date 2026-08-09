import { Link } from 'react-router-dom'

export interface NavLinkItem {
  label: string
  href: string
  active?: boolean
}

interface MarketingNavProps {
  /** Optional custom links. Defaults to Docs / Pricing / Changelog. */
  links?: NavLinkItem[]
  /** Whether the nav should be fixed (vs relative/static). Default true. */
  fixed?: boolean
}

const DEFAULT_LINKS: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
]

export default function MarketingNav({
  links = DEFAULT_LINKS,
  fixed = true,
}: MarketingNavProps) {
  return (
    <nav
      className={[
        'flex items-center justify-between px-6 md:px-12 lg:px-20 py-4 z-50',
        'bg-[hsl(var(--background))]/80 backdrop-blur-xl border-b border-[hsl(var(--border))]',
        fixed ? 'fixed top-0 left-0 right-0' : '',
      ].join(' ')}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-tile bg-accent-from shadow-lit">
          <span className="text-[11px] font-bold text-white font-display tracking-tight">OR</span>
        </span>
        <span className="text-xl font-display font-bold tracking-tight text-[hsl(var(--foreground))]">
          Onramp
        </span>
      </Link>

      {/* Center nav links */}
      <div className="hidden md:flex items-center gap-8">
        {links.map((link) =>
          link.active ? (
            <span
              key={link.label}
              className="text-sm font-medium text-[hsl(var(--foreground))]"
            >
              {link.label}
            </span>
          ) : (
            <Link
              key={link.label}
              to={link.href}
              className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              {link.label}
            </Link>
          )
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <Link
          to="/login"
          className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors font-body"
        >
          Log in
        </Link>
        <Link
          to="/register"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-btn bg-go text-[hsl(var(--primary-foreground))] text-sm font-semibold shadow-card transition-all hover:bg-go-lit active:scale-[0.98] font-body"
        >
          Start free
        </Link>
      </div>
    </nav>
  )
}
