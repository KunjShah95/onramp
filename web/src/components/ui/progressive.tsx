/*
 * ─── PROGRESSIVE DISCLOSURE KIT · ONRAMP MISSION CONTROL ─────────────────────
 *
 * The "Before" failure mode this file exists to kill: a page dumps every panel,
 * row and option on the user at once and calls that a dashboard. The "After"
 * move is unglamorous — reduce the choices first, then show the detail.
 *
 *   1. NextUp      → one recommended first move; the rest sit behind it
 *   2. FilterChips → counted categories that narrow the field before listing
 *   3. ShowMore    → cap a long list, label the cap, reveal the rest on demand
 *   4. Disclosure  → collapse secondary detail behind a labelled trigger
 *   5. DeepDive    → page-level "what else is here" so the essentials land first
 *
 * MOTION POLICY. Every transition in this file is EARNED: it is driven by a
 * user action (a click, a filter change, a reveal) and runs on the shared
 * 160–280ms tokens in `styles/polish.css`. Nothing animates on mount, on
 * scroll, or on route change — that stays banned per DESIGN.md §06. The global
 * `prefers-reduced-motion` rule collapses all of it to 0.01ms for free.
 * ────────────────────────────────────────────────────────────────────────────
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

/** Phosphor icons are typed as `Icon`; this keeps call sites un-fussy. */
export type IconLike = ComponentType<{
  size?: number | string
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  className?: string
  style?: CSSProperties
}>

type Tone = 'go' | 'mission' | 'caution' | 'abort' | 'ink'

const toneText: Record<Tone, string> = {
  go: 'text-go',
  mission: 'text-mission',
  caution: 'text-caution',
  abort: 'text-abort',
  ink: 'text-ink',
}
const toneBorder: Record<Tone, string> = {
  go: 'border-go/30',
  mission: 'border-mission/30',
  caution: 'border-caution/30',
  abort: 'border-abort/30',
  ink: 'border-seam-strong',
}
const toneFill: Record<Tone, string> = {
  go: 'bg-go/10',
  mission: 'bg-mission/10',
  caution: 'bg-caution/10',
  abort: 'bg-abort/10',
  ink: 'bg-well',
}

/** `noun` is SINGULAR; this handles the plural so callers never append "s"
 *  twice (which is exactly the bug the first draft shipped). */
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/* ═══════════════════════════════════════════════════════════════════════════
   1 · NextUp — "start here"
   ═════════════════════════════════════════════════════════════════════════
   The one component that most directly implements reduce-then-detail. A role
   page opens on a single recommended move with a one-line reason, and every
   other available action becomes a quiet second row instead of a wall of
   equally-weighted buttons. Nothing is hidden — it is just ranked.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface NextUpAction {
  /** Stable key — also the React key. */
  id: string
  label: string
  /** Why this is the next move, in one line. */
  detail?: string
  /** Trailing mono count, e.g. "7". */
  count?: number
  to?: string
  onClick?: () => void
  icon?: IconLike
  tone?: Tone
  /** Replaces the label with a verb phrase when the action is destructive. */
  destructive?: boolean
}

export interface NextUpProps {
  /** Overline above the headline. Defaults to "Start here". */
  eyebrow?: string
  /** The single recommended move, in the user's own terms. */
  headline: string
  /** One line of context under the headline — the "why now". */
  detail?: string
  tone?: Tone
  /** The action that resolves `headline`. Rendered as the primary button. */
  primary?: NextUpAction
  /** Everything else, ranked. Collapsed to 3 visible; the rest on "show more". */
  secondary?: NextUpAction[]
  /** How many secondaries to show before revealing the rest. */
  secondaryLimit?: number
  className?: string
}

