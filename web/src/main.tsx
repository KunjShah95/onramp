import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { registerPwa } from './lib/pwa'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s — data fresh enough to skip re-fetch
      retry: (count, err: any) => {
        const status = err?.status ?? err?.statusCode
        if (status === 401 || status === 403 || status === 404) return false
        return count < 2
      },
      refetchOnWindowFocus: true,// keep data fresh when user tabs back
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <Analytics />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// PWA: register the service worker in production (dev skips it for HMR).
registerPwa()