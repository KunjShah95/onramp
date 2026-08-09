import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, TreeStructure } from '@phosphor-icons/react'
import { cn } from '../../../lib/utils'

interface NavLink {
  label: string
  href: string
}

interface HeroLockupProps {
  /** Nav links rendered between brand and CTA. Default: empty (clean). */
  links?: NavLink[]
  /** Right-aligned primary CTA. */
  cta?: { label: string; href: string } | null
  /** Hero slot — rendered in the first viewport below the nav. */
  hero: ReactNode
  /** Optional secondary ghost CTA next to primary. */
  ghost?: { label: string; href: string } | null
}

/**
 * Nav + hero in one composition. The nav is fixed and translucent; the hero
 * is the first viewport. No orbs, no decorative chrome — let the product plane
 * own the screen.
 */
export default function HeroLockup({ links = [], cta = null, ghost = null, hero }: HeroLockupProps) {
  const location = useLocation()
  return (
    <div className="relative bg-base text-ink">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-seam/60 bg-base/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6 lg:px-10">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-go text-white transition-transform duration-200 group-hover:scale-[1.04]">
              <TreeStructure size={14} weight="bold" />
            </span>
            <span className="font-heading text-body-sm font-semibold tracking-tight text-ink">Onramp</span>
          </Link>

          <div className="hidden items-center gap-7 md:flex">
            {links.map((l) => {
              const active = location.pathname === l.href
              return (
                <Link
                  key={l.label}
                  to={l.href}
                  className={cn(
                    'group relative text-[13px] font-medium transition-colors',
                    active ? 'text-ink' : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  {l.label}
                  <span className={cn(
                    'absolute -bottom-1 left-0 h-px bg-go transition-all duration-300',
                    active ? 'w-full' : 'w-0 group-hover:w-full',
                  )} />
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            {ghost && (
              <Link
                to={ghost.href}
                className="hidden text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink sm:inline"
              >
                {ghost.label}
              </Link>
            )}
            {cta && (
              <Link
                to={cta.href}
                className="group inline-flex items-center gap-1.5 rounded-btn bg-go px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-lit transition-all hover:bg-go-lit active:translate-y-px"
              >
                {cta.label}
                <ArrowRight size={12} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="relative">{hero}</div>
    </div>
  )
}