/**
 * First-touch campaign attribution for the launch funnel.
 *
 * Reads `utm_source` / `utm_medium` / `utm_campaign` from the landing URL once
 * per browser session and keeps them in sessionStorage, so a visitor who lands
 * from a LinkedIn post and signs up three pages later is still attributed to
 * LinkedIn. These are campaign labels we wrote into our own links, not
 * identifiers: nothing here names or fingerprints a person, and the values are
 * dropped by the backend unless they are short slugs.
 */

export interface Utm {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
}

const KEY = 'onramp_utm'
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign'] as const
const SLUG = /^[A-Za-z0-9._-]{1,64}$/

function doNotTrack(): boolean {
  if (typeof navigator === 'undefined') return true
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return navigator.doNotTrack === '1' || nav.globalPrivacyControl === true
}

/** Store the current URL's UTM labels, unless this session already has some. */
export function captureUtm(search: string = typeof window !== 'undefined' ? window.location.search : ''): void {
  if (doNotTrack()) return
  try {
    if (sessionStorage.getItem(KEY)) return
    const params = new URLSearchParams(search)
    const utm: Utm = {}
    for (const field of FIELDS) {
      const value = params.get(field)
      if (value && SLUG.test(value)) utm[field] = value
    }
    if (Object.keys(utm).length > 0) sessionStorage.setItem(KEY, JSON.stringify(utm))
  } catch {
    /* storage unavailable: attribution is best-effort */
  }
}

/** The session's first-touch UTM labels, or an empty object. */
export function getUtm(): Utm {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const utm: Utm = {}
    for (const field of FIELDS) {
      const value = parsed[field]
      if (typeof value === 'string' && SLUG.test(value)) utm[field] = value
    }
    return utm
  } catch {
    return {}
  }
}
