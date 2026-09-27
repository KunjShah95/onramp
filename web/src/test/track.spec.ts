import { describe, it, expect, afterEach } from 'vitest'
import { safePath } from '../lib/track'

/*
 * The client is the other half of the credential guard. `safePath` is what
 * gets sent as the event path, and the backend refuses anything with a query
 * string — but a leak that starts here would put a reset token in a network
 * request before the server ever saw it.
 */

const original = window.location

afterEach(() => {
  Object.defineProperty(window, 'location', { value: original, writable: true })
})

function setLocation(url: string) {
  Object.defineProperty(window, 'location', {
    value: { ...original, pathname: url, href: url },
    writable: true,
  })
}

describe('safePath', () => {
  it('returns a plain path unchanged', () => {
    setLocation('/why-onramp')
    expect(safePath()).toBe('/why-onramp')
  })

  it('strips the query string so reset tokens never leave the browser', () => {
    setLocation('/reset-password?token=SUPERSECRETTOKEN')
    expect(safePath()).toBe('/reset-password')
    expect(safePath()).not.toContain('SUPERSECRETTOKEN')
  })

  it('strips the verify-email token', () => {
    setLocation('/verify-email?token=abc123&redirect=/')
    expect(safePath()).toBe('/verify-email')
    expect(safePath()).not.toContain('abc123')
  })

  it('strips fragments', () => {
    setLocation('/pricing#pricing')
    expect(safePath()).toBe('/pricing')
  })

  it('falls back to root rather than emitting an empty path', () => {
    setLocation('/')
    expect(safePath()).toBe('/')
  })
})
