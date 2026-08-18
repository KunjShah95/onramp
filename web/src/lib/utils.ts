import { twMerge } from 'tailwind-merge'

// Inlined copy of clsx (MIT) instead of importing the package.
// clsx is also a dependency of recharts, so importing it here shared the
// module between the eager app shell and the lazy charts chunk, which made
// Rollup pull the whole recharts chunk into the entry's static imports.
// Keeping a local copy (it's ~20 lines) keeps recharts fully lazy.
// https://github.com/lukeed/clsx
function clsx(...inputs: ClassValue[]): string {
  let out = ''
  for (const input of inputs) {
    if (!input) continue
    if (typeof input === 'string' || typeof input === 'number') {
      out += (out ? ' ' : '') + input
      continue
    }
    if (Array.isArray(input)) {
      const nested = clsx(...input)
      if (nested) out += (out ? ' ' : '') + nested
      continue
    }
    for (const key in input as Record<string, unknown>) {
      if (input[key as keyof typeof input]) out += (out ? ' ' : '') + key
    }
  }
  return out
}

export type ClassValue = string | number | bigint | null | undefined | false | Record<string, unknown> | ClassValue[]

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Whole days until a local `yyyy-mm-dd` date (rounded up). Returns undefined
 * for empty/blank values or dates that are today or in the past, which the
 * callers treat as "no expiry".
 */
export function daysUntilExpiry(dateStr: string): number | undefined {
  if (!dateStr) return undefined
  const target = new Date(`${dateStr}T23:59:59`)
  if (Number.isNaN(target.getTime())) return undefined
  const ms = target.getTime() - Date.now()
  return ms > 0 ? Math.ceil(ms / 86_400_000) : undefined
}

/** IANA timezone for India Standard Time (UTC+05:30), applied regardless of the user's browser locale. */
export const IST_TIME_ZONE = 'Asia/Kolkata'

/** Short date label for an ISO timestamp in IST — 'MMM D, YYYY' or 'N/A'. */
export function formatKeyDate(iso?: string | null): string {
  if (!iso) return 'N/A'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

/** Full date+time label for an ISO timestamp in IST — 'Aug 9, 2026, 10:30:45 AM' or 'N/A'. */
export function formatInIST(iso?: string | null): string {
  if (!iso) return 'N/A'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d)
}

/** Live IST wall-clock parts (00–23 hours) for instrument readouts like the mission clock. */
export function getISTClockParts(date: Date): { hours: string; minutes: string; seconds: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00'
  return { hours: get('hour'), minutes: get('minute'), seconds: get('second') }
}
