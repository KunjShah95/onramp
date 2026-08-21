import type { ReactNode } from 'react'
import MarketingNav, { type NavLinkItem } from './MarketingNav'
import MarketingFooter from './MarketingFooter'
import PageTransition from '../ui/page-transition'
import Seo, { type SeoProps } from '../seo/Seo'

interface MarketingLayoutProps {
  children: ReactNode
  /** Optional nav links. Defaults to Docs / Pricing / Changelog. */
  navLinks?: NavLinkItem[]
  /** Whether the nav should be fixed. Default true. */
  navFixed?: boolean
  /** Additional top padding for fixed nav offset. Default pt-24. */
  topPadding?: string
  /** Per-page SEO metadata (title, description, canonical path). */
  seo?: SeoProps
}

export default function MarketingLayout({
  children,
  navLinks,
  navFixed = true,
  topPadding = 'pt-24',
  seo,
}: MarketingLayoutProps) {
  return (
    <PageTransition>
      {/* Pinned premium surface — same identity as the landing page
          (`.landing-premium` + `.landing-light` + `data-theme="landing"`) so
          every public page shares one clean light design and never follows
          the app theme. */}
      <div data-theme="landing" className="landing-premium landing-light min-h-screen bg-room text-ink antialiased font-body flex flex-col">
        {seo && <Seo {...seo} />}
        <a href="#main-content" className="skip-link">Skip to content</a>
        {/* subtle ambient — same aurora language as Hero, but quieter for inner pages */}
        <div aria-hidden className="pointer-events-none fixed inset-0">
          <div className="absolute -top-32 left-1/4 h-[420px] w-[560px] -translate-x-1/2 rounded-full bg-accent-primary/[0.04] blur-[110px]" />
          <div className="absolute right-0 top-[18%] h-[320px] w-[380px] rounded-full bg-accent-via/[0.035] blur-[100px]" />
        </div>
        <header>
          <MarketingNav links={navLinks} fixed={navFixed} />
        </header>
        <main id="main-content" className={`relative flex-1 ${topPadding}`}>
          {children}
        </main>
        <MarketingFooter />
      </div>
    </PageTransition>
  )
}