export function NextUp({
  eyebrow = 'Start here',
  headline,
  detail,
  tone = 'go',
  primary,
  secondary = [],
  secondaryLimit = 3,
  className,
}: NextUpProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? secondary : secondary.slice(0, secondaryLimit)
  const hidden = secondary.length - visible.length

  if (!primary && secondary.length === 0) return null

  return (
    <section
      aria-label={eyebrow}
      className={cn(
        'rounded-card border bg-panel overflow-hidden',
        toneBorder[tone],
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:gap-6">
        {/* ── The one thing to do ── */}
        <div className="min-w-0 flex-1">
          <div className={cn('overline mb-1.5', toneText[tone])}>{eyebrow}</div>
          <p className="font-heading text-[15px] font-semibold text-ink text-balance leading-tight">
            {headline}
          </p>
          {detail && (
            <p className="text-caption text-ink-tertiary mt-1.5 text-pretty">{detail}</p>
          )}
        </div>
        {primary && (
          <div className="shrink-0 md:w-auto w-full">
            <NextUpButton action={primary} primary />
          </div>
        )}
      </div>

      {/* ── The rest, ranked and quiet ── */}
      {secondary.length > 0 && (
        <div className="border-t border-seam">
          <ul className="divide-y divide-seam">
            {visible.map((action, i) => (
              <li key={action.id} className="reveal-row" style={{ animationDelay: `${i * 30}ms` }}>
                <NextUpButton action={action} row />
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-seam py-2.5 text-caption font-medium text-ink-muted transition-colors hover:text-go hover:bg-well/40"
            >
              <CaretRight size={11} weight="bold" className="disclose-chevron" />
              Show {hidden} more action{hidden === 1 ? '' : 's'}
            </button>
          )}
          {showAll && secondary.length > secondaryLimit && (
            <button
              onClick={() => setShowAll(false)}
              className="flex w-full items-center justify-center border-t border-seam py-2.5 text-caption font-medium text-ink-muted transition-colors hover:text-ink-secondary hover:bg-well/40"
            >
              Show fewer
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function NextUpButton({
  action,
  primary = false,
  row = false,
}: {
  action: NextUpAction
  primary?: boolean
  row?: boolean
}) {
  const tone = action.tone ?? 'go'
  const Icon = action.icon

  const inner = (
    <>
      {Icon && (
        <span
          className={cn(
            'shrink-0 flex items-center justify-center',
            primary ? 'w-4 h-4' : 'w-6 h-6 rounded-tile border',
            !primary && cn(toneBorder[tone], toneFill[tone], toneText[tone]),
          )}
        >
          <Icon size={primary ? 15 : 12} weight="bold" />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            'block truncate',
            primary
              ? 'text-body-sm font-semibold'
              : 'text-body-xs font-medium',
            primary
                ? (action.destructive ? 'text-white' : 'text-panel-raised')
                : action.destructive
                  ? 'text-abort'
                  : 'text-ink',
          )}
        >
          {action.label}
        </span>
        {action.detail && (
          <span
            className={cn(
              'block truncate mt-0.5',
              primary ? 'text-[11px]' : 'text-caption',
              primary ? 'text-white/70' : 'text-ink-muted',
            )}
          >
            {action.detail}
          </span>
        )}
      </span>
      {action.count !== undefined && (
        <span
          className={cn(
            'shrink-0 font-code tabular-nums',
            primary ? 'text-[11px] text-white/80' : 'text-caption text-ink-muted',
          )}
        >
          {action.count}
        </span>
      )}
      {!primary && (
        <CaretRight
          size={12}
          weight="bold"
          className="shrink-0 text-ink-disabled transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink-muted"
        />
      )}
    </>
  )

  const shell = row
    ? cn(
        'group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        'hover:bg-well/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-go',
      )
    : cn(
        'flex w-full items-center gap-2 rounded-tile px-4 py-2.5 transition-colors',
        'bg-go text-panel-raised hover:bg-go-lit',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-go focus-visible:outline-offset-2',
      )

  if (action.to && !action.onClick) {
    return (
      <Link to={action.to} className={shell}>
        {inner}
      </Link>
    )
  }
  if (action.onClick) {
    return (
      <button type="button" onClick={action.onClick} className={shell}>
        {inner}
      </button>
    )
  }
  return <div className={shell}>{inner}</div>
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · FilterChips — "reduce the choices first"
   ═════════════════════════════════════════════════════════════════════════
   Categories with live counts, before the list. A count of zero is dimmed but
   still clickable (so the rail never reflows under the cursor); the active chip
   is announced with aria-pressed, not colour alone.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ChipOption {
  value: string
  label: string
  /** Live count. Omit for options that are not buckets (e.g. a sort control). */
  count?: number
}

export interface FilterChipsProps {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
  /** Optional overline ahead of the chips. */
  label?: string
  /** Announced + rendered after the rail, e.g. "12 of 34 shown". */
  summary?: string
  /** Allow the chips to wrap on wide screens instead of scrolling. */
  wrap?: boolean
  className?: string
}

export function FilterChips({
  options,
  value,
  onChange,
  label,
  summary,
  wrap = true,
  className,
}: FilterChipsProps) {
  return (
    /* Stacks on phones. A summary that shares a row with a horizontally
       scrolling rail gets squeezed into the chips it is supposed to describe
       — so below `sm` the count drops to its own line. */
    <div className={cn('flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3', className)}>
      {label && <span className="overline shrink-0">{label}</span>}
      <div
        className="chip-rail w-full sm:w-auto sm:min-w-0 sm:flex-1"
        data-wrap={wrap ? 'true' : 'false'}
        role="group"
        aria-label={label ?? 'Filter'}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            data-empty={opt.count === 0 ? 'true' : undefined}
            className="filter-chip"
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className="tabular-nums opacity-60">{opt.count}</span>
            )}
          </button>
        ))}
      </div>
      {summary && (
        // One string, not three adjacent nodes — a split "4 of 8" is announced
        // in pieces by some screen readers and cannot be matched as a phrase.
        <span className="shrink-0 font-code text-caption text-ink-muted tabular-nums sm:ml-auto" role="status">
          {summary}
        </span>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · ShowMore — cap the list, label the cap
   ═══════════════════════════════════════════════════════════════════════════
   The cheapest possible disclosure: no wrapper, no collapse animation on the
   container — the newly revealed rows settle in and the footer reports exactly
   what is being withheld, so the user always knows the list has more.
   Pass `resetKey` (a filter value, a search term) to re-cap when the list
   changes shape.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ShowMoreProps<T> {
  items: T[]
  /** Rows visible before the reveal. */
  limit?: number
  /** SINGULAR noun for the footer copy, e.g. "review". Pluralised for you. */
  noun?: string
  /** Changing this value re-collapses the list. */
  resetKey?: string | number
  children: (visible: T[], info: { total: number; hidden: number; expanded: boolean }) => ReactNode
  className?: string
  emptyState?: ReactNode
}

export function ShowMore<T>({
  items,
  limit = 5,
  noun = 'items',
  resetKey,
  children,
  className,
  emptyState,
}: ShowMoreProps<T>) {
  const [expanded, setExpanded] = useState(false)

  // Re-cap when the list is re-shaped by a filter/search, not when it merely
  // grows (a refresh should not slam the list shut under the user).
  const lastKey = useRef(resetKey)
  useEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey
      setExpanded(false)
    }
  }, [resetKey])

  const total = items.length
  const visible = expanded ? items : items.slice(0, limit)
  const hidden = total - visible.length

  if (total === 0) return <>{emptyState ?? null}</>

  return (
    <div className={className}>
      {children(visible, { total, hidden, expanded })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="group mt-1 flex w-full items-center justify-center gap-1.5 rounded-tile border border-dashed border-seam-strong py-2 text-caption font-medium text-ink-muted transition-colors hover:border-go/40 hover:bg-go/[0.04] hover:text-go"
        >
          <CaretRight size={11} weight="bold" className="disclose-chevron" />
          Show {hidden} more · {plural(total, noun)} total
        </button>
      )}
      {expanded && total > limit && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 flex w-full items-center justify-center rounded-tile py-2 text-caption text-ink-muted transition-colors hover:bg-well/40 hover:text-ink-secondary"
        >
          Show first {limit} only
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · Disclosure — collapse detail behind a labelled trigger
   ═══════════════════════════════════════════════════════════════════════════
   The trigger states what is inside (`hint`) so the collapsed state is still
   informative, and the region animates to its natural height via the
   `0fr → 1fr` grid-rows trick in polish.css — no measured pixel height, so it
   cannot clip.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DisclosureProps {
  label: string
  /** What the collapsed region holds — e.g. "4 modules granted". */
  hint?: string
  /** Mono kicker beside the label, matching the console rail. */
  designator?: string
  tone?: 'go' | 'standby' | 'caution' | 'abort' | 'idle'
  defaultOpen?: boolean
  /** Render children only once opened. Default true — collapsed detail is
   *  not worth a chart's worth of render work. */
  mountOnOpen?: boolean
  icon?: IconLike
  children: ReactNode
  className?: string
  /** Rendered on the right of the trigger, outside the button. */
  action?: ReactNode
}

const dotMap = {
  go: 'bg-go-lit',
  standby: 'bg-mission-lit',
  caution: 'bg-caution-lit',
  abort: 'bg-abort-lit',
  idle: 'bg-ink-disabled',
} as const

export function Disclosure({
  label,
  hint,
  designator,
  tone = 'idle',
  defaultOpen = false,
  mountOnOpen = true,
  icon: Icon,
  children,
  className,
  action,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const regionId = useId()
  const mounted = open || !mountOnOpen

  const toggle = useCallback(() => setOpen((v) => !v), [])

  return (
    <div className={cn('rounded-card border border-seam bg-panel overflow-hidden', className)}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={regionId}
          className="disclose-trigger group flex flex-1 min-w-0 flex-wrap items-center gap-x-2.5 px-4 py-3.5 text-left transition-colors hover:bg-well/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-go"
        >
          <CaretRight size={13} weight="bold" className="disclose-chevron shrink-0 text-ink-muted" />
          {tone && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotMap[tone])} />}
          {Icon && <Icon size={14} weight="bold" className="shrink-0 text-ink-tertiary" />}
          {/* The label is the control's name — it never truncates. The mono
              designator is decoration and is the first thing to go on a
              narrow screen, otherwise every trigger reads "Ass…". */}
          <span className="font-heading text-[13px] font-semibold text-ink">{label}</span>
          {designator && <span className="designator hidden shrink-0 sm:inline">{designator}</span>}
          {/* The hint is what makes a sealed region informative, so it never
              disappears — on a phone it drops to its own line under the
              label rather than competing with it for the same row. */}
          {hint && (
            <span className="mt-1.5 w-full truncate text-caption text-ink-muted md:ml-auto md:mt-0 md:w-auto md:min-w-0 md:flex-1 md:pl-3 md:text-right">
              {hint}
            </span>
          )}
        </button>
        {action && <div className="flex shrink-0 items-center pr-3">{action}</div>}
      </div>

      <div
        id={regionId}
        className="disclose-region"
        data-open={open ? 'true' : 'false'}
        role="region"
        aria-label={label}
        // A collapsed region with nothing in it must not be a tab stop. `inert`
        // takes a real boolean — an empty string renders as false and React
        // warns, which is exactly the kind of quiet bug worth not shipping.
        inert={!mounted}
      >
        <div className="disclose-clip">
          {mounted && <div className="border-t border-seam p-5">{children}</div>}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   5 · DeepDive — page-level "what else is here"
   ═══════════════════════════════════════════════════════════════════════════
 *    For the tail of a role page: several whole panels that a reader wants on a
 *    schedule, not on every visit. The sealed state names them, so the choice to
 *    open is informed. Children stay unmounted until then.
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface DeepDiveProps {
  label: string
  /** Comma-separated contents, shown while sealed. */
  summary: string
  /** Overline above the label. */
  eyebrow?: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function DeepDive({
  label,
  summary,
  eyebrow = 'More on this page',
  defaultOpen = false,
  children,
  className,
}: DeepDiveProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={cn('rounded-card border border-dashed border-seam-strong bg-well/30', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-well/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-go"
      >
        <CaretRight size={14} weight="bold" className="disclose-chevron shrink-0 text-ink-muted group-hover:text-go" />
        <span className="min-w-0 flex-1">
          <span className="overline block mb-1">{eyebrow}</span>
          <span className="block font-heading text-[13px] font-semibold text-ink">{label}</span>
          <span className="mt-1 block text-caption text-ink-muted truncate-1">{summary}</span>
        </span>
        <span className="hidden shrink-0 text-caption font-medium text-ink-muted transition-colors group-hover:text-go sm:block">
          {open ? 'Hide' : 'Open'}
        </span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-dashed border-seam-strong p-5 reveal-row">
          {children}
        </div>
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   6 · TaskRow — the standard "one thing" row shared by the action rails
   ═══════════════════════════════════════════════════════════════════════════
   Hairline-separated, hover-wash, optional trailing status. Used instead of a
   per-page card so a role page's list rows all behave identically.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TaskRowProps {
  title: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  leading?: ReactNode
  onClick?: () => void
  to?: string
  className?: string
}

export function TaskRow({
  title,
  meta,
  trailing,
  leading,
  onClick,
  to,
  className,
}: TaskRowProps) {
  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-xs font-medium text-ink">{title}</span>
        {meta && <span className="mt-0.5 block truncate text-caption text-ink-muted">{meta}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      {to && (
        <CaretRight
          size={12}
          weight="bold"
          className="shrink-0 text-ink-disabled transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink-muted"
        />
      )}
    </>
  )
  const shell = cn(
    'group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
    'hover:bg-well/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-go',
    className,
  )
  if (to && !onClick) {
    return (
      <Link to={to} className={shell}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {inner}
      </button>
    )
  }
  return <div className={shell}>{inner}</div>
}
