import { useState, useEffect, useRef } from 'react'
import { CaretDown, Check, MagnifyingGlass, Lightning } from '@phosphor-icons/react'
import { fetchModelCatalog, type ModelCatalog, type OpenRouterCatalogModel } from '../../lib/api'
import { cn } from '../../lib/utils'

interface ModelPickerProps {
  value: string | null
  onChange: (model: string | null) => void
}

/** How many OpenRouter-catalog matches to render before collapsing (the live
 * catalog is 400+ models — search narrows it, the list shows the head). */
const MAX_LISTED = 60

interface PickerOption {
  id: string
  label: string
  sub: string
  free: boolean
  group: 'preset' | 'provider' | 'catalog'
}

/**
 * Model picker for in-app chat. Backed by ``/modelling/models`` — the router's
 * pinned provider defaults plus the dynamic OpenRouter catalog (merged by
 * the backend when an OpenRouter key is configured). Selecting an id pins
 * it on the conversation: it is sent with each /ask request and beats
 * auto-routing. ``null`` = Auto (let the router decide).
 */
export default function ModelPicker({ value, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetchModelCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => {}) // best-effort — picker falls back to Auto-only
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = search.trim().toLowerCase()

  const providerOptions: PickerOption[] = Object.entries(catalog?.providers || {})
    .filter(([, p]) => p.available && p.model)
    .map(([key, p]) => ({
      id: p.model,
      label: p.model,
      sub: `${key}${p.free ? ' · free' : ''}`,
      free: p.free,
      group: 'provider' as const,
    }))
    .filter((o) => !q || o.id.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))

  const catalogModels: OpenRouterCatalogModel[] = (catalog?.openrouter_catalog || []).filter(
    (m) =>
      !q ||
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.vendor.toLowerCase().includes(q)
  )
  const catalogOptions: PickerOption[] = catalogModels.slice(0, MAX_LISTED).map((m) => ({
    id: m.id,
    label: m.id,
    sub: [
      m.name,
      m.context_length > 0 ? `${m.context_length.toLocaleString()} ctx` : '',
      m.free ? '' : m.pricing.prompt > 0 ? `$${m.pricing.prompt}/1M in · $${m.pricing.completion}/1M out` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    free: m.free,
    group: 'catalog' as const,
  }))

  const showProviders = providerOptions.length > 0
  const showCatalog = catalogOptions.length > 0
  const catalogTruncated = catalogModels.length > catalogOptions.length
  const hasResults = showProviders || showCatalog
  // Unavailable when the catalog fetch failed entirely (null) or the backend
  // could not merge the live OpenRouter catalog (catalog_fetched: false).
  const catalogUnavailable = !catalog || (!!catalog && !catalog.catalog_fetched && !catalog.openrouter_catalog?.length)

  const display = value || 'Auto'

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => { setOpen((v) => !v); setSearch('') }}
        className={cn(
          'flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1.5 text-[12px] font-body transition-colors',
          value
            ? 'bg-go/10 border-go/25 text-go hover:bg-go/15 hover:border-go/40'
            : 'bg-panel-raised border-seam-strong text-ink-secondary hover:border-seam-strong hover:text-ink'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value ? `Pinned model: ${value}` : 'Auto — router picks the best model'}
      >
        <span className="font-code text-[10px] tracking-wider uppercase opacity-60 mr-0.5">Model</span>
        <span className="font-code text-[12px] max-w-[140px] truncate">
          {display}
        </span>
        <CaretDown size={11} weight="bold" className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-50 w-[340px] max-w-[85vw] rounded-[3px] border border-seam-strong bg-panel-raised shadow-lift overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-seam px-3 py-2">
            <MagnifyingGlass size={12} className="text-ink-tertiary shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by vendor or model id…"
              className="flex-1 min-w-0 bg-transparent font-code text-[12px] text-ink placeholder:text-ink-disabled outline-none"
            />
            <span className="font-code text-[9px] text-ink-tertiary shrink-0">
              {catalog?.openrouter_catalog?.length ? `${catalog.openrouter_catalog.length} models` : 'catalog'}
            </span>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            {/* Auto — the default */}
            <button
              role="option"
              aria-selected={value === null}
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-base transition-colors"
            >
              <span className="w-4 h-4 mt-0.5 flex items-center justify-center shrink-0">
                {value === null && <Check size={12} weight="bold" className="text-go" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-code text-[12px] text-ink">Auto</span>
                <span className="block text-[10.5px] text-ink-tertiary mt-0.5">
                  Router picks the best provider for each question (cost-first)
                </span>
              </span>
            </button>

            {showProviders && (
              <>
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                  <span className="designator text-ink-tertiary">PINNED PROVIDERS</span>
                </div>
                {providerOptions.map((o) => (
                  <ModelRow key={`p-${o.id}`} option={o} selected={value === o.id} onPick={() => { onChange(o.id); setOpen(false) }} />
                ))}
              </>
            )}

            {showCatalog && (
              <>
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                  <span className="designator text-ink-tertiary">OPENROUTER CATALOG</span>
                </div>
                {catalogOptions.map((o) => (
                  <ModelRow key={`c-${o.id}`} option={o} selected={value === o.id} onPick={() => { onChange(o.id); setOpen(false) }} />
                ))}
                {catalogTruncated && (
                  <p className="px-3 py-2 text-[10.5px] text-ink-tertiary">
                    +{catalogModels.length - catalogOptions.length} more — keep typing to narrow.
                  </p>
                )}
              </>
            )}

            {!hasResults && !catalogUnavailable && (
              <p className="px-3 py-4 text-[11px] text-ink-tertiary">No models match “{search}”.</p>
            )}
            {catalogUnavailable && !showProviders && (
              <p className="px-3 py-4 text-[11px] text-ink-tertiary leading-relaxed">
                Model catalog unavailable right now — pick Auto and the router will keep routing normally.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelRow({ option, selected, onPick }: {
  option: PickerOption
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-base transition-colors"
    >
      <span className="w-4 h-4 mt-0.5 flex items-center justify-center shrink-0">
        {selected ? <Check size={12} weight="bold" className="text-go" /> : option.free ? <Lightning size={11} weight="fill" className="text-ink-tertiary" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-code text-[12px] text-ink truncate">
          {option.id}
          {option.free && (
            <span className="ml-1.5 font-code text-[9px] text-go uppercase tracking-wider align-middle">free</span>
          )}
        </span>
        <span className="block text-[10.5px] text-ink-tertiary truncate mt-0.5">{option.sub}</span>
      </span>
    </button>
  )
}
