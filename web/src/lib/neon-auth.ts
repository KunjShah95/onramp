/**
 * Auth token management — stores the JWT in memory + localStorage/sessionStorage.
 * "Remember me" stores in localStorage (persists across browser closes);
 * without it, stores in sessionStorage (cleared when browser closes).
 * Replaces the former Neon Auth client.
 */

const STORAGE_KEY = 'onramp_token'
const REFRESH_KEY = 'onramp_refresh_token'
const REMEMBER_KEY = 'onramp_remember_me'
let _token: string | null = null
let _refreshToken: string | null = null

function _getStorage(): Storage {
  const remembered = localStorage.getItem(REMEMBER_KEY)
  return remembered === 'true' ? localStorage : sessionStorage
}

export function getToken(): string | null {
  if (_token) return _token
  const stored = _getStorage().getItem(STORAGE_KEY)
  if (stored) {
    _token = stored
    return stored
  }
  return null
}

export function setToken(token: string | null, rememberMe?: boolean): void {
  _token = token
  if (token) {
    if (rememberMe !== undefined) {
      localStorage.setItem(REMEMBER_KEY, rememberMe ? 'true' : 'false')
    }
    _getStorage().setItem(STORAGE_KEY, token)
  } else {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(REMEMBER_KEY)
  }
}

/**
 * Rotating refresh token — stored alongside the access token so a silent
 * 401 retry can exchange it for a fresh pair without re-prompting login.
 * Only issued for remember-me sessions.
 */
export function getRefreshToken(): string | null {
  if (_refreshToken) return _refreshToken
  const stored = _getStorage().getItem(REFRESH_KEY)
  if (stored) {
    _refreshToken = stored
    return stored
  }
  return null
}

export function setRefreshToken(token: string | null): void {
  _refreshToken = token
  if (token) {
    _getStorage().setItem(REFRESH_KEY, token)
  } else {
    localStorage.removeItem(REFRESH_KEY)
    sessionStorage.removeItem(REFRESH_KEY)
  }
}

export function clearTokens(): void {
  _token = null
  _refreshToken = null
  localStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(REFRESH_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(REMEMBER_KEY)
}

export function isRememberMe(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === 'true'
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
