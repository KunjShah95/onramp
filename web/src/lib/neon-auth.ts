/**
 * Auth token management — stores the JWT in memory + localStorage for API calls.
 * Replaces the former Neon Auth client.
 */

const STORAGE_KEY = 'onramp_token'
let _token: string | null = null

export function getToken(): string | null {
  if (_token) return _token
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    _token = stored
    return stored
  }
  return null
}

export function setToken(token: string | null): void {
  _token = token
  if (token) {
    localStorage.setItem(STORAGE_KEY, token)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const NEON_AUTH_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NEON_AUTH_URL) || ''

export function getNeonLoginUrl(provider: 'google' | 'github'): string {
  return `${NEON_AUTH_URL}/api/auth/oauth/${provider}/authorize`
}

export function getNeonRegisterUrl(): string {
  return `${NEON_AUTH_URL}/api/auth/register`
}

export function getNeonLoginEmailUrl(): string {
  return `${NEON_AUTH_URL}/api/auth/login`
}
