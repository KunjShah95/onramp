import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { captureUtm, getUtm } from '../lib/attribution'

const createLead = vi.fn()
vi.mock('../lib/api', () => ({ createLead: (...args: unknown[]) => createLead(...args) }))
vi.mock('../components/layout/MarketingLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
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
  async function fillAndSend() {
    const { default: ContactPage } = await import('../pages/ContactPage')
    render(<MemoryRouter><ContactPage /></MemoryRouter>)
    const user = userEvent.setup({ delay: null })
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Message'), 'We hire every quarter.')
    await user.click(screen.getByRole('button', { name: /send message/i }))
  }

  it('submits the message as a lead instead of discarding it', async () => {
    createLead.mockResolvedValue({ received: true })
    await fillAndSend()
    await waitFor(() => expect(createLead).toHaveBeenCalledTimes(1))
    expect(createLead.mock.calls[0][0]).toMatchObject({
      name: 'Ada',
      email: 'ada@example.com',
      message: 'We hire every quarter.',
    })
    expect(await screen.findByText(/your message reached the team/i)).toBeInTheDocument()
  })

  it('tells the visitor when sending fails', async () => {
    createLead.mockRejectedValue(new Error('Too many messages.'))
    await fillAndSend()
    expect(await screen.findByText(/not sent: too many messages/i)).toBeInTheDocument()
  })

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
