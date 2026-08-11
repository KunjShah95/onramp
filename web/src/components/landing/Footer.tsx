import { Link } from 'react-router-dom'
import { TreeStructure } from '@phosphor-icons/react'

const LINK_COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'Docs', to: '/docs' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-room">
      <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Link to="/" className="group flex items-center gap-2.5" aria-label="Onramp home">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-cyan-400/90 text-[#0F1419] transition-transform duration-200 group-hover:scale-105">
                <TreeStructure size={16} weight="bold" />
              </span>
              <span className="font-display text-sm font-bold tracking-tight text-white">ONRAMP</span>
            </Link>
            <p className="mt-4 max-w-xs text-[13px] leading-[1.6] text-ink-tertiary">
              The live architecture map for your repo. New hires stop asking seniors.
            </p>
          </div>

          {LINK_COLS.map((col) => (
            <div key={col.title}>
              <div className="font-code text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">
                {col.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-[13px] text-ink-secondary transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-6 sm:flex-row sm:items-center">
          <span className="font-code text-[11px] text-ink-tertiary">
            © {new Date().getFullYear()} Onramp, Inc. All rights reserved.
          </span>
          <span className="font-code text-[11px] text-ink-tertiary">
            Indexed from source · not from docs
          </span>
        </div>
      </div>
    </footer>
  )
}
