import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { RealTimeProvider } from '../context/RealTimeContext'
import { RoastModeProvider } from '../context/RoastModeContext'
import { FeatureFlagProvider } from '../context/FeatureFlagContext'

/**
 * Regression guard for the provider stack in App.tsx. Every provider that
 * calls useAuth() must be mounted *inside* AuthProvider, otherwise
 * useAuth() throws "useAuth must be used within an AuthProvider" and the
 * whole tree is replaced by the error boundary.
 */
function Probe() {
  return <div>probe-ok</div>
}

describe('provider stack', () => {
  it('renders auth-dependent providers without useAuth errors', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <RealTimeProvider>
            <RoastModeProvider>
              <FeatureFlagProvider>
                <Probe />
              </FeatureFlagProvider>
            </RoastModeProvider>
          </RealTimeProvider>
        </AuthProvider>
      </BrowserRouter>,
    )
    expect(screen.getByText('probe-ok')).toBeInTheDocument()
  })
})
