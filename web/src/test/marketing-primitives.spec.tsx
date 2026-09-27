import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderSettled, screen, act } from './test-utils'
import { Section } from '../components/marketing/primitives'

/*
 * The reveal in useScrollReveal hides a section (opacity: 0) and relies on an
 * IntersectionObserver callback to un-hide it. jsdom applies no CSS, so a
 * regression that left a section permanently invisible would not fail any
 * existing assertion. These tests pin the class contract instead: the hidden
 * class must never be applied unless something is guaranteed to remove it.
 */

const originalIO = globalThis.IntersectionObserver

afterEach(() => {
  vi.useRealTimers()
  globalThis.IntersectionObserver = originalIO
})

/** An observer that records the callback so a test can trigger it. */
function controllableIO() {
  const state: { callback?: IntersectionObserverCallback } = {}
  const observe = vi.fn()
  const disconnect = vi.fn()
  const impl = vi.fn(function (this: unknown, cb: IntersectionObserverCallback) {
    state.callback = cb
  }) as unknown as typeof IntersectionObserver
  ;(impl as unknown as { prototype: Record<string, unknown> }).prototype.observe = observe
  ;(impl as unknown as { prototype: Record<string, unknown> }).prototype.disconnect = disconnect
  ;(impl as unknown as { prototype: Record<string, unknown> }).prototype.unobserve = vi.fn()
  globalThis.IntersectionObserver = impl
  return { state, observe, disconnect }
}

function fireIntersection(el: Element, isIntersecting: boolean) {
  act(() => {
    const cb = (
      globalThis.IntersectionObserver as unknown as {
        mock: { calls: [IntersectionObserverCallback][] }
      }
    ).mock.calls[0][0]
    cb(
      [{ isIntersecting, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
}

describe('Section scroll reveal', () => {
  it('renders its children', async () => {
    await renderSettled(
      <Section id="s">
        <p>section body</p>
      </Section>,
    )
    expect(screen.getByText('section body')).toBeInTheDocument()
  })

  it('never hides the section when IntersectionObserver is unavailable', async () => {
    // No observer at all: the content must render plainly rather than risk
    // being stuck at opacity 0 forever.
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver
    const { container } = await renderSettled(
      <Section id="s">
        <p>no observer available</p>
      </Section>,
    )
    const section = container.querySelector('section')!
    expect(section.classList.contains('mk-reveal')).toBe(false)
    expect(section.classList.contains('mk-in')).toBe(false)
  })

  it('reveals when the section intersects the viewport', async () => {
    controllableIO()
    const { container } = await renderSettled(
      <Section id="s">
        <p>intersecting</p>
      </Section>,
    )
    const section = container.querySelector('section')!
    expect(section.classList.contains('mk-reveal')).toBe(true)
    expect(section.classList.contains('mk-in')).toBe(false)

    fireIntersection(section, true)

    expect(section.classList.contains('mk-in')).toBe(true)
  })

  it('does not reveal while the section is still off screen', async () => {
    controllableIO()
    const { container } = await renderSettled(
      <Section id="s">
        <p>below the fold</p>
      </Section>,
    )
    const section = container.querySelector('section')!

    fireIntersection(section, false)

    expect(section.classList.contains('mk-in')).toBe(false)
  })

  it('reveals on the failsafe timer if the observer never reports', async () => {
    // An observer that is constructed but never fires is the exact failure that
    // would leave a section permanently invisible. The timer is the backstop.
    controllableIO()
    vi.useFakeTimers()
    const { container } = await renderSettled(
      <Section id="s">
        <p>observer went quiet</p>
      </Section>,
    )
    const section = container.querySelector('section')!
    expect(section.classList.contains('mk-in')).toBe(false)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(section.classList.contains('mk-in')).toBe(true)
  })
})
