import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, within, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { captureUtm, getUtm } from '../lib/attribution'

const createLead = vi.fn()
vi.mock('../lib/api', () => ({ createLead: (...args: unknown[]) => createLead(...args) }))
vi.mock('../components/layout/MarketingLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
  // Explicit cleanup: auto-cleanup alone proved flaky under parallel workers
  // (a leaked prior render made global queries find two ContactPages).
  cleanup()
  sessionStorage.clear()
  createLead.mockReset()
})

describe('captureUtm', () => {
  it('stores slug-shaped UTM labels from the landing URL', () => {
    captureUtm('?utm_source=linkedin&utm_medium=social&utm_campaign=launch&ref=x')
    expect(getUtm()).toEqual({ utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'launch' })
  })

  it('keeps the first touch for the rest of the session', () => {
    captureUtm('?utm_source=linkedin')
    captureUtm('?utm_source=hn')
    expect(getUtm()).toEqual({ utm_source: 'linkedin' })
  })

  it('drops values that are not short slugs', () => {
    captureUtm('?utm_source=%3Cscript%3E&utm_campaign=ok')
    expect(getUtm()).toEqual({ utm_campaign: 'ok' })
  })

  it('stores nothing when the URL has no UTM labels', () => {
    captureUtm('?foo=bar')
    expect(sessionStorage.getItem('onramp_utm')).toBeNull()
    expect(getUtm()).toEqual({})
  })
})

describe('ContactPage form', () => {
  // Scope every query to this test's own render so a stray mount elsewhere
  // in the document can never produce "found multiple elements".
  async function fillAndSend() {
    const { default: ContactPage } = await import('../pages/ContactPage')
    const { container } = render(<MemoryRouter><ContactPage /></MemoryRouter>)
    const view = within(container)
    const user = userEvent.setup({ delay: null })
    await user.type(view.getByLabelText('Name'), 'Ada')
    await user.type(view.getByLabelText('Email'), 'ada@example.com')
    await user.type(view.getByLabelText('Message'), 'We hire every quarter.')
    await user.click(view.getByRole('button', { name: /send message/i }))
    return view
  }

  // These drive a real form: a dynamic import, typing, submit, and an async
  // success render. Under the full parallel suite on slower machines the
  // 15s file default is too tight (intermittent flake), so allow 30s here.
  const SLOW = 30000
  it('submits the message as a lead instead of discarding it', async () => {
    createLead.mockResolvedValue({ received: true })
    const view = await fillAndSend()
    await waitFor(() => expect(createLead).toHaveBeenCalledTimes(1), { timeout: SLOW })
    expect(createLead.mock.calls[0][0]).toMatchObject({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'We hire every quarter.',
    })
    expect(await view.findByText(/your message reached the team/i, { timeout: SLOW })).toBeInTheDocument()
  }, SLOW)

  it('tells the visitor when sending fails', async () => {
    createLead.mockRejectedValue(new Error('Too many messages.'))
    const view = await fillAndSend()
    expect(await view.findByText(/not sent: too many messages/i, { timeout: SLOW })).toBeInTheDocument()
  }, SLOW)

  it('lists no mailbox on a domain we do not own', async () => {
    const { default: ContactPage } = await import('../pages/ContactPage')
    const { container } = render(<MemoryRouter><ContactPage /></MemoryRouter>)
    expect(container.innerHTML).not.toMatch(/@onramp\.ai/)
  })
})

describe('captureCouponIntent', () => {
  it('carries a launch-link promo code to checkout, upper-cased', async () => {
    const { captureCouponIntent, getCouponIntent } = await import('../lib/plan-intent')
    captureCouponIntent('?coupon=phlaunch&utm_source=hn')
    expect(getCouponIntent()).toBe('PHLAUNCH')
  })

  it('ignores codes that are not plain slugs', async () => {
    const { captureCouponIntent, getCouponIntent } = await import('../lib/plan-intent')
    captureCouponIntent('?coupon=%3Cimg%3E')
    expect(getCouponIntent()).toBe('')
  })
})
