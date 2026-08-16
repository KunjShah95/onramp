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
        <header>
          <MarketingNav links={navLinks} fixed={navFixed} />
        </header>
        <main id="main-content" className={`flex-1 ${topPadding}`}>
          {children}
        </main>
        <MarketingFooter />
      </div>
    </PageTransition>
  )
}
