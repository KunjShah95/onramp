import { Link } from 'react-router-dom'
import { TreeStructure } from '@phosphor-icons/react'

const LINK_COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'Docs', to: '/docs' },
      { label: 'Why Onramp', to: '/why-onramp' },
      { label: 'Security', to: '/security' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Blog', to: '/blog' },
      { label: 'Contact', to: '/contact' },
      { label: 'About', to: '/about' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/5 bg-room">
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
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: 'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px)',
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
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-primary to-go text-[#0F1419] shadow-[0_0_24px_rgba(0,217,255,0.35)] ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105">
                <TreeStructure size={17} weight="bold" />
              </span>
              <span className="font-display text-base font-bold tracking-tight text-white">ONRAMP</span>
            </Link>
            <p className="mt-4 max-w-xs text-[13.5px] leading-[1.6] text-ink-tertiary">
              The live architecture map for your repo. New hires stop asking seniors.
            </p>
          </div>

          {LINK_COLS.map((col) => (
            <div key={col.title}>
              <div className="font-code text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">{col.title}</div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="group relative inline-flex items-center text-[13.5px] text-ink-secondary transition-colors hover:text-white">
                      <span aria-hidden className="absolute -left-3 h-px w-0 bg-gradient-to-r from-accent-primary to-go transition-all duration-300 group-hover:w-2" />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-6 sm:flex-row sm:items-center">
          <span className="font-code text-[11px] text-ink-tertiary">© {new Date().getFullYear()} Onramp, Inc. All rights reserved.</span>
          <span className="font-code text-[11px] text-ink-tertiary">Indexed from source · not from docs</span>
        </div>
      </div>
    </footer>
  )
}
