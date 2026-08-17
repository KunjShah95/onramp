import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'
import { navSections, bottomItems, type NavItem } from '../../lib/nav'
import { cn } from '../../lib/utils'

const OPEN_EVENT = 'onramp:command-palette'

/** Dispatch this to open the palette from any surface (e.g. a toolbar button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

interface PaletteEntry {
  to: string
  label: string
  group: string
  Icon: NavItem['Icon']
}

/**
 * Command palette — ⌘K / Ctrl+K (or the onramp:command-palette event) opens a
 * role-filtered route search. Arrow keys move, Enter navigates, Escape closes.
 * Same nav registry as the sidebar, so the two can never drift apart.
 */
export default function CommandPalette() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Open/close via ⌘K / Ctrl+K or the shared open event (mobile trigger).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  // Focus the input and reset state each time the palette opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 10)
    return () => window.clearTimeout(t)
  }, [open])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const entries = useMemo(() => {
    const visible = (item: NavItem) => !item.roles || (role && item.roles.includes(role))
    const all: PaletteEntry[] = []
    for (const section of navSections) {
      for (const item of section.items) {
        if (visible(item)) all.push({ to: item.to, label: item.label, group: section.title, Icon: item.Icon })
      }
    }
    for (const item of bottomItems) {
      all.push({ to: item.to, label: item.label, group: 'System', Icon: item.Icon })
    }
    return all
  }, [role])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.to.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q),
    )
  }, [entries, query])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[active]
      if (r) go(r.to)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      onMouseDown={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Navigate to a page"
    >
      {/* Solid backdrop — no glass */}
      <div className="fixed inset-0 bg-ink/50" aria-hidden="true" />

      <div
        className="relative w-full max-w-lg rounded-card border border-seam bg-panel shadow-overhead overflow-hidden animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 border-b border-seam">
          <MagnifyingGlass size={16} weight="bold" className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page…"
            aria-label="Search pages"
            className="flex-1 bg-transparent py-3.5 text-body-sm text-ink placeholder:text-ink-muted/60 outline-none border-none font-body"
          />
          <kbd className="rounded-[3px] border border-seam bg-well px-1.5 py-0.5 font-code text-[10px] text-ink-muted shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-caption text-ink-muted">
              No pages match “{query.trim()}”.
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.to}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.to)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === active ? 'bg-well' : 'bg-transparent',
                )}
              >
                <r.Icon
                  size={16}
                  weight={i === active ? 'fill' : 'regular'}
                  className={cn('shrink-0', i === active ? 'text-go' : 'text-ink-muted')}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-body-sm text-ink truncate">{r.label}</span>
                  <span className="block font-code text-[10px] text-ink-muted/70">{r.group}</span>
                </span>
                <span className="font-code text-[10px] text-ink-muted/50 shrink-0">{r.to}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-seam text-caption text-ink-muted font-code">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="ml-auto">⌘K</span>
        </div>
      </div>
    </div>
  )
}
