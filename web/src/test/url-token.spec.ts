import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { readTokenFromUrl, scrubTokenFromUrl } from '../lib/urlToken'

/*
 * The reset / verify / join pages read their token from the fragment, fall back
 * to the query string for emails already sitting in inboxes, and then scrub the
 * address bar. Getting the fallback wrong would break live reset links; getting
 * the scrub wrong would leave a credential sitting in browser history.
 */

const original = window.location
const originalHistory = window.history.replaceState

function setUrl(url: string) {
  // `...original` (a Location) already carries pathname / search / hash, and
  // `parseUrl` is what should win for them — so they are not repeated here.
  Object.defineProperty(window, 'location', {
    value: { ...original, href: url, ...parseUrl(url) },
    writable: true,
  })
}

function parseUrl(url: string) {
  const [beforeHash, hashPart] = url.split('#')
  const [pathname, searchPart] = beforeHash.split('?')
  return {
    pathname,
    search: searchPart ? `?${searchPart}` : '',
    hash: hashPart ? `#${hashPart}` : '',
  }
}

beforeEach(() => {
  setUrl('/reset-password#token=frag-token')
})

afterEach(() => {
  Object.defineProperty(window, 'location', { value: original, writable: true })
  window.history.replaceState = originalHistory
})

describe('readTokenFromUrl', () => {
  it('reads the token from the fragment', () => {
    setUrl('/reset-password#token=frag-token')
    expect(readTokenFromUrl()).toBe('frag-token')
  })

  it('still reads legacy query-string links so in-flight emails work', () => {
    setUrl('/reset-password?token=legacy-token')
    expect(readTokenFromUrl()).toBe('legacy-token')
  })

  it('prefers the fragment when both are present', () => {
    setUrl('/reset-password?token=legacy#token=frag')
    expect(readTokenFromUrl()).toBe('frag')
  })

  it('returns null when there is no token', () => {
    setUrl('/reset-password')
    expect(readTokenFromUrl()).toBeNull()
  })
})

describe('scrubTokenFromUrl', () => {
  it('removes the token from the fragment, keeping the page path', () => {
    setUrl('/reset-password#token=frag-token')
    const calls: string[] = []
    window.history.replaceState = ((_: unknown, __: string, url: string) => {
      calls.push(url)
    }) as typeof window.history.replaceState

    scrubTokenFromUrl()

    expect(calls).toEqual(['/reset-password'])
  })

  it('removes a legacy query token', () => {
    setUrl('/reset-password?token=legacy')
    const calls: string[] = []
    window.history.replaceState = ((_: unknown, __: string, url: string) => {
      calls.push(url)
    }) as typeof window.history.replaceState

    scrubTokenFromUrl()

    expect(calls).toEqual(['/reset-password'])
  })

  it('preserves unrelated query parameters', () => {
    setUrl('/join?token=legacy&team=42')
    const calls: string[] = []
    window.history.replaceState = ((_: unknown, __: string, url: string) => {
      calls.push(url)
    }) as typeof window.history.replaceState

    scrubTokenFromUrl()

    expect(calls).toEqual(['/join?team=42'])
  })

  it('preserves other fragment parameters', () => {
    setUrl('/reset-password#token=frag&next=%2Fsettings')
    const calls: string[] = []
    window.history.replaceState = ((_: unknown, __: string, url: string) => {
      calls.push(url)
    }) as typeof window.history.replaceState

    scrubTokenFromUrl()

    expect(calls[0]).not.toContain('token')
    expect(calls[0]).toContain('next=%2Fsettings')
  })

  it('does nothing when there is no token to remove', () => {
    setUrl('/reset-password')
    const calls: string[] = []
    window.history.replaceState = ((_: unknown, __: string, url: string) => {
      calls.push(url)
    }) as typeof window.history.replaceState

    scrubTokenFromUrl()

    expect(calls).toEqual([])
  })
})
