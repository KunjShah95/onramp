import { Link } from 'react-router-dom'
import { TreeStructure, GithubLogo, TwitterLogo, LinkedinLogo, ArrowRight } from '@phosphor-icons/react'

const PRODUCT_LINKS = [
  { label: 'Pricing', to: '/#pricing' },
  { label: 'Changelog', to: '/changelog' },
  { label: 'Docs', to: '/docs' },
  { label: 'Why Onramp', to: '/why-onramp' },
  { label: 'Security', to: '/security' },
]

const COMPANY_LINKS = [
  { label: 'Blog', to: '/blog' },
  { label: 'About', to: '/about' },
  { label: 'Careers', to: '/careers' },
  { label: 'Contact', to: '/contact' },
]

const LEGAL_LINKS = [
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Security', to: '/security' },
  { label: 'Cookies', to: '/cookies' },
]

const SOCIAL_LINKS = [
  { label: 'GitHub', href: 'https://github.com/onramp', icon: GithubLogo },
  { label: 'Twitter', href: 'https://twitter.com/onramp', icon: TwitterLogo },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/onramp', icon: LinkedinLogo },
]

export default function Footer() {
  return (
<<<<<<< HEAD
    <footer className="border-t border-seam bg-room">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        {/* Main grid - 4 columns */}
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-5">
          {/* Brand column - wider */}
          <div className="lg:col-span-2 xl:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-6" aria-label="Onramp home">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-[var(--panel-raised)]">
                <TreeStructure size={20} weight="bold" />
=======
    <footer className="relative overflow-hidden border-t border-seam bg-room">
      {/* ambient glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[10%] h-[280px] w-[420px] rounded-full bg-accent-primary/[0.08] blur-[110px]" />
        <div className="absolute -bottom-28 right-[6%] h-[260px] w-[400px] rounded-full bg-go/[0.06] blur-[110px]" />
      </div>
      {/* gradient seam on the top edge */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/50 to-transparent" />
      {/* dot grid faded toward the bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"          style={{
          backgroundImage: 'radial-gradient(rgb(var(--border-rgb) / 0.10) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(180deg, transparent 0%, black 60%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, black 60%)',
        }}
      />

      <div className="relative mx-auto max-w-[1280px] px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* brand */}
          <div className="sm:col-span-2">
            <Link to="/" className="group inline-flex items-center gap-2.5" aria-label="Onramp home">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-primary via-accent-via to-accent-to text-accent-foreground shadow-[0_0_20px_rgb(var(--accent-primary)/0.3)] ring-1 ring-seam transition-transform duration-200 group-hover:scale-105">
                <TreeStructure size={17} weight="bold" />
>>>>>>> cae272328a35776c20cb7e65ca99143addd641e7
              </span>
              <span className="text-xl font-semibold tracking-tight text-ink">Onramp</span>
            </Link>
            <p className="max-w-xs text-base leading-relaxed text-ink-secondary mb-8">
              Onboarding in days, not months. Turn your repo into a live ramp — learning paths, graded tasks, and a review queue that updates on every push.
            </p>
            <div className="flex items-center gap-1.5 font-code text-[12px] text-ink-tertiary">
              <span className="h-1.5 w-1.5 rounded-full bg-go" aria-hidden />
              <span>map fresh · HEAD</span>
            </div>
          </div>

          {/* Product column */}
          <nav aria-label="Product">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-4">Product</h3>
            <ul className="space-y-3">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ink-secondary transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Company column */}
          <nav aria-label="Company">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-4">Company</h3>
            <ul className="space-y-3">
              {COMPANY_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ink-secondary transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal column */}
          <nav aria-label="Legal">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-tertiary mb-4">Legal</h3>
            <ul className="space-y-3">
              {LEGAL_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-sm text-ink-secondary transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-seam" />

        {/* Bottom row - newsletter + social + copyright */}
        <div className="mt-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          {/* Newsletter signup */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div>
              <h4 className="text-sm font-semibold text-ink">Stay updated</h4>
              <p className="text-[13px] text-ink-tertiary">Changelog, tips, and onboarding stories. No spam.</p>
            </div>
            <form className="flex gap-2" action="https://buttondown.email/api/emails/embed-subscribe/onramp" method="POST" target="_blank">
              <input
                type="email"
                name="email"
                placeholder="you@company.com"
                className="h-10 w-full sm:w-64 rounded-md border border-seam bg-panel px-4 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-go transition-colors"
                required
              />
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-[var(--panel-raised)] transition-opacity hover:opacity-90">
                Subscribe
                <ArrowRight size={14} weight="bold" />
              </button>
            </form>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-6">
            <span className="text-sm text-ink-tertiary">Follow us</span>
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-seam bg-panel text-ink-secondary transition-colors hover:border-go hover:text-go hover:bg-well"
                >
                  <s.icon size={16} weight="bold" />
                </a>
              ))}
            </div>
          </div>

          {/* Copyright */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-[12px] text-ink-tertiary">
            <span>© {new Date().getFullYear()} Onramp, Inc.</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-px bg-seam" aria-hidden />
              Built for engineering teams
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}