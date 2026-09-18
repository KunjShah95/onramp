import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_EMAIL_DIGEST_TIME,
  isValidDigestTime,
  normalizeEmailDigestTime,
  isNetworkError,
  NetworkError,
  fetchWithAuth,
  updateNotificationPreferences,
  getNotificationPreferences,
  API_BASE,
} from '../lib/api'

const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('1.11 — email digest time validation', () => {
  it('accepts HH:MM 24h times', () => {
    expect(isValidDigestTime('08:00')).toBe(true)
    expect(isValidDigestTime('00:00')).toBe(true)
    expect(isValidDigestTime('23:59')).toBe(true)
  })

  it('rejects malformed times', () => {
    expect(isValidDigestTime('24:00')).toBe(false)
    expect(isValidDigestTime('8:00')).toBe(false)
    expect(isValidDigestTime('08:60')).toBe(false)
    expect(isValidDigestTime('morning')).toBe(false)
    expect(isValidDigestTime('')).toBe(false)
    expect(isValidDigestTime(undefined)).toBe(false)
    expect(isValidDigestTime(null)).toBe(false)
    expect(isValidDigestTime(800)).toBe(false)
  })

  it('falls back to the documented default + warns on invalid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizeEmailDigestTime('not-a-time')).toBe(DEFAULT_EMAIL_DIGEST_TIME)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('passes valid times through untouched', () => {
    expect(normalizeEmailDigestTime('17:30')).toBe('17:30')
  })

  it('sanitizes email_digest_time before PUT', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let sentBody = ''
    fetchMock().mockImplementation(async (url: unknown, init: RequestInit) => {
      sentBody = String(init?.body ?? '')
      expect(String(url)).toContain('/notifications/preferences')
      return jsonResponse({ success: true, data: { email_digest_time: '08:00' } })
    })
    await updateNotificationPreferences({ email_digest_time: 'garbage' })
    expect(JSON.parse(sentBody).email_digest_time).toBe(DEFAULT_EMAIL_DIGEST_TIME)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('normalizes invalid server values on read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock().mockResolvedValue(jsonResponse({ success: true, data: { email_digest_time: '25:99' } }))
    const prefs = await getNotificationPreferences()
    expect(prefs.email_digest_time).toBe(DEFAULT_EMAIL_DIGEST_TIME)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('1.12 — silent-refresh network vs auth distinction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('classifies network failures vs auth expiry', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new NetworkError())).toBe(true)
    expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isNetworkError(new Error('Authentication required. Please sign in again.'))).toBe(false)
    expect(isNetworkError(new Error('API error 500'))).toBe(false)
  })

  it('401 + refresh 401 → auth error (logout path)', async () => {
    fetchMock().mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('/auth/refresh')) return jsonResponse({ detail: 'expired' }, 401)
      return jsonResponse({ detail: 'Session expired' }, 401)
    })
    await expect(fetchWithAuth(`${API_BASE}/teams`)).rejects.toThrow('Session expired')
  })

  it('401 + refresh unreachable → NetworkError after bounded retries (stay logged in)', async () => {
    let refreshCalls = 0
    fetchMock().mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCalls += 1
        throw new TypeError('Failed to fetch')
      }
      return new Response('unauthorized', { status: 401 })
    })
    const pending = fetchWithAuth(`${API_BASE}/teams`)
    // Attach the assertion BEFORE advancing timers so the rejection is handled.
    const assertion = expect(pending).rejects.toBeInstanceOf(NetworkError)
    // Flush the backoff sleeps (300ms + 800ms) under fake timers.
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    // 1 initial attempt + 2 bounded retries.
    expect(refreshCalls).toBe(3)
  })

  it('401 + transient refresh failure then success → retries original request', async () => {
    let refreshCalls = 0
    let apiCalls = 0
    fetchMock().mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCalls += 1
        if (refreshCalls === 1) throw new TypeError('Failed to fetch')
        return jsonResponse({ success: true, data: { token: 'new-token' } })
      }
      apiCalls += 1
      if (apiCalls === 1) return new Response('unauthorized', { status: 401 })
      return jsonResponse({ success: true, data: { ok: 1 } })
    })
    const pending = fetchWithAuth<{ ok: number }>(`${API_BASE}/teams`)
    const assertion = expect(pending).resolves.toEqual({ ok: 1 })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(refreshCalls).toBe(2)
    expect(apiCalls).toBe(2)
  })
})
