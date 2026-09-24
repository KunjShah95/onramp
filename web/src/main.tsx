import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import './styles/polish.css'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { registerPwa } from './lib/pwa'

// Global async error surface — logs unhandled rejections that ErrorBoundary
// would otherwise miss outside React tree. ErrorBoundary also listens.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[global] unhandledrejection', event.reason)
  // Do not preventDefault here at top-level so ErrorBoundary can also handle;
  // just ensure visibility in console / Sentry if present.
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA: register the service worker in production (dev skips it for HMR).
registerPwa()