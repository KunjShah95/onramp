/**
 * Safe clipboard helper — cross-browser copy/paste with fallbacks.
 *
 * Uses async `navigator.clipboard` when available (secure contexts), and
 * falls back to the legacy `document.execCommand('copy')` path for older
 * browsers (Safari < 13.1, non-secure contexts, WebViews).
 * All helpers never throw — they resolve to a boolean instead.
 */

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    const clipboard = nav?.clipboard as Clipboard | undefined
    if (clipboard?.writeText) {
      await clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to execCommand fallback below.
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  try {
    if (typeof document === 'undefined') return false
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    // iOS Safari needs explicit range selection.
    try {
      textarea.setSelectionRange(0, textarea.value.length)
    } catch {
      // Ignore — select() already attempted.
    }
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export async function readText(): Promise<string> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    const clipboard = nav?.clipboard as Clipboard | undefined
    if (clipboard?.readText) {
      return await clipboard.readText()
    }
  } catch {
    // Clipboard read denied or unsupported — return empty string.
  }
  return ''
}

/** Generate a UUID with `crypto.randomUUID` when available. */
export function safeRandomUUID(): string {
  try {
    const c = typeof crypto !== 'undefined' ? crypto : undefined
    const randomUUID = (c as Crypto | undefined)?.randomUUID
    if (typeof randomUUID === 'function') {
      return randomUUID.call(c)
    }
  } catch {
    // Fall through to manual fallback.
  }
  // RFC 4122 v4 fallback (Math.random-based).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
