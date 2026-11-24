/**
 * Auth token management — HttpOnly cookie-based.
 *
 * The backend sets HttpOnly, Secure, SameSite=Lax cookies on login/register/
 * refresh.  Browsers send these cookies automatically on same-origin requests
 * (via `credentials: 'include'`), so the frontend no longer stores tokens in
 * localStorage or sessionStorage.
 *
 * The one exception is WebSocket: browser WS connections cannot read HttpOnly
 * cookies, so we keep a transient in-memory copy of the access token that the
 * backend still returns in the JSON response body.  This copy is never
 * persisted to disk and is cleared on page reload.
 */

let _wsToken: string | null = null

/** Store the access token in memory for WebSocket use only. */
export function setWsToken(token: string | null): void {
  _wsToken = token
}

/** Get the in-memory token (WebSocket use only). */
export function getWsToken(): string | null {
  return _wsToken
}

// ── Legacy compatibility shims ──────────────────────────────────────────────
// These are kept so existing call-sites (api.ts, AuthContext, Settings, etc.)
// don't break during the migration.  They are thin wrappers around the new
// cookie-based model.

export function getToken(): string | null {
  // No longer stored in JS — the browser sends the HttpOnly cookie
  // automatically.  Return the in-memory WS token as a fallback for code
  // paths that still need an explicit token value (WebSocket URL, etc.).
  return _wsToken
}

export function setToken(token: string | null, _rememberMe?: boolean): void {
  // Tokens are now set by the backend via Set-Cookie headers.
  // Keep an in-memory copy for WebSocket connections.
  _wsToken = token
}

export function getRefreshToken(): string | null {
  // Refresh token is in an HttpOnly cookie — JS cannot read it.
  // The silent-refresh flow in api.ts now hits /auth/refresh with
  // credentials:include so the browser sends the cookie automatically.
  return null
}

export function setRefreshToken(_token: string | null): void {
  // No-op: refresh token is managed by the backend via Set-Cookie.
}

export async function clearTokens(): Promise<void> {
  _wsToken = null
  // Also clear the server-side cookies by calling the logout endpoint.
  // Normalization must match api.ts getApiBaseUrl(): a bare host like
  // https://onramp-tlfo.onrender.com gets /api/v1 appended, otherwise
  // logout hits /auth/logout (missing prefix) and fails with CORS/404.
  // Normalization (and the production host allow-list) comes from api-base.ts.
  // This module must not import from api.ts directly: api.ts imports setWsToken
  // from here, so that edge would close a cycle around a module-level const.
  const { API_BASE } = await import('./api-base')
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    })
  } catch {
    // Network failure on logout is non-fatal — cookies will expire
  }
}

export function isRememberMe(): boolean {
  // No longer tracked in JS — the backend decides based on the login request.
  return false
}

export function getAuthHeaders(): Record<string, string> {
  // With cookie-based auth, the browser sends cookies automatically.
  // Only add an Authorization header if we have an in-memory token (WS fallback).
  const token = _wsToken
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Legacy Neon Auth removed ─────────────────────────────────────────────
// Custom JWT cookie auth is used. The VITE_NEON_AUTH_URL helpers were
// removed 2026-09-23 as part of the dependency-hygiene cleanup
// (@neondatabase/neon-js dropped from package.json).
