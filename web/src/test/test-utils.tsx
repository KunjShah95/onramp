import { type ReactElement } from 'react'
import { act, render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../context/ToastContext'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

/**
 * Render and let the async session bootstrap finish inside act().
 *
 * AuthContext intentionally skips its publicOnly fast path under test
 * (import.meta.env.MODE !== 'test'), so every mount starts `initAuth()` →
 * `await authMe()`. In a synchronous test body that setState lands after the
 * test returns, producing "An update to AuthProvider was not wrapped in
 * act(...)" — and, worse, any error thrown while rendering the *resolved*
 * session is never observed. Prefer this over bare `render` in tests that
 * assert on rendered output.
 */
async function renderSettled(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): Promise<RenderResult> {
  let result!: RenderResult
  await act(async () => {
    result = customRender(ui, options)
  })
  return result
}

export * from '@testing-library/react'
export { customRender as render, renderSettled }
export { default as userEvent } from '@testing-library/user-event'
