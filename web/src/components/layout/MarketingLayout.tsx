import type { ReactNode } from 'react'
import MarketingNav, { type NavLinkItem } from './MarketingNav'
import MarketingFooter from './MarketingFooter'
import PageTransition from '../ui/page-transition'

interface MarketingLayoutProps {
  children: ReactNode
  /** Optional nav links. Defaults to Docs / Pricing / Changelog. */
  navLinks?: NavLinkItem[]
  /** Whether the nav should be fixed. Default true. */
  navFixed?: boolean
  /** Additional top padding for fixed nav offset. Default pt-24. */
  topPadding?: string
}

export default function MarketingLayout({
  children,
  navLinks,
  navFixed = true,
  topPadding = 'pt-24',
}: MarketingLayoutProps) {
  return (
    <PageTransition>
      {/* Pinned premium surface — same identity as the landing page
          (`.landing-premium` + `data-theme="landing"`) so every public page
          shares one Shaders-inspired dark design and never follows the app
          theme. */}
      <div data-theme="landing" className="landing-premium min-h-screen bg-room text-ink antialiased font-body flex flex-col">
        <MarketingNav links={navLinks} fixed={navFixed} />
        <main className={`flex-1 ${topPadding}`}>
          {children}
        </main>
        <MarketingFooter />
      </div>
    </PageTransition>
  )
}
