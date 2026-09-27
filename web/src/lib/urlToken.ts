/**
 * Reading single-use tokens out of the URL, and then getting them out of it.
 *
 * Reset, verification, and invite links used to carry the token in the query
 * string. That is a credential in every server access log, proxy log, and
 * Referer header on the page. The backend now mints them into the URL fragment
 * instead (see backend/app/services/frontend_links.py), which the browser never
 * sends to a server.
 *
 * The query-string fallback is deliberate and must stay: reset and invite
 * emails already sitting in inboxes were sent in the old form. Removing it
 * would invalidate links people is actively using.
 *
 * `scrubTokenFromUrl` then rewrites the address bar so the token does not sit
 * in visible history or get copied into a support ticket.
 */

/** Read a token from the fragment first, then the query string. */
export function readTokenFromUrl(search?: string): string | null {
  if (typeof window === 'undefined') return null

  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
  if (fromHash) return fromHash

  const query = search ?? window.location.search
  const fromQuery = new URLSearchParams(query).get('token')
  return fromQuery || null
}

/**
 * Remove the token from the address bar without reloading or adding history
 * entries. Falls back to the query string for legacy links.
 */
export function scrubTokenFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return

  try {
    const { pathname, search, hash } = window.location

    // Strip `token` from the fragment.
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
    if (hashParams.has('token')) {
      hashParams.delete('token')
      const rest = hashParams.toString()
      const nextHash = rest ? `#${rest}` : ''
      window.history.replaceState(null, '', `${pathname}${search}${nextHash}`)
      return
    }

    // Legacy `?token=` links.
    const searchParams = new URLSearchParams(search)
    if (searchParams.has('token')) {
      searchParams.delete('token')
      const qs = searchParams.toString()
      window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}${hash}`)
    }
  } catch {
    // Never let history rewriting break the page.
  }
}
