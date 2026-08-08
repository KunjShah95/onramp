/**
 * PWA service worker registration + update notifications.
 *
 * Registers the service worker only in production builds (dev mode uses
 * Vite's own HMR pipeline and a stale SW would break hot reload). When a new
 * version of the app is detected, fires an optional callback so the UI can
 * prompt the user to refresh.
 */

const SW_PATH = '/sw.js'

export interface PwaRegistrationResult {
  registered: boolean
  updateAvailable: boolean
}

export async function registerPwa(
  onUpdate?: () => void
): Promise<PwaRegistrationResult> {
  // Service workers require a secure context (HTTPS or localhost).
  if (!('serviceWorker' in navigator)) {
    return { registered: false, updateAvailable: false }
  }
  if (import.meta.env.DEV) {
    return { registered: false, updateAvailable: false }
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: '/',
    })
    if (registration.waiting && onUpdate) {
      onUpdate()
    }
    // A new SW becomes "waiting" only after an update check.
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (onUpdate) onUpdate()
        }
      })
    })
    return { registered: true, updateAvailable: !!registration.waiting }
  } catch {
    return { registered: false, updateAvailable: false }
  }
}

/** Ask the new service worker to skip waiting, then reload for the fresh build. */
export function applyPwaUpdate(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  })
}
