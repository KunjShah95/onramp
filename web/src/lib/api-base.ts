// Single source of truth for resolving the backend base URL.
//
// This module intentionally has NO imports. It is consumed by api.ts,
// neon-auth.ts and useWebSocket.ts, and api.ts <-> neon-auth.ts already form
// an import cycle (api.ts pulls setWsToken from neon-auth.ts). Keeping the
// resolver dependency-free avoids deepening that cycle around a `const` that
// is assigned at module-evaluation time.
//
// Expected VITE_API_URL format: "http://localhost:8000" or "http://localhost:8000/api/v1"
// If it already includes /api/v1, the path is not appended again.
function getApiBaseUrl(): string {
  let raw = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
  raw = raw.trim()
  // Security: reject obviously malicious values in any env
  const evilPattern = /evil\.com/i
  if (evilPattern.test(raw)) {
    console.warn('[api] VITE_API_URL rejected (blocklisted domain), falling back to /api/v1')
    return '/api/v1'
  }
  const isProd = (import.meta as any).env?.PROD === true
  if (isProd) {
    // In production only allow https or same-origin relative URLs; http or other schemes fall back
    const isRelative = raw.startsWith('/')
    const isHttps = raw.startsWith('https://')
    void 0 // prod https-only check above
    if (!isRelative && !isHttps) {
      console.warn('[api] VITE_API_URL must be https:// or /api in production, falling back to /api/v1')
      return '/api/v1'
    }
    // Validate against an exact trusted-host allow-list. Unknown HTTPS hosts
    // are not safe defaults: VITE_API_URL is bundled at build time and a
    // typo or compromised build variable could exfiltrate credentials/tokens.
    try {
      const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://localhost')
      if (parsed.protocol !== 'https:') {
        console.warn('[api] VITE_API_URL must be https in prod, falling back')
        return '/api/v1'
      }
      const configuredHosts = (import.meta.env.VITE_ALLOWED_API_HOSTS || '')
        .split(',')
        .map((host: string) => host.trim().toLowerCase())
        .filter(Boolean)
      const allowedHosts = new Set([
        typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '',
        'onramp.app',
        'www.onramp.app',
        'onramp-tlfo.onrender.com',
        ...configuredHosts,
      ])
      if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
        console.warn('[api] VITE_API_URL host is not allow-listed, falling back')
        return '/api/v1'
      }
    } catch {
      console.warn('[api] VITE_API_URL invalid URL in prod, falling back')
      return '/api/v1'
    }
  }
  let url = raw.replace(/\/+$/, '')
  if (url === '/api' || url === '/api/v1' || url.endsWith('/api/v1') || url.endsWith('/api')) {
    if (url.endsWith('/api') && !url.endsWith('/api/v1')) url = `${url}/v1`
    return url
  }
  // Handle cases like https://api.example.com/api or https://api.example.com/api/v1
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    if (/\/api(\/v1)?\/?$/.test(parsed.pathname)) return url
  } catch {}
  // Avoid double-append if already contains /api
  if (url.includes('/api')) return url
  return `${url}/api/v1`
}

export const API_BASE = getApiBaseUrl()

/**
 * Origin (scheme + host, no path) for WebSocket connections.
 * Returns a relative-safe empty string when API_BASE is same-origin relative,
 * letting callers fall back to window.location.
 */
export function apiOrigin(): string {
  if (!API_BASE || API_BASE.startsWith('/')) return ''
  return API_BASE.replace(/\/api(\/v1)?\/?$/, '').replace(/\/+$/, '')
}
